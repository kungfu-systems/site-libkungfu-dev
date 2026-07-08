import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import { createSurfaceTimestampPolicy } from "@kungfu-tech/buildchain/surface-manifest";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const fixturesDir = path.join(repoRoot, "src", "fixtures");
const require = createRequire(import.meta.url);

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readFixtureJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function readOptionalJsonFile(file) {
  return fs.existsSync(file) ? readJsonFile(file) : undefined;
}

function readPackageJson(specifier) {
  return readJsonFile(require.resolve(specifier));
}

function readPackageText(specifier) {
  return fs.readFileSync(require.resolve(specifier), "utf8");
}

function packageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

function readPnpmLockPackage(packageName, version) {
  const lockText = fs.readFileSync(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '${escapedName}@${escapedVersion}':\\n(?:    .+\\n)*?    resolution: \\{integrity: ([^}]+)\\}`, "m");
  const match = lockText.match(pattern);
  if (!match) {
    throw new Error(`pnpm-lock.yaml missing ${packageName}@${version}`);
  }
  return {
    version,
    integrity: match[1].trim(),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relativePath, content) {
  const target = path.join(distDir, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function splitTableRow(line) {
  const trimmed = line.trim();
  const body = trimmed.startsWith("|") && trimmed.endsWith("|")
    ? trimmed.slice(1, -1)
    : trimmed;
  return body.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableRow(line) {
  return line.includes("|") && splitTableRow(line).length > 1;
}

function isMarkdownTableBlock(content) {
  const lines = String(content).split(/\r?\n/).filter((line) => line.trim());
  return lines.length >= 2 && isTableRow(lines[0]) && isTableSeparator(lines[1]);
}

function slugifyHeading(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return encodeURIComponent(slug || "section");
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
  .enable("table")
  .use(markdownItAnchor, {
    level: [1, 2, 3, 4],
    slugify: slugifyHeading,
  });

const defaultFenceRule = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0];
  if (language === "markdown" && isMarkdownTableBlock(token.content)) {
    return markdown.render(token.content, env);
  }
  return defaultFenceRule(tokens, index, options, env, self);
};

markdown.renderer.rules.table_open = (tokens, index, options, env, self) =>
  `<div class="table-wrap">${self.renderToken(tokens, index, options)}`;
markdown.renderer.rules.table_close = (tokens, index, options, env, self) =>
  `${self.renderToken(tokens, index, options)}</div>\n`;

function headingText(token) {
  if (!token?.children) return token?.content || "";
  return token.children
    .filter((child) => child.type === "text" || child.type === "code_inline")
    .map((child) => child.content)
    .join("");
}

function renderToc(toc, ariaLabel = "Page sections", extraLinks = []) {
  const title = ariaLabel;
  const links = [
    ...toc.map(
      (entry) => `<a class="toc-level-${entry.level}" href="#${escapeAttr(entry.id)}">${escapeHtml(entry.title)}</a>`,
    ),
    ...extraLinks.map(
      (entry) => `<a class="${escapeAttr(entry.className || "toc-related-link")}" href="${escapeAttr(entry.href)}">${escapeHtml(entry.title)}</a>`,
    ),
  ];
  if (links.length === 0) {
    return `<aside class="doc-toc" aria-label="${escapeAttr(ariaLabel)}">
      <h2>${escapeHtml(title)}</h2>
      <p>No sections found.</p>
    </aside>`;
  }
  return `<aside class="doc-toc" aria-label="${escapeAttr(ariaLabel)}">
    <h2>${escapeHtml(title)}</h2>
    <nav>${links.join("")}</nav>
  </aside>`;
}

function renderDecisionMarkdown(source, tocLabel = "Decision sections", options = {}) {
  const env = {};
  const tokens = markdown.parse(String(source), env);
  const toc = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const sourceLevel = Number(token.tag.slice(1));
    const renderedLevel = Math.min(sourceLevel + 1, 4);
    const title = headingText(tokens[index + 1]);
    const id = token.attrGet("id");
    token.tag = `h${renderedLevel}`;
    if (tokens[index + 2]?.type === "heading_close") {
      tokens[index + 2].tag = `h${renderedLevel}`;
    }
    if (id && title) {
      toc.push({ id, title, level: renderedLevel });
    }
  }

  return {
    html: markdown.renderer.render(tokens, markdown.options, env),
    tocHtml: renderToc(toc, tocLabel, options.tocLinks || []),
  };
}

function rewritePackageMarkdownLinks(source, repositoryPath, options = {}) {
  const filePattern = options.filePattern || /.+/;
  return String(source).replace(/\]\((?!https?:\/\/|\/|#)([^)\s)]+)(#[^)]+)?\)/g, (_match, target, hash = "") => {
    const cleanTarget = target.replace(/^\.\//, "");
    if (!filePattern.test(cleanTarget)) {
      return `](${target}${hash})`;
    }
    return `](https://github.com/${repositoryPath}/blob/main/${cleanTarget}${hash})`;
  });
}

function renderMarkdownBody(source) {
  return markdown.render(rewritePackageMarkdownLinks(source, "kungfu-systems/kfd", { filePattern: /\.md$/ }));
}

function renderBuildchainMarkdownBody(source) {
  return markdown.render(rewritePackageMarkdownLinks(source, "kungfu-systems/buildchain"));
}

function rewriteBuildchainHostedBadgeLinks(source) {
  return String(source)
    .replace(/<!--\s*buildchain:badges:(?:start|end)\s*-->/g, "")
    .replaceAll("https://buildchain.libkungfu.dev/badges/v1/", surfaceEndpointHref("buildchain", "badges/v1/"));
}

function renderBuildchainLead(source) {
  return markdown.render(rewriteBuildchainHostedBadgeLinks(source));
}

function buildchainPageDescription() {
  return buildchainSite.homepage.mechanismSummary?.[0] || "Buildchain Release Passport and release infrastructure for Kungfu products.";
}

function normalizeBuildchainRoute(route) {
  const normalized = `/${String(route || "/").replace(/^\/+/, "")}`.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function buildchainRouteSegments(route) {
  const normalized = normalizeBuildchainRoute(route);
  return normalized === "/" ? [] : normalized.slice(1).split("/");
}

function buildchainRouteOutputPath(route) {
  const segments = buildchainRouteSegments(route);
  return path.posix.join("buildchain", ...segments, "index.html");
}

function buildchainRouteHrefFrom(currentRoute, targetRoute, hash = "") {
  const currentDir = buildchainRouteSegments(currentRoute).join("/");
  const targetDir = buildchainRouteSegments(targetRoute).join("/");
  let relative = path.posix.relative(currentDir || ".", targetDir || ".");
  if (!relative || relative === ".") {
    relative = ".";
  }
  if (relative !== "." && !relative.endsWith("/")) {
    relative += "/";
  }
  if (relative === ".") {
    relative = "./";
  }
  return `${relative}${hash}`;
}

function buildchainCanonicalPath(route) {
  const normalized = normalizeBuildchainRoute(route);
  return normalized === "/" ? "/" : `${normalized}/`;
}

function surfaceSitePath(id) {
  const paths = {
    hub: "/",
    core: "/core/",
    buildchain: "/buildchain/",
    kfd: "/kfd/",
  };
  if (!paths[id]) {
    throw new Error(`unknown site surface id: ${id}`);
  }
  return paths[id];
}

function surfaceCanonicalHref(id) {
  const previewAlias = (process.env.SITE_PREVIEW_ALIAS || process.env.BUILDCHAIN_PREVIEW_ALIAS || "").trim();
  const channel = (process.env.SITE_SURFACE_CHANNEL || process.env.BUILDCHAIN_SURFACE_CHANNEL || "production").trim();
  const hrefsByChannel = {
    production: {
      hub: "https://libkungfu.dev/",
      core: "https://core.libkungfu.dev/",
      buildchain: "https://buildchain.libkungfu.dev/",
      kfd: "https://kfd.libkungfu.dev/",
    },
    staging: {
      hub: "https://staging.libkungfu.dev/",
      core: "https://core.staging.libkungfu.dev/",
      buildchain: "https://buildchain.staging.libkungfu.dev/",
      kfd: "https://kfd.staging.libkungfu.dev/",
    },
  };
  if (channel === "preview" && previewAlias) {
    hrefsByChannel.preview = {
      hub: `https://${previewAlias}.preview.libkungfu.dev/`,
      core: `https://core-${previewAlias}.preview.libkungfu.dev/`,
      buildchain: `https://buildchain-${previewAlias}.preview.libkungfu.dev/`,
      kfd: `https://kfd-${previewAlias}.preview.libkungfu.dev/`,
    };
  }
  const hrefs = hrefsByChannel[channel] || hrefsByChannel.production;
  if (!hrefs[id]) {
    throw new Error(`unknown site surface id: ${id}`);
  }
  return hrefs[id];
}

function surfaceCanonicalHost(id) {
  return new URL(surfaceCanonicalHref(id)).host;
}

function surfaceEndpointHref(id, pathPart = "") {
  return new URL(pathPart, surfaceCanonicalHref(id)).toString();
}

function surfaceLinkAttrs(id) {
  return `href="${escapeAttr(surfaceCanonicalHref(id))}" data-local-href="${escapeAttr(surfaceSitePath(id))}"`;
}

function assertBadgeSlug(value, label) {
  const slug = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`invalid Buildchain badge ${label}: ${value}`);
  }
  return slug;
}

const buildchainBadgeEndpointRegistryContracts = new Set([
  "kungfu-buildchain-badge-endpoint-registry",
  "kungfu-buildchain-readme-badge-endpoint-registry",
]);

function buildchainDistSiteRoot() {
  return path.join(packageRoot("@kungfu-tech/buildchain"), "dist", "site");
}

function readBuildchainBadgeEndpointSource() {
  const upstreamRoot = buildchainDistSiteRoot();
  const upstreamRegistryPath = path.join(upstreamRoot, "badge-endpoint-registry.json");
  if (fs.existsSync(upstreamRegistryPath)) {
    return {
      kind: "upstream-package",
      root: upstreamRoot,
      registryPath: upstreamRegistryPath,
      registry: readJsonFile(upstreamRegistryPath),
      source: `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/badge-endpoint-registry.json`,
    };
  }
  const fixtureRegistryPath = path.join(fixturesDir, "buildchain-badge-endpoint-registry.json");
  return {
    kind: "fixture",
    root: fixturesDir,
    registryPath: fixtureRegistryPath,
    registry: readJsonFile(fixtureRegistryPath),
    source: "src/fixtures/buildchain-badge-endpoint-registry.json",
  };
}

function badgePayloadRelativePath(badge, state) {
  const template = badge.payloadPath || `badges/v1/${badge.id}/{state}.json`;
  return template.replaceAll("{badge}", badge.id).replaceAll("{state}", state);
}

function badgeStateName(rawState) {
  return typeof rawState === "string" ? rawState : rawState?.state;
}

function badgeStatePayloadPath(badge, state, rawState) {
  if (rawState && typeof rawState === "object" && rawState.path) {
    return rawState.path;
  }
  return badgePayloadRelativePath(badge, state);
}

function generatedFixtureBadgePayload(registry, badge, state) {
  const stateDefaults = registry.stateDefaults?.[state] || {};
  return {
    schemaVersion: 1,
    label: badge.label || badge.id,
    message: stateDefaults.message || state,
    color: stateDefaults.color || "4a5568",
    logoPolicy: registry.logoPolicy || { placeholder: "buildchain-monogram" },
  };
}

function normalizeBadgePayload(registry, badge, state, payload) {
  const normalized = {
    ...payload,
    schemaVersion: Number(payload.schemaVersion || 1),
    label: String(payload.label || badge.label || badge.id),
    message: String(payload.message || state),
    color: String(payload.color || registry.stateDefaults?.[state]?.color || "4a5568").replace(/^#/, ""),
    logoPolicy: payload.logoPolicy || registry.logoPolicy || { placeholder: "buildchain-monogram" },
  };
  if (!/^[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(normalized.color)) {
    throw new Error(`invalid Buildchain badge color for ${badge.id}/${state}: ${normalized.color}`);
  }
  return normalized;
}

function badgeColorForState(registry, state) {
  const stateDefault = registry.stateDefaults?.[state]?.color;
  if (stateDefault) {
    return stateDefault;
  }
  for (const badge of registry.badges || []) {
    for (const rawState of badge.states || []) {
      if (badgeStateName(rawState) === state && rawState?.payload?.color) {
        return rawState.payload.color;
      }
    }
  }
  return "4a5568";
}

function kfdBadgeMessageTemplate(entry) {
  const title = String(entry.title || "").toLowerCase();
  if (title.includes("timeline") && title.includes("observer")) {
    return "timeline observer {state}";
  }
  return `${String(entry.id || `KFD-${entry.number}`).toUpperCase()} {state}`;
}

function buildKfdBadgeEntry(registry, entry) {
  const badgeId = assertBadgeSlug(`kfd-${entry.number}`, "id");
  const label = String(entry.id || `KFD-${entry.number}`).toUpperCase();
  const messageTemplate = kfdBadgeMessageTemplate(entry);
  const logoPolicy = registry.logoPolicy || { placeholder: "buildchain-monogram" };
  const states = registry.supportedStates || ["passed", "aligned", "declared", "planned", "draft", "downgraded", "failed", "missing"];
  return {
    id: badgeId,
    label,
    messageTemplate,
    linkRole: "repository-release-passport",
    source: `@kungfu-tech/kfd@${kfdPackage.version}/registry.json#${badgeId}`,
    states: states.map((state) => ({
      state,
      path: `badges/v1/${badgeId}/${state}.json`,
      svgPath: `badges/v1/${badgeId}/${state}.svg`,
      source: `@kungfu-tech/kfd@${kfdPackage.version}/registry.json#${badgeId}/${state}`,
      payload: {
        schemaVersion: 1,
        label,
        message: messageTemplate.replaceAll("{state}", state),
        color: badgeColorForState(registry, state),
        logoPolicy,
      },
    })),
  };
}

function badgeRegistryWithKfdEntries(registry) {
  const badges = Array.isArray(registry.badges) ? [...registry.badges] : [];
  const knownBadgeIds = new Set(badges.map((badge) => badge.id));
  const added = [];
  for (const entry of kfdRegistry.entries || []) {
    const badgeId = `kfd-${entry.number}`;
    if (knownBadgeIds.has(badgeId)) {
      continue;
    }
    const badge = buildKfdBadgeEntry(registry, entry);
    badges.push(badge);
    knownBadgeIds.add(badgeId);
    added.push({
      badge: badge.id,
      source: badge.source,
    });
  }
  return {
    ...registry,
    badges,
    siteAugmentations: [
      ...(registry.siteAugmentations || []),
      ...added.map((entry) => ({
        contract: "libkungfu-dev-kfd-badge-registry-augmentation",
        reason: "KFD registry contains a decision that is not yet present in the Buildchain badge endpoint registry.",
        ...entry,
      })),
    ],
  };
}

function readBadgePayload(source, badge, state, rawState) {
  if (rawState && typeof rawState === "object" && rawState.payload) {
    const relativePath = badgeStatePayloadPath(badge, state, rawState);
    const payloadSource = rawState.source || badge.source;
    return {
      payload: normalizeBadgePayload(source.registry, badge, state, rawState.payload),
      source: payloadSource || (source.kind === "upstream-package"
        ? `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/${relativePath}#payload`
        : `${source.source}#payload:${badge.id}/${state}`),
    };
  }
  const relativePath = badgeStatePayloadPath(badge, state, rawState);
  const payloadPath = path.join(source.root, relativePath);
  if (fs.existsSync(payloadPath)) {
    return {
      payload: normalizeBadgePayload(source.registry, badge, state, readJsonFile(payloadPath)),
      source: source.kind === "upstream-package"
        ? `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/${relativePath}`
        : path.posix.join("src/fixtures", relativePath),
    };
  }
  if (source.kind === "fixture") {
    return {
      payload: normalizeBadgePayload(source.registry, badge, state, generatedFixtureBadgePayload(source.registry, badge, state)),
      source: `${source.source}#generated:${badge.id}/${state}`,
    };
  }
  throw new Error(`Buildchain badge payload missing from package: ${relativePath}`);
}

function badgeTextWidth(value) {
  return Math.max(34, String(value).length * 7 + 16);
}

function renderBuildchainMonogram(x, y) {
  return `<g aria-hidden="true">
    <rect x="${x}" y="${y}" width="18" height="18" rx="3" fill="#111827" opacity="0.28"/>
    <path d="M${x + 4} ${y + 13} L${x + 4} ${y + 5} L${x + 8} ${y + 9} L${x + 12} ${y + 5} L${x + 14} ${y + 7} L${x + 10} ${y + 11} L${x + 14} ${y + 15} L${x + 12} ${y + 17} L${x + 8} ${y + 13} L${x + 4} ${y + 17} Z" fill="#ffffff"/>
  </g>`;
}

function renderBadgeSvg(payload) {
  const label = payload.label;
  const message = payload.message;
  const hasMonogram = payload.logoPolicy?.placeholder === "buildchain-monogram";
  const logoWidth = hasMonogram ? 24 : 0;
  const labelWidth = badgeTextWidth(label) + logoWidth;
  const messageWidth = badgeTextWidth(message);
  const width = labelWidth + messageWidth;
  const labelTextX = 8 + logoWidth;
  const messageTextX = labelWidth + messageWidth / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" role="img" aria-label="${escapeXml(`${label}: ${message}`)}">
  <title>${escapeXml(`${label}: ${message}`)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".16"/>
    <stop offset="1" stop-color="#000" stop-opacity=".10"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="28" rx="5"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="28" fill="#344054"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="28" fill="#${escapeXml(payload.color)}"/>
    <rect width="${width}" height="28" fill="url(#s)"/>
  </g>
  ${hasMonogram ? renderBuildchainMonogram(5, 5) : ""}
  <g fill="#fff" text-anchor="start" font-family="Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" font-weight="700">
    <text x="${labelTextX}" y="18">${escapeXml(label)}</text>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" font-weight="700">
    <text x="${messageTextX}" y="18">${escapeXml(message)}</text>
  </g>
</svg>
`;
}

function renderBuildchainBadgeEndpoints() {
  const source = readBuildchainBadgeEndpointSource();
  const registry = badgeRegistryWithKfdEntries(source.registry);
  if (!buildchainBadgeEndpointRegistryContracts.has(registry.contract)) {
    throw new Error("Buildchain badge endpoint registry contract mismatch");
  }
  const version = assertBadgeSlug(registry.version || "v1", "version");
  const badges = Array.isArray(registry.badges) ? registry.badges : [];
  if (badges.length === 0) {
    throw new Error("Buildchain badge endpoint registry must declare badges");
  }
  const endpointRegistry = { ...registry, version };
  const rendered = [];
  for (const badge of badges) {
    const badgeId = assertBadgeSlug(badge.id, "id");
    const states = Array.isArray(badge.states) && badge.states.length > 0
      ? badge.states
      : registry.supportedStates || [];
    for (const rawState of states) {
      const state = assertBadgeSlug(badgeStateName(rawState), "state");
      const { payload, source: payloadSource } = readBadgePayload(source, { ...badge, id: badgeId }, state, rawState);
      const endpointPath = `badges/${version}/${badgeId}/${state}`;
      const jsonContent = `${JSON.stringify({
        ...payload,
        buildchain: {
          badge: badgeId,
          state,
          source: payloadSource,
          logoPolicy: payload.logoPolicy,
        },
      }, null, 2)}\n`;
      const svgContent = renderBadgeSvg(payload);
      writeFile(`${endpointPath}.json`, jsonContent);
      writeFile(`${endpointPath}.svg`, svgContent);
      writeFile(`buildchain/${endpointPath}.json`, jsonContent);
      writeFile(`buildchain/${endpointPath}.svg`, svgContent);
      rendered.push({
        badge: badgeId,
        state,
        host: surfaceCanonicalHost("buildchain"),
        path: `/${endpointPath}.svg`,
        jsonPath: `/${endpointPath}.json`,
        deployedPaths: [
          `/${endpointPath}.svg`,
          `/buildchain/${endpointPath}.svg`,
        ],
        source: payloadSource,
      });
    }
  }
  writeFile(`badges/${version}/badge-endpoint-registry.json`, `${JSON.stringify(endpointRegistry, null, 2)}\n`);
  writeFile(`buildchain/badges/${version}/badge-endpoint-registry.json`, `${JSON.stringify(endpointRegistry, null, 2)}\n`);
  return {
    source,
    registry: endpointRegistry,
    version,
    rendered,
  };
}

function page({ title, description, current, body, alternates = "" }) {
  const nav = [
    ["core", "Core"],
    ["buildchain", "Buildchain"],
    ["kfd", "KFD"],
  ];

  const navHtml = nav
    .map(([id, label]) => {
      const active = id === current ? ' aria-current="page"' : "";
      return `<a ${surfaceLinkAttrs(id)}${active}>${escapeHtml(label)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/json" title="libkungfu.dev manifest" href="/manifest.json">
  <link rel="alternate" type="text/plain" title="Agent entrypoint" href="/llms.txt">
  <link rel="alternate" type="text/plain" title="Full agent index" href="/llms-full.txt">
${alternates}
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f5f7f8;
      --fg: #14171a;
      --muted: #5b6470;
      --line: #cbd5df;
      --soft: #ffffff;
      --accent: #0f766e;
      --accent-strong: #0b4f4a;
      --warn: #925a16;
      --code: #eef2f3;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1214;
        --fg: #eef3f6;
        --muted: #a8b2bd;
        --line: #33404a;
        --soft: #171c20;
        --accent: #47c9ba;
        --accent-strong: #83ded3;
        --warn: #e2b15b;
        --code: #20272d;
      }
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--fg);
    }

    a {
      color: var(--accent-strong);
      text-decoration-thickness: 1px;
      text-underline-offset: 4px;
    }

    code {
      border: 1px solid var(--line);
      background: var(--code);
      padding: 1px 5px;
      border-radius: 4px;
      font: 0.92em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-wrap: anywhere;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--soft) 88%, transparent);
    }

    .bar {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }

    .brand {
      color: var(--fg);
      font-weight: 700;
      letter-spacing: 0;
      text-decoration: none;
    }

    .brand:hover {
      color: var(--accent-strong);
    }

    nav {
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }

    nav a {
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
    }

    nav a[aria-current="page"] {
      color: var(--fg);
      font-weight: 700;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 64px 0 72px;
    }

    .hero {
      display: grid;
      gap: 22px;
      margin-bottom: 48px;
    }

    .visual {
      display: block;
      width: 100%;
      max-width: 960px;
      height: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
    }

    .substrate-map {
      position: relative;
      aspect-ratio: 960 / 360;
      overflow: hidden;
    }

    .substrate-map img {
      display: block;
      width: 100%;
      height: 100%;
    }

    .map-hotspot {
      position: absolute;
      border-radius: 8px;
    }

    .map-hotspot:hover,
    .map-hotspot:focus-visible {
      background: rgb(15 118 110 / 0.08);
      outline: 3px solid var(--accent);
      outline-offset: 3px;
    }

    .map-hotspot.kfd {
      left: 4.375%;
      top: 26.667%;
      width: 17.917%;
      height: 35%;
    }

    .map-hotspot.buildchain {
      left: 28.333%;
      top: 26.667%;
      width: 19.583%;
      height: 35%;
    }

    .map-hotspot.core {
      left: 53.958%;
      top: 26.667%;
      width: 17.917%;
      height: 35%;
    }

    .map-hotspot.products {
      left: 77.917%;
      top: 26.667%;
      width: 17.708%;
      height: 35%;
    }

    .eyebrow {
      margin: 0;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .eyebrow a {
      color: inherit;
      text-decoration-thickness: 1px;
      text-underline-offset: 4px;
    }

    .page-kicker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      width: 100%;
    }

    .page-kicker-state {
      color: var(--muted);
      margin-left: auto;
      text-align: right;
    }

    h1 {
      margin: 0;
      max-width: 920px;
      font-size: clamp(40px, 6vw, 72px);
      line-height: 0.98;
      letter-spacing: 0;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    h3 {
      margin: 0 0 8px;
      font-size: 18px;
      line-height: 1.25;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: var(--muted);
    }

    .lead {
      max-width: 820px;
      color: var(--fg);
      font-size: 22px;
      line-height: 1.35;
    }

    .badge-strip {
      max-width: 100%;
    }

    .badge-strip p {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge-strip img {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .grid.three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
      padding: 20px;
      min-width: 0;
    }

    .stack {
      display: grid;
      gap: 18px;
    }

    .mechanism-chain {
      counter-reset: mechanism-step;
      grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    }

    .mechanism-step {
      display: grid;
      grid-row: span 5;
      grid-template-rows: subgrid;
      gap: 14px;
      align-content: stretch;
    }

    .mechanism-step::before {
      counter-increment: mechanism-step;
      content: counter(mechanism-step, decimal-leading-zero);
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    .mechanism-step h3 {
      margin-bottom: 0;
      min-height: 2.6em;
    }

    .mechanism-step h3 a {
      color: inherit;
      text-decoration-color: var(--muted);
      text-decoration-thickness: 1px;
      text-underline-offset: 0.18em;
    }

    .mechanism-step h3 a:hover {
      color: var(--accent);
      text-decoration-color: currentColor;
    }

    .mechanism-role {
      color: var(--fg);
      font-weight: 700;
    }

    .mechanism-step .card-action {
      align-self: end;
      margin-top: 0;
    }

    .future-products {
      margin-top: 18px;
    }

    .future-products h2 {
      margin-bottom: 10px;
    }

    .foundation-model-list {
      margin-top: 18px;
      grid-template-rows: auto auto auto;
    }

    .foundation-layer {
      display: grid;
      grid-row: span 3;
      grid-template-rows: subgrid;
      gap: 14px;
      align-content: stretch;
    }

    .foundation-layer h3 {
      margin-bottom: 0;
    }

    .foundation-triad-card h3 a,
    .foundation-layer h3 a {
      color: inherit;
      text-decoration-color: var(--muted);
      text-decoration-thickness: 1px;
      text-underline-offset: 0.18em;
    }

    .foundation-triad-card h3 a:hover,
    .foundation-layer h3 a:hover {
      color: var(--accent);
      text-decoration-color: currentColor;
    }

    .foundation-commitment {
      align-self: start;
    }

    .foundation-fields {
      display: grid;
      gap: 12px;
      margin: 0;
    }

    .foundation-fields div {
      display: grid;
      grid-template-columns: 82px minmax(0, 1fr);
      gap: 10px 12px;
      align-items: start;
    }

    .foundation-fields dt {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .foundation-fields dd {
      margin: 0;
      min-width: 0;
    }

    .foundation-fields p {
      color: var(--fg);
    }

    .decision-card {
      display: grid;
      grid-row: span 4;
      grid-template-rows: subgrid;
      gap: 14px;
      align-content: start;
    }

    .kfd-decision-list,
    .practice-guideline-list {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      grid-template-rows: auto minmax(6.5em, auto) auto auto;
    }

    .decision-card h3 {
      margin-bottom: 0;
    }

    .decision-summary {
      align-self: start;
    }

    .decision-meta {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 10px 12px;
      margin: 0;
    }

    .decision-meta dt {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .decision-meta dd {
      margin: 0;
      min-width: 0;
    }

    .meta {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 10px 18px;
      margin: 0;
    }

    .meta dt {
      color: var(--muted);
    }

    .meta dd {
      margin: 0;
      min-width: 0;
    }

    .table-wrap {
      overflow-x: auto;
      margin: 18px 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 620px;
    }

    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    th {
      color: var(--fg);
      background: color-mix(in srgb, var(--code) 70%, transparent);
      font-weight: 700;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .doc-layout {
      display: grid;
      grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
      margin-top: 18px;
    }

    .doc-sidebar {
      position: sticky;
      top: 18px;
      display: grid;
      gap: 14px;
      max-height: calc(100vh - 36px);
      overflow: auto;
    }

    .doc-toc,
    .doc-global-nav {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
      padding: 16px;
    }

    .doc-global-nav {
      display: grid;
      gap: 8px;
    }

    .doc-toc {
      position: sticky;
      top: 18px;
    }

    .doc-sidebar .doc-toc {
      position: static;
      top: auto;
    }

    .doc-toc h2,
    .doc-global-nav h2 {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.2;
    }

    .doc-toc nav,
    .doc-nav-group {
      display: grid;
      gap: 8px;
    }

    .doc-nav-group + .doc-nav-group {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }

    .doc-nav-heading {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .doc-toc a,
    .doc-global-nav a {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.35;
      text-decoration: none;
    }

    .doc-toc a:hover,
    .doc-toc a:focus,
    .doc-global-nav a:hover,
    .doc-global-nav a:focus,
    .doc-global-nav a[aria-current="page"] {
      color: var(--accent-strong);
      text-decoration: underline;
      text-underline-offset: 4px;
    }

    .doc-toc .toc-related-link {
      margin-top: 6px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      color: var(--text);
      font-weight: 750;
    }

    .doc-global-nav .doc-nav-child {
      margin: -2px 0 2px 14px;
      padding-left: 12px;
      border-left: 2px solid var(--line);
      font-size: 13px;
    }

    .doc-global-nav .doc-nav-child[aria-current="page"] {
      border-left-color: var(--accent);
      font-weight: 750;
    }

    .doc-page-sections {
      display: grid;
      gap: 6px;
      margin: 2px 0 2px 10px;
      padding-left: 10px;
      border-left: 1px solid var(--line);
    }

    .doc-page-sections a {
      font-size: 13px;
    }

    .toc-level-3 {
      padding-left: 12px;
    }

    .toc-level-4 {
      padding-left: 24px;
    }

    .doc-content {
      min-width: 0;
    }

    .doc-content h2,
    .doc-content h3,
    .doc-content h4 {
      scroll-margin-top: 18px;
    }

    .doc-content h2:not(:first-child),
    .doc-content h3:not(:first-child),
    .doc-content h4:not(:first-child) {
      margin-top: 28px;
    }

    .doc-content p,
    .doc-content li {
      color: var(--fg);
    }

    .doc-content p + p,
    .doc-content p + ul,
    .doc-content p + ol,
    .doc-content ul + p,
    .doc-content ol + p {
      margin-top: 14px;
    }

    .doc-content ul,
    .doc-content ol {
      margin: 14px 0 0;
      color: var(--fg);
    }

    .doc-content pre {
      overflow-x: auto;
      margin: 18px 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--code);
      padding: 14px 16px;
    }

    .doc-content pre code {
      border: 0;
      background: transparent;
      padding: 0;
      border-radius: 0;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 10px;
      color: var(--muted);
      font-size: 13px;
    }

    .card-action {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      margin-top: 16px;
      font-weight: 700;
    }

    .warning {
      border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
    }

    .warning strong {
      color: var(--warn);
    }

    ul {
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
    }

    li + li {
      margin-top: 8px;
    }

    footer {
      border-top: 1px solid var(--line);
      color: var(--muted);
      padding: 24px 0;
      font-size: 14px;
    }

    footer div {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      display: grid;
      gap: 8px;
    }

    footer p {
      margin: 0;
    }

    @media (max-width: 820px) {
      .bar {
        align-items: flex-start;
        flex-direction: column;
        padding: 18px 0;
      }

      main {
        padding-top: 42px;
      }

      .grid,
      .grid.three {
        grid-template-columns: 1fr;
      }

      .meta {
        grid-template-columns: 1fr;
      }

      .foundation-layer h3,
      .mechanism-step h3,
      .foundation-commitment,
      .decision-summary {
        min-height: 0;
      }

      .foundation-layer,
      .decision-card,
      .mechanism-step {
        grid-row: auto;
        grid-template-rows: none;
      }

      .mechanism-chain,
      .kfd-decision-list,
      .practice-guideline-list {
        grid-template-rows: none;
      }

      .doc-layout {
        grid-template-columns: 1fr;
      }

      .doc-sidebar {
        position: static;
        max-height: none;
        overflow: visible;
      }

      .doc-toc {
        position: static;
      }
    }

    @media (max-width: 480px) {
      .foundation-fields div,
      .decision-meta {
        grid-template-columns: 1fr;
      }

      .foundation-fields div {
        gap: 4px;
      }

      .decision-meta {
        gap: 4px 0;
      }

      .decision-meta dd + dt {
        margin-top: 8px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <a class="brand" ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">libkungfu.dev</a>
      <nav aria-label="Primary">${navHtml}</nav>
    </div>
  </header>
  <main>${body}</main>
  <footer>
    <div>
      <p>&copy; 2026 Kungfu Origin Technology Limited.</p>
      <p>Open developer and agent substrate hub. Facts come from upstream packages and pinned release artifacts.</p>
      <p>Open-source components are governed by their repository and package licenses. Public collaboration starts on <a href="https://github.com/kungfu-systems">kungfu-systems on GitHub</a>.</p>
    </div>
  </footer>
  <script>
    (() => {
      const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
      if (!localHosts.has(window.location.hostname)) return;
      for (const link of document.querySelectorAll("[data-local-href]")) {
        link.setAttribute("href", link.getAttribute("data-local-href"));
      }
    })();
  </script>
</body>
</html>
`;
}

function kfdSurfaceAlternates() {
  return `  <link rel="alternate" type="application/json" title="KFD agent manifest" href="${escapeAttr(surfaceEndpointHref("kfd", "manifest.json"))}">
  <link rel="alternate" type="text/plain" title="KFD agent entrypoint" href="${escapeAttr(surfaceEndpointHref("kfd", "llms.txt"))}">
  <link rel="alternate" type="application/json" title="KFD registry" href="${escapeAttr(surfaceEndpointHref("kfd", "registry.json"))}">
  <link rel="alternate" type="application/json" title="KFD standards" href="${escapeAttr(surfaceEndpointHref("kfd", "standards.json"))}">`;
}

function surfaceCard(surface) {
  return `<article class="panel stack">
    <div class="tag">${escapeHtml(surface.host)}</div>
    <div>
      <h3>${escapeHtml(surface.label)}</h3>
      <p>${escapeHtml(surface.summary)}</p>
    </div>
    <dl class="meta">
      <dt>Source</dt>
      <dd><code>${escapeHtml(surface.source)}</code></dd>
      <dt>Route</dt>
      <dd><a href="${escapeAttr(surface.path)}">${escapeHtml(surface.path)}</a></dd>
    </dl>
  </article>`;
}

function surfaceById(id) {
  const surface = site.surfaces.find((entry) => entry.id === id);
  if (!surface) {
    throw new Error(`site surface not found: ${id}`);
  }
  return surface;
}

function mechanismStepCard(step) {
  const surface = surfaceById(step.surface);
  const actionLabel =
    surface.id === "kfd"
      ? "Open KFD"
      : surface.id === "buildchain"
        ? "Open Buildchain"
        : surface.id === "core"
          ? "Open Core"
          : `Open ${surface.label}`;
  return `<article class="panel mechanism-step">
    <div class="tag">${escapeHtml(surface.host)}</div>
    <div>
      <h3><a ${surfaceLinkAttrs(surface.id)}>${escapeHtml(surface.label)}</a></h3>
      <p class="mechanism-role">${escapeHtml(step.role)}</p>
    </div>
    <p>${escapeHtml(step.summary)}</p>
    <a class="card-action" ${surfaceLinkAttrs(surface.id)}>${escapeHtml(actionLabel)}</a>
  </article>`;
}

function listPanels(items) {
  return items
    .map(
      (item) => `<article class="panel">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
      </article>`,
    )
    .join("\n");
}

function factPanels(items, getTitle, getSummary, getMeta = () => []) {
  return items
    .map((item) => {
      const meta = getMeta(item);
      const metaHtml = meta.length
        ? `<dl class="meta" style="margin-top: 14px;">${meta
            .map(
              ([label, value]) => `<dt>${escapeHtml(label)}</dt>
                <dd><code>${escapeHtml(value)}</code></dd>`,
            )
            .join("")}</dl>`
        : "";
      return `<article class="panel">
        <h3>${escapeHtml(getTitle(item))}</h3>
        <p>${escapeHtml(getSummary(item))}</p>
        ${metaHtml}
      </article>`;
    })
    .join("\n");
}

function foundationModelPanels(layers) {
  return layers
    .map(
      (layer) => {
        const match = /^KFD-(\d+)\b/.exec(layer.decision);
        const title = match
          ? `<a href="/${escapeHtml(match[1])}/">${escapeHtml(layer.layer)}</a>`
          : escapeHtml(layer.layer);
        const decision = match
          ? `<a href="/${escapeHtml(match[1])}/">${escapeHtml(layer.decision)}</a>`
          : inlineMarkdown(layer.decision);
        return `<article class="panel foundation-layer">
        <h3>${title}</h3>
        <p class="foundation-commitment">${inlineMarkdown(layer.commitment)}</p>
        <dl class="foundation-fields">
          <div>
            <dt>decision</dt>
            <dd><p>${decision}</p></dd>
          </div>
          <div>
            <dt>question</dt>
            <dd><p>${inlineMarkdown(layer.readerQuestion)}</p></dd>
          </div>
        </dl>
      </article>`;
      },
    )
    .join("\n");
}

function practiceGuidelinePanels(guidelines) {
  return guidelines
    .map((guideline) => {
      const match = /^KFD-(\d+)\b/.exec(guideline.decision);
      const title = match
        ? `<a href="/${escapeHtml(match[1])}/">${escapeHtml(guideline.layer)}</a>`
        : escapeHtml(guideline.layer);
      const decision = match
        ? `<a href="/${escapeHtml(match[1])}/">${escapeHtml(guideline.decision)}</a>`
        : inlineMarkdown(guideline.decision);
      return `<article class="panel foundation-layer">
        <h3>${title}</h3>
        <p class="foundation-commitment">${inlineMarkdown(guideline.commitment)}</p>
        <dl class="foundation-fields">
          <div>
            <dt>decision</dt>
            <dd><p>${decision}</p></dd>
          </div>
          <div>
            <dt>question</dt>
            <dd><p>${inlineMarkdown(guideline.readerQuestion)}</p></dd>
          </div>
        </dl>
      </article>`;
    })
    .join("\n");
}

function isFlattenedMarkdownTable(text) {
  const trimmed = String(text || "").trim();
  return trimmed.startsWith("|") && trimmed.includes("|---|");
}

function decisionPanels(entries) {
  return entries
    .map((entry) => {
      const path = `/${entry.number}/`;
      const usagePage = kfdUsagePageByDecisionNumber.get(String(entry.number));
      const usageAction = usagePage?.sourceExists
        ? `<a class="card-action secondary" href="${escapeAttr(`/${entry.number}/usage/`)}">Usage notes</a>`
        : "";
      return `<article class="panel decision-card">
        <h3><a href="${escapeAttr(path)}">${escapeHtml(entry.id)}</a></h3>
        <p class="decision-summary">${escapeHtml(entry.title)}</p>
        <dl class="decision-meta">
          <dt>kind</dt>
          <dd><code>${escapeHtml(entry.kind)}</code></dd>
          <dt>status</dt>
          <dd><code>${escapeHtml(entry.status)}</code></dd>
          <dt>path</dt>
          <dd><a href="${escapeAttr(path)}"><code>${escapeHtml(`/${entry.number}/`)}</code></a></dd>
        </dl>
        <a class="card-action" href="${escapeAttr(path)}">Read ${escapeHtml(entry.id)}</a>
        ${usageAction}
      </article>`;
    })
    .join("\n");
}

function kfdDecisionNav(currentEntry, currentPage = "decision") {
  const links = kfdRegistry.entries
    .map((entry) => {
      const isCurrentDecision = String(entry.number) === String(currentEntry.number) && currentPage === "decision";
      const usagePage = kfdUsagePageByDecisionNumber.get(String(entry.number));
      const isCurrentUsage = String(entry.number) === String(currentEntry.number) && currentPage === "usage";
      const usageLink = usagePage?.sourceExists && isCurrentUsage
        ? `<a class="doc-nav-child" href="/${escapeAttr(entry.number)}/usage/"${String(entry.number) === String(currentEntry.number) && currentPage === "usage" ? ' aria-current="page"' : ""}>Usage</a>`
        : "";
      return `<a href="/${escapeAttr(entry.number)}/"${isCurrentDecision ? ' aria-current="page"' : ""}>${escapeHtml(entry.id)}</a>${usageLink}`;
    })
    .join("\n");
  return `<nav class="doc-global-nav" aria-label="Kung Fu Decisions">
    <h2>Kung Fu Decisions</h2>
    <div class="doc-nav-group">
      <a ${surfaceLinkAttrs("kfd")}>Overview</a>
      ${links}
    </div>
  </nav>`;
}

const site = readFixtureJson("site-manifest.json");
const core = readFixtureJson("core-spec-manifest.json");
const buildchainSite = readPackageJson("@kungfu-tech/buildchain/site/buildchain-site.json");
const buildchainPackage = readPackageJson("@kungfu-tech/buildchain/package.json");
const buildchainCli = readPackageJson("@kungfu-tech/buildchain/site/cli-registry.json");
const buildchainWorkflow = readPackageJson("@kungfu-tech/buildchain/site/workflow-registry.json");
const buildchainReleaseModel = readPackageJson("@kungfu-tech/buildchain/site/release-model.json");
const buildchainArtifactSchemas = readPackageJson("@kungfu-tech/buildchain/site/artifact-schemas.json");
const buildchainProductMechanism = readPackageJson("@kungfu-tech/buildchain/site/product-mechanism.json");
const buildchainReleaseProvenance = readPackageJson("@kungfu-tech/buildchain/site/release-provenance.json");
const buildchainAgentIndex = readPackageJson("@kungfu-tech/buildchain/site/agent-index.json");
const kfdSite = readPackageJson("@kungfu-tech/kfd/site/kfd-site.json");
const kfdPackage = readPackageJson("@kungfu-tech/kfd/package.json");
const kfdRegistry = readPackageJson("@kungfu-tech/kfd/registry.json");
const kfdStandards = readPackageJson("@kungfu-tech/kfd/standards.json");
const kfdPropagationLock = readOptionalJsonFile(path.join(repoRoot, "buildchain.upstreams", "kfd.release.json"));
const expectedBuildchainVersion = "2.10.8";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.21";
const buildchainLock = readPnpmLockPackage("@kungfu-tech/buildchain", expectedBuildchainVersion);
const kfdLock = readPnpmLockPackage("@kungfu-tech/kfd", expectedKfdVersion);
if (buildchainPackage.version !== expectedBuildchainVersion || buildchainLock.version !== expectedBuildchainVersion) {
  throw new Error(`site-libkungfu-dev expects @kungfu-tech/buildchain ${expectedBuildchainVersion}`);
}
if (kfdPackage.version !== expectedKfdVersion || kfdLock.version !== expectedKfdVersion) {
  throw new Error(`site-libkungfu-dev expects @kungfu-tech/kfd ${expectedKfdVersion}`);
}
if (kfdPropagationLock && kfdLock.integrity !== kfdPropagationLock.upstream?.package?.integrity) {
  throw new Error("installed KFD package integrity does not match Buildchain release propagation lock");
}
if (buildchainSite.contract !== "kungfu-buildchain-site-bundle") {
  throw new Error("unexpected Buildchain site bundle contract");
}
if (kfdSite.contract !== "kfd-site-bundle") {
  throw new Error("unexpected KFD site bundle contract");
}
const buildchainMachineArtifacts = Array.from(
  new Set([
    ...buildchainSite.entrypoints,
    ...buildchainAgentIndex.readOrder,
    buildchainReleaseModel.releasePassport.entrypoint,
    buildchainReleaseModel.releasePassport.bundle,
    buildchainArtifactSchemas.contract,
    buildchainReleaseProvenance.contract,
  ]),
);
const surfaceTimestampPolicy = createSurfaceTimestampPolicy({
  generatedAt: process.env.SITE_GENERATED_AT || process.env.BUILDCHAIN_SITE_GENERATED_AT || process.env.BUILDCHAIN_SURFACE_GENERATED_AT,
  publishedAt: process.env.SITE_PUBLISHED_AT || process.env.BUILDCHAIN_SITE_PUBLISHED_AT || process.env.BUILDCHAIN_SURFACE_PUBLISHED_AT,
  sourceDateEpoch: process.env.SOURCE_DATE_EPOCH || "0",
  sourceRevision: process.env.SITE_SOURCE_REVISION || process.env.BUILDCHAIN_SOURCE_SHA || process.env.GITHUB_SHA || "",
  timestampPolicy: process.env.SITE_TIMESTAMP_POLICY || process.env.BUILDCHAIN_SITE_TIMESTAMP_POLICY || process.env.BUILDCHAIN_SURFACE_TIMESTAMP_POLICY,
  deterministicInputs: [
    "scripts/render-site.mjs",
    "src/fixtures/*.json",
    "pnpm-lock.yaml",
    "@kungfu-tech/buildchain package content",
    "@kungfu-tech/kfd package content",
  ],
  artifactDigestScope: "site dist manifest JSON files",
});
const buildchainBadgeEndpoints = renderBuildchainBadgeEndpoints();
const buildchainPrimarySectionIds = buildchainSite.homepage.displayPlan?.primary || [];
const buildchainSupportSectionIds = buildchainSite.homepage.displayPlan?.support || [];
const buildchainFirstScreenSectionIds = (buildchainSite.homepage.displayPlan?.firstScreen?.include || [])
  .filter((id) => buildchainSite.homepage.sections?.some((section) => section.id === id));
const buildchainRendererContract = buildchainSite.homepage.rendererContract;
const kfdSupportSectionIds = kfdSite.homepage.displayPlan?.support || [];
const kfdRendererContract = kfdSite.homepage.rendererContract;
const kfdUsagePages = kfdSite.decisionPages?.usagePages?.pages || [];
const kfdUsagePageByDecisionNumber = new Map(kfdUsagePages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const buildchainPageBySourcePath = new Map(buildchainSite.pages.map((pageEntry) => [pageEntry.sourcePath, pageEntry]));
const buildchainPageByRoute = new Map(buildchainSite.pages.map((pageEntry) => [normalizeBuildchainRoute(pageEntry.route), pageEntry]));

function rewriteBuildchainPageLinks(source, pageEntry) {
  return String(source).replace(/\]\((?!https?:\/\/|\/|#)([^)\s)]+)(#[^)]+)?\)/g, (_match, target, hash = "") => {
    const baseDir = path.posix.dirname(pageEntry.sourcePath);
    const cleanTarget = target.replace(/^\.\//, "");
    const resolvedSource = path.posix.normalize(path.posix.join(baseDir === "." ? "" : baseDir, cleanTarget));
    const linkedPage = buildchainPageBySourcePath.get(resolvedSource);
    if (linkedPage) {
      return `](${buildchainRouteHrefFrom(pageEntry.route, linkedPage.route, hash)})`;
    }
    return `](https://github.com/kungfu-systems/buildchain/blob/main/${resolvedSource}${hash})`;
  });
}

function renderBuildchainPageMarkdown(pageEntry) {
  const env = {};
  const tokens = markdown.parse(rewriteBuildchainPageLinks(pageEntry.markdown, pageEntry), env);
  const toc = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const sourceLevel = Number(token.tag.slice(1));
    const renderedLevel = Math.min(sourceLevel + 1, 4);
    const title = headingText(tokens[index + 1]);
    const id = token.attrGet("id");
    token.tag = `h${renderedLevel}`;
    if (tokens[index + 2]?.type === "heading_close") {
      tokens[index + 2].tag = `h${renderedLevel}`;
    }
    if (id && title) {
      toc.push({ id, title, level: renderedLevel });
    }
  }

  return {
    html: markdown.renderer.render(tokens, markdown.options, env),
    tocHtml: renderToc(toc, "Page sections"),
    toc,
  };
}

function buildchainPageIndex() {
  const labels = {
    overview: "Overview",
    manual: "Manuals",
    action: "GitHub Actions",
    api: "Node API",
    fixture: "Fixtures",
  };
  return Object.entries(labels)
    .map(([category, label]) => {
      const pages = buildchainSite.pages.filter((pageEntry) => pageEntry.category === category);
      if (pages.length === 0) return "";
      return `<section class="panel">
        <h2>${escapeHtml(label)}</h2>
        <ul>${pages
          .map(
            (pageEntry) =>
              `<li><a href="${escapeAttr(buildchainRouteHrefFrom("/", pageEntry.route))}">${escapeHtml(pageEntry.title)}</a> <code>${escapeHtml(pageEntry.route)}</code></li>`,
          )
          .join("")}</ul>
      </section>`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildchainGlobalNav(currentRoute, currentPageToc = []) {
  const labels = {
    overview: "Overview",
    manual: "Manuals",
    action: "GitHub Actions",
    api: "Node API",
  };
  const currentIsHome = normalizeBuildchainRoute(currentRoute) === "/";
  return `<nav class="doc-global-nav" aria-label="Buildchain pages">
    <a href="${escapeAttr(buildchainRouteHrefFrom(currentRoute, "/"))}"${currentIsHome ? ' aria-current="page"' : ""}>Overview</a>
    ${Object.entries(labels)
      .map(([category, label]) => {
        const pages = buildchainSite.pages.filter(
          (pageEntry) => pageEntry.category === category && normalizeBuildchainRoute(pageEntry.route) !== "/",
        );
        if (pages.length === 0) return "";
        return `<section class="doc-nav-group">
          <p class="doc-nav-heading">${escapeHtml(label)}</p>
          ${pages
            .map((pageEntry) => {
              const current = normalizeBuildchainRoute(pageEntry.route) === normalizeBuildchainRoute(currentRoute);
              const pageLink = `<a href="${escapeAttr(buildchainRouteHrefFrom(currentRoute, pageEntry.route))}"${current ? ' aria-current="page"' : ""}>${escapeHtml(pageEntry.title)}</a>`;
              const sectionLinks =
                current && currentPageToc.length > 0
                  ? `<div class="doc-page-sections" aria-label="Current page sections">
                    ${currentPageToc
                      .map(
                        (entry) =>
                          `<a class="toc-level-${entry.level}" href="#${escapeAttr(entry.id)}">${escapeHtml(entry.title)}</a>`,
                      )
                      .join("")}
                  </div>`
                  : "";
              return `${pageLink}${sectionLinks}`;
            })
            .join("")}
        </section>`;
      })
      .filter(Boolean)
      .join("")}
  </nav>`;
}

function buildchainDocPanels(items) {
  return items
    .map((doc) => {
      const linkedPage = buildchainPageBySourcePath.get(doc.path);
      const href = linkedPage ? buildchainRouteHrefFrom("/", linkedPage.route) : "";
      const title = href
        ? `<a href="${escapeAttr(href)}">${escapeHtml(doc.title)}</a>`
        : escapeHtml(doc.title);
      const action = href ? `<a class="card-action" href="${escapeAttr(href)}">Open page</a>` : "";
      return `<article class="panel">
        <h3>${title}</h3>
        <p><code>${escapeHtml(doc.path)}</code></p>
        <dl class="meta" style="margin-top: 14px;">
          <dt>plane</dt>
          <dd><code>${escapeHtml(doc.plane)}</code></dd>
          <dt>exists</dt>
          <dd><code>${escapeHtml(doc.exists)}</code></dd>
        </dl>
        ${action}
      </article>`;
    })
    .join("\n");
}

function buildchainHomepageSection(id) {
  return buildchainSite.homepage.sections?.find((section) => section.id === id);
}

function buildchainHomepageSectionPanels(ids, className = "") {
  return ids
    .map((id) => buildchainHomepageSection(id))
    .filter(Boolean)
    .map(
      (section) => `<section class="panel doc-content ${className}" data-buildchain-section="${escapeAttr(section.id)}">
        <p class="eyebrow">${escapeHtml(section.renderRole)}</p>
        <h2>${escapeHtml(section.title)}</h2>
        ${renderBuildchainMarkdownBody(section.markdown)}
      </section>`,
    )
    .join("\n");
}

function kfdHomepageSection(id) {
  return kfdSite.homepage.sections?.find((section) => section.id === id);
}

function kfdHomepageSectionPanels(ids, className = "") {
  return ids
    .map((id) => kfdHomepageSection(id))
    .filter(Boolean)
    .map(
      (section) => `<section class="panel doc-content ${className}" data-kfd-section="${escapeAttr(section.id)}">
        <p class="eyebrow">${escapeHtml(section.renderRole)}</p>
        <h2>${escapeHtml(section.title)}</h2>
        ${renderMarkdownBody(section.markdown)}
      </section>`,
    )
    .join("\n");
}

function kfdPrimaryContinuationPanels() {
  const handled = new Set(["foundation-triad", "foundation-model"]);
  return (kfdSite.homepage.displayPlan?.primary || [])
    .filter((id) => !handled.has(id))
    .map((id) => {
      if (id === "practice-guidelines" && kfdSite.homepage.practiceGuidelines) {
        return `<section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.practiceGuidelines.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.practiceGuidelines.intro)}</p>
      <div class="grid practice-guideline-list" style="margin-top: 18px;">
        ${practiceGuidelinePanels(kfdSite.homepage.practiceGuidelines.guidelines || [])}
      </div>
      <div class="stack" style="margin-top: 18px;">
        ${(kfdSite.homepage.practiceGuidelines.explanation || [])
          .filter((text) => !isFlattenedMarkdownTable(text))
          .map((text) => `<p>${inlineMarkdown(text)}</p>`)
          .join("\n")}
      </div>
    </section>`;
      }
      if (id === "product-proof-path" && kfdSite.homepage.productProofPath) {
        return `<section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.productProofPath.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.productProofPath.body)}</p>
    </section>`;
      }
      return `<div style="margin-top: 18px;">
        ${kfdHomepageSectionPanels([id], "kfd-primary-section")}
      </div>`;
    })
    .join("\n");
}

writeFile(
  "index.html",
  page({
    title: `${site.title} | Open substrate hub`,
    description: site.tagline,
    current: "hub",
    body: `<section class="hero">
      <h1>${escapeHtml(site.homepage.headline)}</h1>
      <p class="lead">${escapeHtml(site.homepage.lead)}</p>
      <div class="visual substrate-map" aria-label="Product generation map">
        <img src="/assets/substrate-flow.svg" alt="KFD defines principles, Buildchain makes them executable, Core proves them in a complex product, and Kungfu Tech carries future products.">
        <a class="map-hotspot kfd" ${surfaceLinkAttrs("kfd")} aria-label="Open KFD"></a>
        <a class="map-hotspot buildchain" ${surfaceLinkAttrs("buildchain")} aria-label="Open Buildchain"></a>
        <a class="map-hotspot core" ${surfaceLinkAttrs("core")} aria-label="Open Core"></a>
        <a class="map-hotspot products" href="${escapeAttr(site.homepage.futureProducts.url)}" aria-label="Open ${escapeAttr(site.homepage.futureProducts.displayName)}"></a>
      </div>
    </section>

    <section class="grid three mechanism-chain">
      ${site.homepage.chain.map(mechanismStepCard).join("\n")}
    </section>

    <section class="panel future-products">
      <p class="eyebrow">${escapeHtml(site.homepage.futureProducts.label)}</p>
      <h2><a href="${escapeAttr(site.homepage.futureProducts.url)}">${escapeHtml(site.homepage.futureProducts.displayName)}</a></h2>
      <p>${escapeHtml(site.homepage.futureProducts.summary)}</p>
    </section>

    <section class="panel warning" style="margin-top: 18px;">
      <h2>Source boundary</h2>
      <p><strong>Fixture source:</strong> ${escapeHtml(site.sourceBoundary.rule)}</p>
    </section>`,
  }),
);

writeFile(
  "core/index.html",
  page({
    title: "core.libkungfu.dev | Core substrate",
    description: "libkungfu, yijinjing, runtime fact ledger, specs, schemas, and conformance vectors.",
    current: "core",
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a><span class="page-kicker-state">Core substrate</span></p>
      <h1>${escapeHtml(core.surfaceHost)}</h1>
      <p class="lead">Generated surface for libkungfu, yijinjing, runtime fact ledger specs, schema registry, and conformance vectors.</p>
    </section>

    <section class="panel">
      <h2>Current fixture manifest</h2>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(core.package)}</code></dd>
        <dt>Source repository</dt>
        <dd><a href="${escapeAttr(core.sourceRepository)}">${escapeHtml(core.sourceRepository)}</a></dd>
        <dt>Spec version</dt>
        <dd><code>${escapeHtml(core.currentSpec.specVersion)}</code></dd>
        <dt>docs_url</dt>
        <dd><code>${escapeHtml(core.currentSpec.docsUrl)}</code></dd>
      </dl>
    </section>

    <section class="grid three" style="margin-top: 18px;">
      ${listPanels(core.sections)}
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Machine fields expected from upstream</h2>
      <ul>${core.machineFields.map((field) => `<li><code>${escapeHtml(field)}</code></li>`).join("")}</ul>
    </section>`,
  }),
);

writeFile(
  "kfd/index.html",
  page({
    title: "kfd.libkungfu.dev | Kung Fu Decisions",
    description: kfdPackage.description,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a><span class="page-kicker-state">Kung Fu Decisions</span></p>
      <h1>${escapeHtml(kfdSite.homepage.title)}</h1>
      <p class="lead">${inlineMarkdown(kfdSite.homepage.lead)}</p>
    </section>

    <section class="panel">
      <h2>${escapeHtml(kfdSite.homepage.foundationTriad.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.foundationTriad.intro)}</p>
      <div class="grid three" style="margin-top: 18px;">
        ${kfdSite.homepage.foundationTriad.commitments
          .map(
            (entry) => {
              const match = /^KFD-(\d+)\b/.exec(entry.id);
              const title = match
                ? `<a href="/${escapeHtml(match[1])}/">${escapeHtml(entry.id)}</a>`
                : escapeHtml(entry.id);
              return `<article class="panel foundation-triad-card">
              <h3>${title}</h3>
              <p>${inlineMarkdown(entry.text)}</p>
            </article>`;
            },
          )
          .join("\n")}
      </div>
      <p style="margin-top: 18px;">${inlineMarkdown(kfdSite.homepage.foundationTriad.summary)}</p>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.foundationModel.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.foundationModel.intro)}</p>
      <div class="grid three foundation-model-list">
        ${foundationModelPanels(kfdSite.homepage.foundationModel.layers)}
      </div>
      <p style="margin-top: 18px;"><code>${escapeHtml(kfdSite.homepage.foundationModel.chain)}</code></p>
      <div class="stack" style="margin-top: 18px;">
        ${kfdSite.homepage.foundationModel.explanation.map((text) => `<p>${inlineMarkdown(text)}</p>`).join("\n")}
      </div>
    </section>

    ${kfdPrimaryContinuationPanels()}

    <section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.currentDecisions.heading)}</h2>
      <div class="grid kfd-decision-list">
        ${decisionPanels(kfdRegistry.entries)}
      </div>
    </section>

    ${
      kfdSupportSectionIds.length > 0
        ? `<div class="stack" style="margin-top: 18px;">
        ${kfdHomepageSectionPanels(kfdSupportSectionIds, "kfd-support-section")}
      </div>`
        : ""
    }

    <section class="panel" style="margin-top: 18px;">
      <h2>Machine facts</h2>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}</code></dd>
        <dt>Version</dt>
        <dd><code>${escapeHtml(kfdPackage.version)}</code></dd>
        <dt>Site bundle</dt>
        <dd><code>${escapeHtml(kfdSite.contract)}</code></dd>
        <dt>Registry</dt>
        <dd><code>${escapeHtml(kfdSite.decisionPages.source)}</code></dd>
        <dt>Standards</dt>
        <dd><code>${escapeHtml(kfdStandards.contract)}</code></dd>
        ${
          kfdRendererContract
            ? `<dt>Renderer contract</dt>
        <dd><code>${escapeHtml(kfdRendererContract.id)}</code></dd>
        <dt>Renderer contract display</dt>
        <dd><code>renderAsHomepageContent: ${escapeHtml(String(kfdRendererContract.renderAsHomepageContent))}</code></dd>
        <dt>Renderer contract note</dt>
        <dd>${escapeHtml(kfdRendererContract.note)}</dd>`
            : ""
        }
        <dt>Lock integrity</dt>
        <dd><code>${escapeHtml(kfdLock.integrity)}</code></dd>
      </dl>
    </section>`,
  }),
);

for (const entry of kfdRegistry.entries) {
  const decisionMarkdown = readPackageText(`@kungfu-tech/kfd/${entry.path}`);
  const usagePage = kfdUsagePageByDecisionNumber.get(String(entry.number));
  const renderedDecision = renderDecisionMarkdown(
    decisionMarkdown,
    "Decision sections",
    usagePage?.sourceExists
      ? {
          tocLinks: [
            {
              title: usagePage.title || "Usage",
              href: `/${entry.number}/usage/`,
              className: "toc-related-link",
            },
          ],
        }
      : {},
  );
  const decisionPageHtml = page({
    title: `${entry.id} | kfd.libkungfu.dev`,
    description: entry.title,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
        <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">${escapeHtml(entry.kind)} / ${escapeHtml(entry.status)}</span></p>
        <h1>${escapeHtml(entry.id)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
      </section>

      <section class="panel">
        <h2>Decision metadata</h2>
        <dl class="meta">
          <dt>Number</dt>
          <dd><code>${escapeHtml(entry.number)}</code></dd>
          <dt>Stable URL</dt>
          <dd><code>${escapeHtml(entry.url)}</code></dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(entry.path)}</code></dd>
        </dl>
      </section>

      <section class="doc-layout">
        <aside class="doc-sidebar">
          ${kfdDecisionNav(entry)}
          ${renderedDecision.tocHtml}
        </aside>
        <article class="panel doc-content">
          ${renderedDecision.html}
        </article>
      </section>`,
  });
  writeFile(`kfd/${entry.number}/index.html`, decisionPageHtml);
  writeFile(`${entry.number}/index.html`, decisionPageHtml);

  if (usagePage?.sourceExists) {
    const usageMarkdown = readPackageText(`@kungfu-tech/kfd/${usagePage.sourcePath || usagePage.path}`);
    const renderedUsage = renderDecisionMarkdown(usageMarkdown, "Usage sections");
    const usagePageHtml = page({
      title: `${entry.id} usage | kfd.libkungfu.dev`,
      description: usagePage.title || `${entry.id} usage notes`,
      current: "kfd",
      alternates: kfdSurfaceAlternates(),
      body: `<section class="hero">
        <p class="eyebrow page-kicker"><a href="/${escapeAttr(entry.number)}/" aria-label="Back to ${escapeAttr(entry.id)}">${escapeHtml(`Back to ${entry.id}`)}</a><span class="page-kicker-state">usage / ${escapeHtml(entry.id)}</span></p>
        <h1>${escapeHtml(usagePage.title || `${entry.id} usage`)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
      </section>

      <section class="panel">
        <h2>Usage metadata</h2>
        <dl class="meta">
          <dt>Decision</dt>
          <dd><a href="/${escapeAttr(entry.number)}/"><code>${escapeHtml(entry.id)}</code></a></dd>
          <dt>Stable URL</dt>
          <dd><code>${escapeHtml(usagePage.url || `https://kfd.libkungfu.dev/${entry.number}/usage`)}</code></dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(usagePage.sourcePath || usagePage.path)}</code></dd>
          <dt>Relationship</dt>
          <dd><code>${escapeHtml(usagePage.relationship || "usage-child-of-decision")}</code></dd>
        </dl>
      </section>

      <section class="doc-layout">
        <aside class="doc-sidebar">
          ${kfdDecisionNav(entry, "usage")}
          ${renderedUsage.tocHtml}
        </aside>
        <article class="panel doc-content">
          ${renderedUsage.html}
        </article>
      </section>`,
    });
    writeFile(`kfd/${entry.number}/usage/index.html`, usagePageHtml);
    writeFile(`${entry.number}/usage/index.html`, usagePageHtml);
  }
}

writeFile(
  "buildchain/index.html",
  page({
    title: "buildchain.libkungfu.dev | Buildchain surface",
    description: buildchainPageDescription(),
    current: "buildchain",
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a><span class="page-kicker-state">Buildchain product surface</span></p>
      <h1>${escapeHtml(buildchainSite.homepage.title)}</h1>
      <div class="lead badge-strip">${renderBuildchainLead(buildchainSite.homepage.lead)}</div>
      <div class="stack">
        ${buildchainSite.homepage.mechanismSummary.map((entry) => `<p>${escapeHtml(entry)}</p>`).join("\n")}
      </div>
    </section>

    <section class="doc-layout">
      <aside class="doc-sidebar">
        ${buildchainGlobalNav("/")}
      </aside>
      <div class="stack">
        ${buildchainHomepageSectionPanels(buildchainFirstScreenSectionIds, "buildchain-first-screen-section")}
        ${buildchainHomepageSectionPanels(
          buildchainPrimarySectionIds.filter((id) => !buildchainFirstScreenSectionIds.includes(id)),
          "buildchain-primary-section",
        )}
        ${buildchainHomepageSectionPanels(buildchainSupportSectionIds, "buildchain-support-section")}

        <section class="panel">
          <h2>Bundle facts</h2>
          <dl class="meta">
            <dt>Package</dt>
            <dd><code>${escapeHtml(buildchainPackage.name)}</code></dd>
            <dt>Version</dt>
            <dd><code>${escapeHtml(buildchainPackage.version)}</code></dd>
            <dt>Site bundle</dt>
            <dd><code>${escapeHtml(buildchainSite.contract)}</code></dd>
            <dt>Source of truth</dt>
            <dd><code>${escapeHtml(buildchainSite.sourceOfTruth)}</code></dd>
            <dt>Repository</dt>
            <dd><a href="${escapeAttr(buildchainPackage.repository)}">${escapeHtml(buildchainPackage.repository)}</a></dd>
            <dt>Homepage sections</dt>
            <dd><code>${escapeHtml(String(buildchainSite.homepage.sections.length))}</code></dd>
            <dt>Page registry entries</dt>
            <dd><code>${escapeHtml(String(buildchainSite.pages.length))}</code></dd>
            ${
              buildchainRendererContract
                ? `<dt>Renderer contract</dt>
            <dd><code>${escapeHtml(buildchainRendererContract.id)}</code></dd>
            <dt>Renderer contract display</dt>
            <dd><code>renderAsHomepageContent: ${escapeHtml(String(buildchainRendererContract.renderAsHomepageContent))}</code></dd>
            <dt>Renderer contract note</dt>
            <dd>${escapeHtml(buildchainRendererContract.note)}</dd>`
                : ""
            }
            <dt>Lock integrity</dt>
            <dd><code>${escapeHtml(buildchainLock.integrity)}</code></dd>
          </dl>
        </section>

        <section class="grid" style="margin-top: 18px;">
          <article class="panel">
            <h2>Product mechanism facts</h2>
            <p>${escapeHtml(buildchainProductMechanism.purpose)}</p>
            <dl class="meta" style="margin-top: 14px;">
              <dt>Category</dt>
              <dd><code>${escapeHtml(buildchainProductMechanism.category)}</code></dd>
              <dt>Substrate</dt>
              <dd><code>${escapeHtml(buildchainProductMechanism.executionSubstrate)}</code></dd>
              <dt>Human first</dt>
              <dd><code>${escapeHtml(buildchainSite.humanFirst)}</code></dd>
              <dt>Agent first</dt>
              <dd><code>${escapeHtml(buildchainSite.agentFirst)}</code></dd>
            </dl>
          </article>
          <article class="panel">
            <h2>Not this</h2>
            <ul>${buildchainProductMechanism.notA.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
          </article>
        </section>

        <section class="panel" style="margin-top: 18px;">
          <h2>Proof cases</h2>
          <ul>${buildchainProductMechanism.proofCases.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
        </section>

        <section class="panel" style="margin-top: 18px;">
          <h2>Release passport facts</h2>
          <dl class="meta">
            <dt>Passport entrypoint</dt>
            <dd><code>${escapeHtml(buildchainReleaseModel.releasePassport.entrypoint)}</code></dd>
            <dt>Passport bundle</dt>
            <dd><code>${escapeHtml(buildchainReleaseModel.releasePassport.bundle)}</code></dd>
            <dt>Stable dist-tag</dt>
            <dd><code>${escapeHtml(buildchainReleaseModel.npm.stableDistTag)}</code></dd>
          </dl>
        </section>

        <section class="panel" style="margin-top: 18px;">
          <h2>CLI command registry</h2>
          <div class="grid">
            ${factPanels(
              buildchainCli.commands,
              (command) => command.usage,
              (command) => command.purpose,
              (command) => [["id", command.id]],
            )}
          </div>
        </section>

        <section class="grid three" style="margin-top: 18px;">
          ${factPanels(
            buildchainWorkflow.workflows,
            (workflow) => workflow.id,
            (workflow) => workflow.path,
            (workflow) => [["surface", workflow.surface], ["status", workflow.status]],
          )}
        </section>

        <section class="grid three" style="margin-top: 18px;">
          ${factPanels(
            buildchainWorkflow.actions,
            (action) => action.id,
            (action) => action.path,
            (action) => [["status", action.status]],
          )}
        </section>

        <section class="panel" style="margin-top: 18px;">
          <h2>Machine artifacts</h2>
          <ul>${buildchainMachineArtifacts
            .map((entry) => `<li><code>${escapeHtml(entry)}</code></li>`)
            .join("")}</ul>
        </section>
      </div>
    </section>`,
  }),
);

for (const buildchainPage of buildchainSite.pages.filter((pageEntry) => normalizeBuildchainRoute(pageEntry.route) !== "/")) {
  const renderedPage = renderBuildchainPageMarkdown(buildchainPage);
  writeFile(
    buildchainRouteOutputPath(buildchainPage.route),
    page({
      title: `${buildchainPage.title} | buildchain.libkungfu.dev`,
      description: `${buildchainPage.category} page from ${buildchainPage.sourcePath}`,
      current: "buildchain",
      body: `<section class="hero">
        <p class="eyebrow page-kicker"><a href="${escapeAttr(buildchainRouteHrefFrom(buildchainPage.route, "/"))}" aria-label="Back to Buildchain home">Back to Buildchain home</a><span class="page-kicker-state">${escapeHtml(buildchainPage.category)} / ${escapeHtml(buildchainPage.id)}</span></p>
        <h1>${escapeHtml(buildchainPage.title)}</h1>
        <p class="lead">Buildchain ${escapeHtml(buildchainPage.category)} page.</p>
      </section>

      <section class="doc-layout">
        <aside class="doc-sidebar">
          ${buildchainGlobalNav(buildchainPage.route, renderedPage.toc)}
        </aside>
        <article class="panel doc-content">
          ${renderedPage.html}
        </article>
      </section>

      <section class="panel" style="margin-top: 18px;">
        <h2>Page metadata</h2>
        <dl class="meta">
          <dt>Route</dt>
          <dd><code>${escapeHtml(buildchainCanonicalPath(buildchainPage.route))}</code></dd>
          <dt>Category</dt>
          <dd><code>${escapeHtml(buildchainPage.category)}</code></dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(buildchainPage.sourcePath)}</code></dd>
          <dt>Package</dt>
          <dd><code>${escapeHtml(buildchainPackage.name)}@${escapeHtml(buildchainPackage.version)}</code></dd>
          <dt>Digest</dt>
          <dd><code>${escapeHtml(buildchainPage.digest)}</code></dd>
        </dl>
      </section>`,
    }),
  );
}

const manifest = {
  schemaVersion: 1,
  contract: "libkungfu-dev-generated-site-manifest",
  ...surfaceTimestampPolicy,
  canonicalHost: surfaceCanonicalHost("hub"),
  sourceBoundary: site.sourceBoundary,
  pages: [
    { path: "/", host: surfaceCanonicalHost("hub"), source: "src/fixtures/site-manifest.json" },
    { path: "/core/", host: surfaceCanonicalHost("core"), source: "src/fixtures/core-spec-manifest.json" },
    {
      path: "/buildchain/",
      host: surfaceCanonicalHost("buildchain"),
      source: `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/buildchain-site.json`,
    },
    ...buildchainSite.pages
      .filter((pageEntry) => normalizeBuildchainRoute(pageEntry.route) !== "/")
      .map((pageEntry) => ({
        path: buildchainCanonicalPath(pageEntry.route),
        host: surfaceCanonicalHost("buildchain"),
        source: `@kungfu-tech/buildchain@${buildchainPackage.version}/${pageEntry.sourcePath}`,
      })),
    {
      path: "/",
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/site/kfd-site.json`,
    },
    ...kfdRegistry.entries.map((entry) => ({
      path: `/${entry.number}/`,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.path}`,
    })),
    ...kfdUsagePages
      .filter((pageEntry) => pageEntry.sourceExists)
      .map((pageEntry) => ({
        path: `/${pageEntry.decisionNumber}/usage/`,
        host: surfaceCanonicalHost("kfd"),
        source: `@kungfu-tech/kfd@${kfdPackage.version}/${pageEntry.sourcePath || pageEntry.path}`,
      })),
  ],
  machineEntries: site.stableMachineEntries,
  upstreamFixtures: {
    core: {
      contract: core.contract,
      package: core.package,
      docsUrlPattern: core.docsUrlPattern,
    },
  },
  upstreamPackages: {
    buildchain: {
      contract: buildchainSite.contract,
      package: buildchainPackage.name,
      version: buildchainPackage.version,
      sourceOfTruth: buildchainSite.sourceOfTruth,
      lockIntegrity: buildchainLock.integrity,
      exportedEntrypoints: buildchainSite.entrypoints,
      badgeEndpoints: {
        contract: buildchainBadgeEndpoints.registry.contract,
        version: buildchainBadgeEndpoints.version,
        source: buildchainBadgeEndpoints.source.source,
        sourceKind: buildchainBadgeEndpoints.source.kind,
        logoPolicy: buildchainBadgeEndpoints.registry.logoPolicy,
        renderedCount: buildchainBadgeEndpoints.rendered.length,
        routes: buildchainBadgeEndpoints.rendered,
      },
    },
    kfd: {
      contract: kfdSite.contract,
      package: kfdPackage.name,
      version: kfdPackage.version,
      lockIntegrity: kfdLock.integrity,
      releaseLock: kfdPropagationLock
        ? {
            path: "buildchain.upstreams/kfd.release.json",
            tag: kfdPropagationLock.upstream?.tag,
            lockSha256: kfdPropagationLock.lockSha256,
          }
        : undefined,
      registryContract: kfdRegistry.contract,
      standardsContract: kfdStandards.contract,
      decisionCount: kfdRegistry.entries.length,
    },
  },
};

writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const kfdDecisionEntries = kfdRegistry.entries.map((entry) => ({
  usage: kfdUsagePageByDecisionNumber.get(String(entry.number))?.sourceExists
    ? {
        path: `/${entry.number}/usage/`,
        url: surfaceEndpointHref("kfd", `${entry.number}/usage/`),
        source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdUsagePageByDecisionNumber.get(String(entry.number)).sourcePath || kfdUsagePageByDecisionNumber.get(String(entry.number)).path}`,
      }
    : undefined,
  id: entry.id,
  number: entry.number,
  kind: entry.kind,
  status: entry.status,
  title: entry.title,
  path: `/${entry.number}/`,
  url: surfaceEndpointHref("kfd", `${entry.number}/`),
  source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.path}`,
}));

const kfdAgentManifest = {
  schemaVersion: 1,
  contract: "kfd-agent-surface",
  ...surfaceTimestampPolicy,
  canonicalHost: surfaceCanonicalHost("kfd"),
  humanEntry: surfaceCanonicalHref("kfd"),
  agentEntries: {
    llms: surfaceEndpointHref("kfd", "llms.txt"),
    manifest: surfaceEndpointHref("kfd", "manifest.json"),
    registry: surfaceEndpointHref("kfd", "registry.json"),
    standards: surfaceEndpointHref("kfd", "standards.json"),
  },
  sourceBoundary: {
    truthOwner: "@kungfu-tech/kfd",
    siteRole: "rendering, routing, and agent discovery",
    rule: "KFD facts, registry entries, standards metadata, and decision text come from the pinned @kungfu-tech/kfd package. This site may expose and render them, but must not fork their meaning.",
  },
  package: {
    name: kfdPackage.name,
    version: kfdPackage.version,
    integrity: kfdLock.integrity,
    registryContract: kfdRegistry.contract,
    standardsContract: kfdStandards.contract,
  },
  readOrder: [
    surfaceCanonicalHref("kfd"),
    ...kfdDecisionEntries.map((entry) => entry.url),
    ...kfdDecisionEntries.map((entry) => entry.usage?.url).filter(Boolean),
    surfaceEndpointHref("kfd", "registry.json"),
    surfaceEndpointHref("kfd", "standards.json"),
  ],
  decisions: kfdDecisionEntries,
  relatedSurfaces: {
    buildchain: surfaceCanonicalHref("buildchain"),
    kungfu: "https://kungfu.tech/",
    hub: surfaceCanonicalHref("hub"),
  },
};

writeFile("kfd/manifest.json", `${JSON.stringify(kfdAgentManifest, null, 2)}\n`);
writeFile("kfd/registry.json", `${JSON.stringify(kfdRegistry, null, 2)}\n`);
writeFile("kfd/standards.json", `${JSON.stringify(kfdStandards, null, 2)}\n`);
writeFile(
  "kfd/llms.txt",
  `# ${surfaceCanonicalHost("kfd")}

Kung Fu Decisions (KFD) is the kungfu-systems decision registry surface.

Human entry:
- ${surfaceCanonicalHref("kfd")}

Agent-first entries:
- ${surfaceEndpointHref("kfd", "manifest.json")}
- ${surfaceEndpointHref("kfd", "registry.json")}
- ${surfaceEndpointHref("kfd", "standards.json")}
- ${surfaceEndpointHref("kfd", "llms.txt")}

Read order:
${kfdAgentManifest.readOrder.map((entry) => `- ${entry}`).join("\n")}

Source boundary:
KFD facts, registry entries, standards metadata, and decision text come from
@kungfu-tech/kfd@${kfdPackage.version}. site-libkungfu-dev renders and exposes
them, but does not own or fork their meaning.
`,
);

writeFile(
  "llms.txt",
  `# ${surfaceCanonicalHost("hub")}

libkungfu.dev is the open developer and agent substrate hub for Kungfu.

Primary pages:
- ${surfaceCanonicalHref("hub")}
- ${surfaceCanonicalHref("core")}
- ${surfaceCanonicalHref("buildchain")}
- ${surfaceCanonicalHref("kfd")}

Machine entries:
- ${surfaceEndpointHref("hub", "manifest.json")}
- ${surfaceEndpointHref("hub", "llms.txt")}
- ${surfaceEndpointHref("hub", "llms-full.txt")}

Source boundary:
This repository renders upstream manifests. It is not a product fact source.
Core facts must come from @kungfu-tech/spec. Buildchain facts must come from
the @kungfu-tech/buildchain docs/site bundle. KFD facts must come from the
@kungfu-tech/kfd site bundle, registry, and decision documents.
`,
);

writeFile(
  "llms-full.txt",
  `# libkungfu.dev full agent index

${JSON.stringify(manifest, null, 2)}
`,
);
