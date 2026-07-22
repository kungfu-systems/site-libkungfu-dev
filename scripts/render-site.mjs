import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import { createSurfaceTimestampPolicy } from "@kungfu-tech/buildchain/surface-manifest";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const fixturesDir = path.join(repoRoot, "src", "fixtures");
const require = createRequire(import.meta.url);
const { loadPublicationPackageSet, readPublicationArtifact } = require("./publication-packages.cjs");

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

function writeBinaryFile(relativePath, content) {
  const target = path.join(distDir, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function sha256Buffer(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
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
const defaultCodeInlineRule = markdown.renderer.rules.code_inline;
markdown.renderer.rules.code_inline = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const href = env?.codeLinks?.[token.content];
  if (!href) {
    return defaultCodeInlineRule
      ? defaultCodeInlineRule(tokens, index, options, env, self)
      : `<code>${escapeHtml(token.content)}</code>`;
  }
  return `<a href="${escapeAttr(href)}"><code>${escapeHtml(token.content)}</code></a>`;
};

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
    const sourceDirectory = options.sourcePath ? path.posix.dirname(options.sourcePath) : "";
    const resolvedTarget = sourceDirectory
      ? path.posix.normalize(path.posix.join(sourceDirectory, cleanTarget))
      : cleanTarget;
    const internalRoute = options.internalRoutes?.get(cleanTarget) || options.internalRoutes?.get(resolvedTarget);
    if (internalRoute) {
      return `](${internalRoute}${hash})`;
    }
    if (!filePattern.test(cleanTarget)) {
      return `](${target}${hash})`;
    }
    const repositoryTarget = target.startsWith(".") || !cleanTarget.includes("/")
      ? resolvedTarget
      : cleanTarget;
    return `](https://github.com/${repositoryPath}/blob/main/${repositoryTarget}${hash})`;
  });
}

function renderMarkdownBody(source, options = {}) {
  return markdown.render(
    rewritePackageMarkdownLinks(source, "kungfu-systems/kfd", {
      filePattern: /\.md$/,
      internalRoutes: kfdPageRouteBySourcePath,
    }),
    { codeLinks: options.codeLinks || {} },
  );
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

function normalizeBuildchainHomepageCopy(homepage) {
  const mechanismSummary = [...(homepage.mechanismSummary || [])];
  const leadParts = [homepage.lead || ""];
  if (
    leadParts[0].includes("<!-- buildchain:badges:start -->") &&
    mechanismSummary[0]?.includes("<!-- buildchain:badges:end -->")
  ) {
    leadParts.push(mechanismSummary.shift());
  }
  return {
    lead: leadParts.join("\n"),
    mechanismSummary,
  };
}

function buildchainPageDescription() {
  return buildchainHomepageCopy.mechanismSummary?.[0] || "Buildchain Release Passport and release infrastructure for Kungfu products.";
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
    papers: "/papers/",
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
      papers: "https://papers.libkungfu.dev/",
    },
    staging: {
      hub: "https://staging.libkungfu.dev/",
      core: "https://core.staging.libkungfu.dev/",
      buildchain: "https://buildchain.staging.libkungfu.dev/",
      kfd: "https://kfd.staging.libkungfu.dev/",
      papers: "https://papers.staging.libkungfu.dev/",
    },
  };
  if (channel === "preview" && previewAlias) {
    hrefsByChannel.preview = {
      hub: `https://${previewAlias}.preview.libkungfu.dev/`,
      core: `https://core-${previewAlias}.preview.libkungfu.dev/`,
      buildchain: `https://buildchain-${previewAlias}.preview.libkungfu.dev/`,
      kfd: `https://kfd-${previewAlias}.preview.libkungfu.dev/`,
      papers: `https://papers-${previewAlias}.preview.libkungfu.dev/`,
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

function pageMachineEntryHref(current, pathPart) {
  const owningSurface = pathPart === "llms-full.txt" || ["core", "buildchain"].includes(current)
    ? "hub"
    : current;
  return owningSurface === current ? `/${pathPart}` : surfaceEndpointHref(owningSurface, pathPart);
}

function surfaceLinkAttrs(id) {
  return `href="${escapeAttr(surfaceCanonicalHref(id))}" data-local-href="${escapeAttr(surfaceSitePath(id))}"`;
}

function surfaceRouteLinkAttrs(id, routePath) {
  const normalizedRoute = String(routePath || "").replace(/^\/+/, "");
  return `href="${escapeAttr(surfaceEndpointHref(id, normalizedRoute))}" data-local-href="${escapeAttr(`${surfaceSitePath(id)}${normalizedRoute}`)}"`;
}

function readerActionLinkAttrs(surfaceId, href) {
  if (/^(?:https?:|#)/.test(href)) {
    return `href="${escapeAttr(href)}"`;
  }
  return surfaceRouteLinkAttrs(surfaceId, href);
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

function readPublicationRegistrySource() {
  return loadPublicationPackageSet(repoRoot);
}

function assertArchiveSlug(value, label) {
  const slug = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(slug)) {
    throw new Error(`invalid publication archive ${label}: ${value}`);
  }
  return slug;
}

function publicationPath(pathValue, label) {
  const value = String(pathValue || "").trim();
  if (!value.startsWith("/") || value.includes("..") || value.includes("//")) {
    throw new Error(`invalid publication archive path for ${label}: ${pathValue}`);
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function archiveOutputPath(urlPath, suffix = "") {
  const cleanPath = String(urlPath || "").replace(/^\/+/, "");
  return path.posix.join("papers", cleanPath, suffix);
}

function archiveHref(urlPath) {
  return surfaceEndpointHref("papers", String(urlPath || "").replace(/^\/+/, ""));
}

function archiveLocalHref(urlPath) {
  return `/${archiveOutputPath(urlPath).replace(/\/?$/, "/")}`;
}

function archiveLinkAttrs(urlPath) {
  return `href="${escapeAttr(archiveHref(urlPath))}" data-local-href="${escapeAttr(archiveLocalHref(urlPath))}"`;
}

function artifactHref(versionPath, artifactPath) {
  return archiveHref(`${versionPath}${artifactPath}`);
}

function artifactLocalHref(versionPath, artifactPath) {
  return `/${artifactOutputPath(versionPath, artifactPath)}`;
}

function artifactLinkAttrs(versionPath, artifactPath) {
  return `href="${escapeAttr(artifactHref(versionPath, artifactPath))}" data-local-href="${escapeAttr(artifactLocalHref(versionPath, artifactPath))}"`;
}

function artifactOutputPath(versionPath, artifactPath) {
  return archiveOutputPath(`${versionPath}${artifactPath}`);
}

function renderPublicationArtifacts(version) {
  return [
    ...version.artifacts,
    version.manifest,
    version.source.bundle,
    version.passport,
  ].map((artifact) => {
    const artifactPath = String(artifact.path || "").trim();
    if (!artifactPath || artifactPath.startsWith("/") || artifactPath.includes("..")) {
      throw new Error(`invalid publication artifact path: ${artifact.path}`);
    }
    const body = readPublicationArtifact(artifact);
    const digest = sha256Buffer(body);
    if (digest !== artifact.sha256) {
      throw new Error(`publication artifact digest mismatch for ${artifactPath}: expected ${artifact.sha256}, got ${digest}`);
    }
    const renderedArtifact = {
      ...artifact,
      path: artifactPath,
      sha256: digest,
    };
    Object.defineProperty(renderedArtifact, "body", { value: body, enumerable: false });
    return renderedArtifact;
  });
}

function publicationVersionCards(publication, versions) {
  return versions
    .map((version) => {
      const pdf = version.renderedArtifacts.find((artifact) => artifact.kind === "pdf") || version.renderedArtifacts[0];
      return `<article class="panel">
        <h3><a ${archiveLinkAttrs(version.immutablePath)}>Version ${escapeHtml(version.version)}</a></h3>
        <p>Immutable archive prefix: <code>${escapeHtml(version.immutablePath)}</code></p>
        <dl class="meta" style="margin-top: 14px;">
          <dt>released</dt>
          <dd><code>${escapeHtml(version.releasedAt)}</code></dd>
          <dt>source revision</dt>
          <dd><a href="${escapeAttr(version.source.repository)}"><code>${escapeHtml(version.source.commit)}</code></a></dd>
          <dt>primary PDF</dt>
          <dd><a ${artifactLinkAttrs(version.immutablePath, pdf.path)}><code>${escapeHtml(pdf.path)}</code></a></dd>
        </dl>
      </article>`;
    })
    .join("\n");
}

function renderPublicationArchives() {
  const source = readPublicationRegistrySource();
  source.packages = source.packages.map((entry) => ({
    ...entry,
    lockIntegrity: readPnpmLockPackage(entry.name, entry.version).integrity,
  }));
  const registry = source.registry;
  if (registry.contract !== "kungfu-buildchain-publication-release-registry") {
    throw new Error("publication registry contract mismatch");
  }
  if (!Array.isArray(registry.publications) || registry.publications.length === 0) {
    throw new Error("publication registry must expose publications");
  }

  const renderedRoutes = [];
  const immutableArtifacts = [];
  const normalizedPublications = registry.publications.map((publication) => {
    const id = assertArchiveSlug(publication.id, "publication id");
    const latestPath = publicationPath(publication.latest?.path, `${id} latest`);
    const versions = (publication.versions || []).map((version) => {
      const versionId = assertArchiveSlug(version.version, `${id} version`);
      const immutablePath = publicationPath(version.immutablePath, `${id} ${versionId} immutable path`);
      const expectedPrefix = publicationPath(publication.immutablePrefixTemplate.replaceAll("{version}", versionId), `${id} ${versionId} immutable template`);
      if (!version.immutable || immutablePath !== expectedPrefix) {
        throw new Error(`publication version ${id}@${versionId} must be immutable and match ${expectedPrefix}`);
      }
      return {
        ...version,
        version: versionId,
        immutablePath,
        renderedArtifacts: renderPublicationArtifacts(version),
      };
    });
    if (!versions.some((version) => version.version === publication.latest.version)) {
      throw new Error(`publication ${id} latest version is missing from versions: ${publication.latest.version}`);
    }
    return {
      ...publication,
      id,
      latest: {
        ...publication.latest,
        path: latestPath,
      },
      versions,
    };
  });

  const publicRegistry = {
    ...registry,
    source: {
      kind: source.kind,
      path: source.source,
      packages: source.packages,
    },
    publications: normalizedPublications.map((publication) => ({
      ...publication,
      versions: publication.versions.map(({ renderedArtifacts, ...version }) => version),
    })),
  };
  writeFile("papers/registry.json", `${JSON.stringify(publicRegistry, null, 2)}\n`);

  writeFile(
    "papers/index.html",
    page({
      title: "Kungfu Papers | papers.libkungfu.dev",
      description: "Kungfu product and research papers with reviewable publication evidence and immutable artifacts.",
      current: "papers",
      alternates: `  <link rel="alternate" type="application/json" title="Publication registry" href="${escapeAttr(surfaceEndpointHref("papers", "registry.json"))}">
  <link rel="alternate" type="application/json" title="Publication archive manifest" href="${escapeAttr(surfaceEndpointHref("papers", "manifest.json"))}">
  <link rel="alternate" type="text/plain" title="Publication archive agent entrypoint" href="${escapeAttr(surfaceEndpointHref("papers", "llms.txt"))}">`,
      body: `<section class="hero">
        <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a><span class="page-kicker-state">Publication archives</span></p>
        <h1>Kungfu Papers</h1>
        <p class="lead">Product and research papers that explain the principles, system direction, and evidence model behind Kungfu. Read the papers first; inspect their publication facts when you need to verify them.</p>
      </section>

      <section class="grid three publication-grid" aria-label="Kungfu papers">
        ${normalizedPublications
          .map((publication) => {
            const latestVersion = publication.versions.find((version) => version.version === publication.latest.version);
            const pdf = latestVersion.renderedArtifacts.find((artifact) => artifact.kind === "pdf");
            return `<article class="panel publication-card">
              <p class="eyebrow">${escapeHtml(publication.kind || "paper")}</p>
              <h2><a ${archiveLinkAttrs(`/${publication.id}/`)}>${escapeHtml(publication.title)}</a></h2>
              <p>${escapeHtml(publication.summary)}</p>
              <dl class="meta">
                <dt>latest release</dt>
                <dd><code>${escapeHtml(latestVersion.version)}</code></dd>
                <dt>published</dt>
                <dd><code>${escapeHtml(latestVersion.releasedAt.slice(0, 10))}</code></dd>
              </dl>
              <div class="card-actions">
                <a class="card-action" ${archiveLinkAttrs(`/${publication.id}/`)}>View paper</a>
                <a class="card-action" ${artifactLinkAttrs(latestVersion.immutablePath, pdf.path)}>Open PDF</a>
              </div>
            </article>`;
          })
          .join("\n")}
      </section>

      <section class="panel archive-boundary">
        <p class="eyebrow">Need versions, hashes, and provenance?</p>
        <h2>Publication evidence lives in the archive.</h2>
        <p>The reading shelf stays short. Open the archive only when you need manifests, source bundles, passports, and immutable version paths.</p>
        <div class="card-actions">
          <a class="card-action" ${archiveLinkAttrs("/archive/")}>Inspect publication evidence</a>
          <a class="card-action secondary" href="${escapeAttr(surfaceEndpointHref("papers", "registry.json"))}" data-local-href="/papers/registry.json">Open the registry</a>
        </div>
      </section>`,
    }),
  );
  renderedRoutes.push({ path: "/", host: surfaceCanonicalHost("papers"), source: source.source, routeKind: "registry-index" });

  writeFile(
    "papers/archive/index.html",
    page({
      title: "Publication evidence | papers.libkungfu.dev",
      description: "Version, source, manifest, passport, and immutable archive evidence for every Kungfu paper.",
      current: "papers",
      body: `<section class="hero">
        <p class="eyebrow page-kicker"><a ${archiveLinkAttrs("/")} aria-label="Back to Kungfu Papers">Back to Kungfu Papers</a><span class="page-kicker-state">archive / publication evidence</span></p>
        <h1>Publication evidence</h1>
        <p class="lead">Inspect versions, source revisions, PDFs, manifests, passports, and immutable archive paths without making every paper reader traverse release metadata first.</p>
      </section>

      <section class="panel archive-boundary">
        <h2>Archive contract</h2>
        <p>Each release preserves its PDF, source bundle, manifest, and passport under an immutable version path.</p>
        <dl class="meta" style="margin-top: 14px;">
          <dt>source</dt>
          <dd><code>${escapeHtml(source.source)}</code></dd>
          <dt>archive rule</dt>
          <dd>${escapeHtml(registry.archivePolicy.rule)}</dd>
          <dt>machine registry</dt>
          <dd><a href="${escapeAttr(surfaceEndpointHref("papers", "registry.json"))}" data-local-href="/papers/registry.json"><code>/registry.json</code></a></dd>
          <dt>archive manifest</dt>
          <dd><a href="${escapeAttr(surfaceEndpointHref("papers", "manifest.json"))}" data-local-href="/papers/manifest.json"><code>/manifest.json</code></a></dd>
        </dl>
      </section>

      <section class="section-heading">
        <p class="eyebrow">Published coordinates</p>
        <h2>Every paper and immutable release</h2>
      </section>
      <section class="grid">
        ${normalizedPublications.map((publication) => `<article class="panel">
          <h3><a ${archiveLinkAttrs(`/${publication.id}/`)}>${escapeHtml(publication.title)}</a></h3>
          <p>${escapeHtml(publication.summary)}</p>
          <div class="card-actions">
            <a class="card-action" ${archiveLinkAttrs(publication.latest.path)}>Latest evidence</a>
            <a class="card-action secondary" ${archiveLinkAttrs(`/${publication.id}/`)}>All versions</a>
          </div>
        </article>`).join("\n")}
      </section>`,
    }),
  );
  renderedRoutes.push({ path: "/archive/", host: surfaceCanonicalHost("papers"), source: source.source, routeKind: "evidence-index" });

  for (const publication of normalizedPublications) {
    const latestVersion = publication.versions.find((version) => version.version === publication.latest.version);
    const latestPdf = latestVersion.renderedArtifacts.find((artifact) => artifact.kind === "pdf");
    const latestManifest = latestVersion.renderedArtifacts.find((artifact) => artifact.kind === "manifest");
    const publicationBasePath = `/${publication.id}/`;
    const relatedReaderActions = (publication.relatedReaders || [])
      .map((reader) => `<a class="card-action" href="${escapeAttr(reader.url)}">${escapeHtml(reader.label)}</a>`)
      .join("\n");

    writeFile(
      archiveOutputPath(publicationBasePath, "index.html"),
      page({
        title: `${publication.title} | papers.libkungfu.dev`,
        description: publication.summary,
        current: "papers",
        body: `<section class="hero">
          <p class="eyebrow page-kicker"><a ${archiveLinkAttrs("/")} aria-label="Back to publication archives">Back to publication archives</a><span class="page-kicker-state">publication / ${escapeHtml(publication.id)}</span></p>
          <h1>${escapeHtml(publication.title)}</h1>
          <p class="lead">${escapeHtml(publication.summary)}</p>
          <div class="card-actions paper-primary-actions">
            <a class="card-action" ${artifactLinkAttrs(latestVersion.immutablePath, latestPdf.path)}>Read PDF</a>
            <a class="card-action" ${archiveLinkAttrs(publication.latest.path)}>Latest evidence</a>
            ${relatedReaderActions}
          </div>
        </section>

        <section class="panel">
          <h2>About this paper</h2>
          <dl class="meta">
            <dt>authors</dt>
            <dd>${escapeHtml((publication.authors || []).join(", ") || "Not declared")}</dd>
            <dt>current version</dt>
            <dd><code>${escapeHtml(latestVersion.version)}</code></dd>
            <dt>published</dt>
            <dd><code>${escapeHtml(latestVersion.releasedAt)}</code></dd>
            <dt>canonical URL</dt>
            <dd><code>${escapeHtml(publication.canonicalReader.url)}</code></dd>
            <dt>source repository</dt>
            <dd><a href="${escapeAttr(latestVersion.source.repository)}">${escapeHtml(latestVersion.source.repository)}</a></dd>
          </dl>
        </section>

        <section class="section-heading">
          <p class="eyebrow">Publication history</p>
          <h2>Versions and evidence</h2>
        </section>
        <section class="grid">
          ${publicationVersionCards(publication, publication.versions)}
        </section>`,
      }),
    );
    renderedRoutes.push({ path: publicationBasePath, host: surfaceCanonicalHost("papers"), source: source.source, routeKind: "publication-index" });

    writeFile(
      archiveOutputPath(publication.latest.path, "index.html"),
      page({
        title: `${publication.title} latest | papers.libkungfu.dev`,
        description: `Latest evidence route for ${publication.title}.`,
        current: "papers",
        body: `<section class="hero">
          <p class="eyebrow page-kicker"><a ${archiveLinkAttrs(`/${publication.id}/`)} aria-label="Back to publication page">Back to publication page</a><span class="page-kicker-state">latest / ${escapeHtml(latestVersion.version)}</span></p>
          <h1>${escapeHtml(publication.title)} latest</h1>
          <p class="lead">This mutable route points to the latest declared immutable version. Historical files remain under version prefixes.</p>
          <div class="card-actions paper-primary-actions">
            <a class="card-action" ${artifactLinkAttrs(latestVersion.immutablePath, latestPdf.path)}>Read PDF</a>
            <a class="card-action" ${artifactLinkAttrs(latestVersion.immutablePath, latestManifest.path)}>Open manifest</a>
          </div>
        </section>

        <section class="panel">
          <h2>Latest version</h2>
          <dl class="meta">
            <dt>version</dt>
            <dd><a ${archiveLinkAttrs(latestVersion.immutablePath)}><code>${escapeHtml(latestVersion.version)}</code></a></dd>
            <dt>immutable prefix</dt>
            <dd><code>${escapeHtml(latestVersion.immutablePath)}</code></dd>
            <dt>passport</dt>
            <dd><a ${artifactLinkAttrs(latestVersion.immutablePath, latestVersion.passport.path)}><code>${escapeHtml(latestVersion.passport.path)}</code></a></dd>
          </dl>
        </section>`,
      }),
    );
    renderedRoutes.push({ path: publication.latest.path, host: surfaceCanonicalHost("papers"), source: source.source, routeKind: "latest" });

    for (const version of publication.versions) {
      writeFile(
        archiveOutputPath(version.immutablePath, "index.html"),
        page({
          title: `${publication.title} ${version.version} | papers.libkungfu.dev`,
          description: `Immutable archive for ${publication.title} ${version.version}.`,
          current: "papers",
          preserveRelativeMachineEntries: true,
          immutableArchive: true,
          body: `<section class="hero">
            <p class="eyebrow page-kicker"><a ${archiveLinkAttrs(`/${publication.id}/`)} aria-label="Back to publication page">Back to publication page</a><span class="page-kicker-state">immutable / ${escapeHtml(version.version)}</span></p>
            <h1>${escapeHtml(publication.title)} ${escapeHtml(version.version)}</h1>
            <p class="lead">Immutable archive prefix. Later builds must preserve every file listed here.</p>
          </section>

          <section class="panel warning">
            <h2>Immutable route</h2>
            <p><strong>Append-only:</strong> <code>${escapeHtml(version.immutablePath)}</code></p>
          </section>

          <section class="panel" style="margin-top: 18px;">
            <h2>Artifacts</h2>
            <dl class="meta">
              ${version.renderedArtifacts
                .map((artifact) => `<dt>${escapeHtml(artifact.kind)}</dt>
                <dd><a ${artifactLinkAttrs(version.immutablePath, artifact.path)}><code>${escapeHtml(artifact.path)}</code></a><br><code>${escapeHtml(artifact.sha256)}</code></dd>`)
                .join("")}
            </dl>
          </section>`,
        }),
      );
      renderedRoutes.push({ path: version.immutablePath, host: surfaceCanonicalHost("papers"), source: source.source, routeKind: "version-index", immutable: true });

      for (const artifact of version.renderedArtifacts) {
        const outputPath = artifactOutputPath(version.immutablePath, artifact.path);
        writeBinaryFile(outputPath, artifact.body);
        const route = {
          path: `${version.immutablePath}${artifact.path}`,
          host: surfaceCanonicalHost("papers"),
          source: source.source,
          routeKind: `version-${artifact.kind}`,
          immutable: true,
          sha256: artifact.sha256,
          mediaType: artifact.mediaType,
        };
        renderedRoutes.push(route);
        immutableArtifacts.push({
          publication: publication.id,
          version: version.version,
          ...route,
        });
      }
    }
  }

  const archiveManifest = {
    schemaVersion: 1,
    contract: "libkungfu-dev-publication-archive-surface",
    ...surfaceTimestampPolicy,
    canonicalHost: surfaceCanonicalHost("papers"),
    source: {
      kind: source.kind,
      path: source.source,
      registryContract: registry.contract,
      packages: source.packages,
    },
    archivePolicy: registry.archivePolicy,
    publications: normalizedPublications.map((publication) => ({
      id: publication.id,
      kind: publication.kind,
      title: publication.title,
      summary: publication.summary,
      authors: publication.authors,
      package: publication.package,
      canonicalReader: publication.canonicalReader,
      relatedReaders: publication.relatedReaders,
      latest: {
        ...publication.latest,
        url: archiveHref(publication.latest.path),
      },
      versions: publication.versions.map((version) => ({
        version: version.version,
        immutablePath: version.immutablePath,
        immutableUrl: archiveHref(version.immutablePath),
        artifacts: version.renderedArtifacts.map((artifact) => ({
          kind: artifact.kind,
          path: artifact.path,
          url: artifactHref(version.immutablePath, artifact.path),
          sha256: artifact.sha256,
          mediaType: artifact.mediaType,
        })),
      })),
    })),
    routes: renderedRoutes,
    immutableArtifacts,
  };
  writeFile("papers/manifest.json", `${JSON.stringify(archiveManifest, null, 2)}\n`);
  writeFile(
    "papers/llms.txt",
    `# ${surfaceCanonicalHost("papers")}

Publication archives expose mutable latest routes and immutable version artifact prefixes.

Human entry:
- ${surfaceCanonicalHref("papers")}
- ${surfaceEndpointHref("papers", "archive/")} (publication evidence)

Agent-first entries:
- ${surfaceEndpointHref("papers", "manifest.json")}
- ${surfaceEndpointHref("papers", "registry.json")}
- ${surfaceEndpointHref("papers", "llms.txt")}

Papers:
${normalizedPublications
  .map((publication) => {
    const latestVersion = publication.versions.find((version) => version.version === publication.latest.version);
    const pdf = latestVersion.renderedArtifacts.find((artifact) => artifact.kind === "pdf");
    return `- ${publication.title}\n  Page: ${archiveHref(`/${publication.id}/`)}\n  Latest: ${archiveHref(publication.latest.path)}\n  PDF: ${artifactHref(latestVersion.immutablePath, pdf.path)}`;
  })
  .join("\n")}

Archive rule:
${registry.archivePolicy.rule}
`,
  );

  return {
    source,
    registry,
    manifest: archiveManifest,
    routes: renderedRoutes,
    immutableArtifacts,
  };
}

function page({ title, description, current, body, alternates = "", preserveRelativeMachineEntries = false, immutableArchive = false }) {
  const nav = [
    ["core", "Core"],
    ["buildchain", "Buildchain"],
    ["kfd", "KFD"],
    ["papers", "Papers"],
  ];

  const navHtml = nav
    .map(([id, label]) => {
      const active = id === current ? ' aria-current="page"' : "";
      return `<a ${surfaceLinkAttrs(id)}${active}>${escapeHtml(label)}</a>`;
    })
    .join("");
  const mainSiteUrl = site.homepage.futureProducts.url;
  const mainSiteLabel = new URL(mainSiteUrl).hostname.replace(/^www\./, "");
  const mainSiteHtml = immutableArchive
    ? ""
    : `<a class="main-site-link" href="${escapeAttr(mainSiteUrl)}" aria-label="Back to the Kungfu main site">${escapeHtml(mainSiteLabel)} <span aria-hidden="true">↗</span></a>`;
  const mainSiteStyles = immutableArchive ? "" : `
    .main-site-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 2px;
      padding-left: 18px;
      border-left: 1px solid var(--line);
      color: var(--fg);
      font-weight: 700;
    }

    .main-site-link:hover,
    .main-site-link:focus {
      color: var(--accent-strong);
    }

    .main-site-link span {
      font-size: 0.9em;
    }
`;
  const mainSiteTabletStyles = immutableArchive ? "" : `
      nav {
        width: 100%;
        gap: 14px;
      }

      .main-site-link {
        margin-left: 0;
        padding-left: 14px;
      }
`;
  const mainSiteMobileStyles = immutableArchive ? "" : `
    @media (max-width: 640px) {
      .main-site-link {
        flex-basis: 100%;
        padding: 12px 0 0;
        border-top: 1px solid var(--line);
        border-left: 0;
      }
    }
`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/json" title="libkungfu.dev manifest" href="${escapeAttr(preserveRelativeMachineEntries ? "/manifest.json" : pageMachineEntryHref(current, "manifest.json"))}">
  <link rel="alternate" type="text/plain" title="Agent entrypoint" href="${escapeAttr(preserveRelativeMachineEntries ? "/llms.txt" : pageMachineEntryHref(current, "llms.txt"))}">
  <link rel="alternate" type="text/plain" title="Full agent index" href="${escapeAttr(preserveRelativeMachineEntries ? "/llms-full.txt" : pageMachineEntryHref(current, "llms-full.txt"))}">
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
${current === "core" ? `
      --core-blue: #2563eb;
      --core-violet: #7c3aed;
      --core-green: #0f766e;
      --core-amber: #b45309;
      --core-grid: rgb(15 23 42 / 0.08);
` : ""}    }

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
${current === "core" ? `
        --core-blue: #60a5fa;
        --core-violet: #a78bfa;
        --core-green: #47c9ba;
        --core-amber: #f0b35a;
        --core-grid: rgb(226 232 240 / 0.08);
` : ""}      }
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
${mainSiteStyles}
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

${current === "core" ? `
    .core-hero {
      gap: 24px;
    }

    .core-hero-layout {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(560px, 1.25fr);
      gap: 36px;
      align-items: center;
    }

    .core-hero-copy {
      display: grid;
      gap: 22px;
    }

    .core-hero .authority-title {
      max-width: 680px;
      font-size: clamp(44px, 5vw, 68px);
    }

    .core-runtime-map {
      position: relative;
      margin: 0;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--core-blue) 32%, var(--line));
      border-radius: 18px;
      background:
        linear-gradient(var(--core-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--core-grid) 1px, transparent 1px),
        color-mix(in srgb, var(--soft) 94%, var(--core-blue));
      background-size: 28px 28px;
      padding: 18px;
      box-shadow: 0 24px 60px rgb(15 23 42 / 0.08);
    }

    .core-runtime-map figcaption {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .core-runtime-map figcaption::after {
      content: "implemented substrate";
      border: 1px solid color-mix(in srgb, var(--core-green) 44%, var(--line));
      border-radius: 999px;
      padding: 3px 8px;
      color: var(--core-green);
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .core-runtime-flow {
      display: grid;
      grid-template-columns: minmax(112px, 0.72fr) 42px minmax(176px, 1fr) 42px minmax(180px, 1.2fr);
      align-items: center;
      min-height: 320px;
    }

    .core-runtime-node {
      position: relative;
      z-index: 1;
      border: 1px solid var(--line);
      border-radius: 13px;
      background: color-mix(in srgb, var(--soft) 94%, transparent);
      padding: 14px;
      box-shadow: 0 10px 24px rgb(15 23 42 / 0.06);
    }

    .core-runtime-node strong,
    .core-runtime-node span {
      display: block;
    }

    .core-runtime-node strong {
      color: var(--fg);
      font-size: 14px;
      line-height: 1.25;
    }

    .core-runtime-node span {
      margin-top: 6px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
    }

    .core-writer-node {
      border-color: color-mix(in srgb, var(--core-violet) 48%, var(--line));
    }

    .core-journal-node {
      display: grid;
      gap: 12px;
      border-color: color-mix(in srgb, var(--core-blue) 52%, var(--line));
      background: color-mix(in srgb, var(--soft) 88%, var(--core-blue));
      padding: 16px;
    }

    .core-journal-qualifier {
      color: var(--core-blue) !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 700;
    }

    .core-journal-frames {
      display: grid;
      gap: 6px;
    }

    .core-journal-frame {
      position: relative;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--core-blue) 28%, var(--line));
      border-radius: 7px;
      background: var(--soft);
      padding: 6px 8px;
      color: var(--muted);
      font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .core-journal-frame::after {
      position: absolute;
      inset: 0;
      content: "";
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--core-blue) 22%, transparent), transparent);
      transform: translateX(-110%);
      animation: core-frame-publish 5.2s ease-in-out infinite;
    }

    .core-journal-frame:nth-child(2)::after { animation-delay: 0.45s; }
    .core-journal-frame:nth-child(3)::after { animation-delay: 0.9s; }
    .core-journal-frame:nth-child(4)::after { animation-delay: 1.35s; }

    .core-flow-link {
      position: relative;
      height: 2px;
      background: linear-gradient(90deg, var(--core-violet), var(--core-blue), var(--core-green));
      background-size: 220% 100%;
      animation: core-flow-shift 4.8s linear infinite;
    }

    .core-flow-link::after {
      position: absolute;
      top: 50%;
      right: -1px;
      width: 8px;
      height: 8px;
      border-top: 2px solid var(--core-green);
      border-right: 2px solid var(--core-green);
      content: "";
      transform: translateY(-50%) rotate(45deg);
    }

    .core-flow-link span {
      position: absolute;
      left: 50%;
      bottom: 8px;
      color: var(--muted);
      font-size: 9px;
      line-height: 1.2;
      text-align: center;
      transform: translateX(-50%);
      white-space: nowrap;
    }

    .core-reader-stack {
      position: relative;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .core-reader-node {
      min-height: 124px;
      border-color: color-mix(in srgb, var(--core-green) 36%, var(--line));
    }

    .core-reader-node::before {
      display: block;
      width: 7px;
      height: 7px;
      margin-bottom: 10px;
      border-radius: 999px;
      background: var(--core-green);
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--core-green) 13%, transparent);
      content: "";
      animation: core-reader-pulse 4.8s ease-in-out infinite;
    }

    .core-reader-node:nth-child(2)::before { animation-delay: 0.35s; }
    .core-reader-node:nth-child(3)::before { animation-delay: 0.7s; }
    .core-reader-node:nth-child(4)::before { animation-delay: 1.05s; }

    .core-reader-status {
      color: var(--core-green) !important;
      font-size: 9px !important;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .core-outcome-grid {
      grid-template-rows: auto auto;
    }

    .core-outcome-card {
      display: grid;
      grid-row: span 2;
      grid-template-rows: subgrid;
      gap: 10px;
      border-top: 3px solid var(--core-blue);
    }

    .core-semantic-boundary {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
      gap: 28px;
      margin-top: 18px;
      border-color: color-mix(in srgb, var(--core-violet) 36%, var(--line));
    }

    .core-invariant-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .core-invariant-list li {
      margin: 0;
      border-left: 3px solid var(--core-violet);
      padding: 7px 10px;
      background: color-mix(in srgb, var(--core-violet) 6%, var(--soft));
      color: var(--fg);
      font-size: 13px;
      font-weight: 700;
    }

    .grid.four {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .core-frontier-card {
      border-top: 3px solid var(--line);
    }

    .core-frontier-card[data-status="implemented"] {
      border-top-color: var(--core-green);
    }

    .core-frontier-card[data-status="candidate-qualified"] {
      border-top-color: var(--core-amber);
    }

    .core-frontier-status {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .core-qualification {
      margin-top: 18px;
    }

    .core-evidence-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 18px;
      padding: 0;
      list-style: none;
    }

    .core-evidence-list li {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
    }

    .core-evidence-list a {
      display: block;
      font-weight: 700;
    }

    .core-evidence-list code {
      display: block;
      margin-top: 7px;
      border: 0;
      background: transparent;
      padding: 0;
      color: var(--muted);
      font-size: 10px;
    }

    .core-source-contract {
      margin-top: 18px;
    }

    .core-source-contract summary {
      cursor: pointer;
      color: var(--fg);
      font-size: 18px;
      font-weight: 700;
    }

    .core-source-contract[open] summary {
      margin-bottom: 18px;
    }

    @keyframes core-frame-publish {
      0%, 18% { transform: translateX(-110%); }
      48%, 100% { transform: translateX(110%); }
    }

    @keyframes core-flow-shift {
      to { background-position: -220% 0; }
    }

    @keyframes core-reader-pulse {
      0%, 20%, 100% { opacity: 0.45; transform: scale(0.8); }
      42%, 70% { opacity: 1; transform: scale(1); }
    }

` : ""}    .eyebrow {
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

    .publication-grid {
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    }

    .publication-card {
      display: grid;
      grid-row: span 5;
      grid-template-rows: subgrid;
      gap: 14px;
      align-content: stretch;
    }

    .publication-card .card-actions {
      align-self: end;
    }

    .publication-card .meta {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .publication-card .meta dd {
      text-align: right;
    }

    .publication-card .meta code {
      white-space: nowrap;
    }

    .archive-boundary {
      margin-top: 18px;
    }

    .paper-primary-actions {
      justify-content: flex-start;
    }

    .section-heading {
      margin: 48px 0 18px;
    }
${current === "papers" ? "" : `
    .page-kicker {
      min-width: 0;
    }

    .page-kicker > * {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .reader-orientation {
      display: grid;
      min-width: 0;
      gap: 18px;
      margin-bottom: 48px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 42px;
    }

    .reader-orientation h1 {
      max-width: 900px;
      overflow-wrap: anywhere;
    }

    .reader-orientation .lead {
      max-width: 820px;
    }

    .authority-title {
      max-width: 820px;
      font-size: clamp(34px, 4.2vw, 56px);
      line-height: 1.04;
    }

    .reader-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .reader-action {
      display: inline-flex;
      align-items: center;
      min-height: 42px;
      border: 1px solid var(--accent);
      border-radius: 999px;
      background: var(--accent-strong);
      color: var(--soft);
      padding: 7px 15px;
      font-weight: 750;
      text-decoration: none;
    }

    .reader-action.secondary {
      background: transparent;
      color: var(--accent-strong);
    }

    .reader-chain {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-auto-rows: 1fr;
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .reader-layer-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 18px;
      padding: 0;
      list-style: none;
    }

    .reader-layer-strip li {
      display: grid;
      gap: 4px;
      margin: 0;
      border-bottom: 2px solid var(--accent);
      padding: 0 2px 10px;
    }

    .reader-layer-strip strong {
      font-size: 12px;
    }

    .reader-layer-strip span {
      color: var(--muted);
      font-size: 10px;
      line-height: 1.35;
    }

    .reader-card,
    .reader-supply-card {
      display: grid;
      min-width: 0;
      align-content: start;
      gap: 10px;
      margin: 0;
      border: 1px solid var(--line);
      border-top: 4px solid var(--accent);
      border-radius: 9px;
      background: var(--soft);
      padding: 17px;
    }

    .reader-card p,
    .reader-supply-card p,
    .reader-supply-chain > div > p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .reader-card-role {
      color: var(--accent-strong) !important;
      font-size: 11px !important;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .reader-sources {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px 8px;
      margin-top: auto;
      padding-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }

    .reader-sources > span {
      font-weight: 750;
      text-transform: uppercase;
    }

    .reader-supply-chain {
      display: grid;
      gap: 18px;
      margin-top: 18px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: color-mix(in srgb, var(--soft) 88%, var(--bg));
      padding: clamp(18px, 3vw, 28px);
    }

    .reader-supply-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .reader-supply-card {
      border-top-width: 1px;
      background: var(--bg);
      padding: 14px;
    }

    .reader-claim-boundary {
      margin: 0;
      border-left: 3px solid var(--warn);
      background: var(--bg);
      padding: 12px 14px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .buildchain-reader-story {
      display: grid;
      gap: 18px;
      margin-bottom: 48px;
    }

    .buildchain-story-panel {
      display: grid;
      gap: 18px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: color-mix(in srgb, var(--soft) 90%, var(--bg));
      padding: clamp(20px, 3vw, 30px);
    }

    .buildchain-story-panel > header {
      display: grid;
      gap: 10px;
      border: 0;
      background: transparent;
    }

    .buildchain-story-panel > header p,
    .buildchain-story-card p,
    .buildchain-ownership p {
      margin: 0;
      color: var(--muted);
    }

    .buildchain-trust-loop,
    .buildchain-value-grid,
    .buildchain-ecosystem-loop {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .buildchain-trust-loop,
    .buildchain-value-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .buildchain-ecosystem-loop {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .buildchain-story-card {
      position: relative;
      display: grid;
      min-width: 0;
      align-content: start;
      gap: 9px;
      margin: 0;
      border: 1px solid var(--line);
      border-top: 4px solid var(--accent);
      border-radius: 8px;
      background: var(--bg);
      padding: 16px;
    }

    .buildchain-trust-loop .buildchain-story-card:not(:last-child)::after,
    .buildchain-ecosystem-loop .buildchain-story-card:not(:last-child)::after {
      content: "→";
      position: absolute;
      z-index: 1;
      top: 50%;
      right: -19px;
      width: 24px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--soft);
      color: var(--accent-strong);
      text-align: center;
      transform: translateY(-50%);
    }

    .buildchain-value-grid .buildchain-story-card {
      border-top-color: var(--accent-strong);
    }

    .buildchain-ecosystem-loop .buildchain-story-card {
      border-top-color: var(--warn);
    }

    .buildchain-ownership {
      border-color: color-mix(in srgb, var(--accent) 65%, var(--line));
      background: color-mix(in srgb, var(--accent) 8%, var(--soft));
    }

    .buildchain-ownership-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .buildchain-ownership-list li {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg);
      padding: 7px 11px;
      color: var(--fg);
      font-size: 12px;
      font-weight: 700;
    }
`}
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

    .card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px 16px;
      margin-top: 16px;
    }

    .card-actions .card-action {
      margin-top: 0;
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
${mainSiteTabletStyles}
      main {
        padding-top: 42px;
      }

      .grid,
      .grid.three {
        grid-template-columns: 1fr;
      }
${current === "papers" ? "" : `
      .reader-chain,
      .reader-layer-strip,
      .reader-supply-grid,
      .buildchain-trust-loop,
      .buildchain-value-grid,
      .buildchain-ecosystem-loop {
        grid-template-columns: 1fr;
      }

      .buildchain-trust-loop .buildchain-story-card:not(:last-child)::after,
      .buildchain-ecosystem-loop .buildchain-story-card:not(:last-child)::after {
        content: "↓";
        top: auto;
        right: 50%;
        bottom: -19px;
        transform: translateX(50%);
      }

      .page-kicker-state {
        width: 100%;
        margin-left: 0;
        text-align: left;
      }
`}
${current === "core" ? `
      .grid.four {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .core-hero-layout,
      .core-semantic-boundary {
        grid-template-columns: 1fr;
      }

      .core-hero .authority-title {
        max-width: 760px;
      }

      .core-outcome-grid {
        grid-template-rows: none;
      }

      .core-outcome-card {
        grid-row: auto;
        grid-template-rows: none;
      }

` : ""}      .meta {
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
      .practice-guideline-list,
      .publication-grid {
        grid-template-rows: none;
      }

      .publication-card {
        grid-row: auto;
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
${mainSiteMobileStyles}
${current === "core" ? `
    @media (max-width: 640px) {
      .core-runtime-map {
        padding: 14px;
      }

      .core-runtime-map figcaption {
        align-items: flex-start;
        flex-direction: column;
      }

      .core-runtime-flow {
        grid-template-columns: 1fr;
        gap: 14px;
        min-height: 0;
      }

      .core-flow-link {
        width: 2px;
        height: 34px;
        justify-self: center;
        background: linear-gradient(180deg, var(--core-violet), var(--core-blue), var(--core-green));
        background-size: 100% 220%;
      }

      .core-flow-link::after {
        top: auto;
        right: 50%;
        bottom: -1px;
        border-top: 0;
        border-bottom: 2px solid var(--core-green);
        transform: translateX(50%) rotate(45deg);
      }

      .core-flow-link span {
        top: 50%;
        bottom: auto;
        left: 12px;
        transform: translateY(-50%);
      }

      .core-reader-node {
        min-height: 0;
      }
    }

` : ""}    @media (max-width: 480px) {
${current === "core" ? `
      .grid.four,
      .core-evidence-list {
        grid-template-columns: 1fr;
      }

      .core-reader-stack {
        grid-template-columns: 1fr;
      }

` : ""}      .foundation-fields div,
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
${current === "core" ? `

    @media (prefers-reduced-motion: reduce) {
      .core-journal-frame::after,
      .core-flow-link,
      .core-reader-node::before {
        animation: none;
      }

      .core-journal-frame::after {
        display: none;
      }

      .core-reader-node::before {
        opacity: 1;
        transform: none;
      }
    }
` : ""}  </style>
</head>
<body>
  <header>
    <div class="bar">
      <a class="brand" ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">libkungfu.dev</a>
      <nav aria-label="Primary">${navHtml}${mainSiteHtml}</nav>
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
  <link rel="alternate" type="application/json" title="KFD candidate registry" href="${escapeAttr(surfaceEndpointHref("kfd", "drafts/registry.json"))}">
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

function runtimeSourceHref(sourcePath) {
  return `${runtimeSurface.source.repository}/blob/${runtimeSurface.source.sourceCommit}/${sourcePath}`;
}

function architectureSourceHref(source, document) {
  return `${source.repository}/blob/${source.commit}/${document.path}`;
}

function renderActionWorldStep(step) {
  const components = step.components?.length
    ? `<ul class="action-components">${step.components.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`
    : "";
  return `<li class="action-step" data-action-kind="${escapeAttr(step.kind)}">
    <span class="architecture-node-label">${escapeHtml(step.label)}</span>
    <strong>${escapeHtml(step.question)}</strong>
    <p>${escapeHtml(step.detail)}</p>
    ${components}
  </li>`;
}

function renderFoundationLayer(layer) {
  return `<article class="foundation-card" data-foundation-kind="${escapeAttr(layer.kind)}">
    <span class="architecture-node-label">${escapeHtml(layer.label)}</span>
    <p>${escapeHtml(layer.detail)}</p>
  </article>`;
}

function renderHub(hub) {
  return `<article class="hub-node" data-hub="${escapeAttr(hub.id)}">
    <p class="eyebrow">Participant-owned control plane</p>
    <h3>${escapeHtml(hub.label)}</h3>
    <ol>${hub.layers.map((layer) => `<li>${escapeHtml(layer)}</li>`).join("")}</ol>
  </article>`;
}

function renderExchangeStep(step) {
  return `<li>
    <strong>${escapeHtml(step.label)}</strong>
    <span>${escapeHtml(step.detail)}</span>
  </li>`;
}

function renderInvariant(invariant) {
  return `<article class="invariant-card">
    <p class="invariant-equation"><span>${escapeHtml(invariant.left)}</span><b aria-label="is not">≠</b><span>${escapeHtml(invariant.right)}</span></p>
    <p>${escapeHtml(invariant.detail)}</p>
  </article>`;
}

function formatMetric(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function renderDogfoodMetric(metric, emphasis = false) {
  return `<article class="dogfood-metric${emphasis ? " dogfood-metric-primary" : ""}">
    <strong>${escapeHtml(formatMetric(metric.value))}</strong>
    <span>${escapeHtml(metric.label)}</span>
  </article>`;
}

function renderRepositoryBar(repository, maximum) {
  const percentage = Math.max(1, Math.round((repository.mergedPublicPullRequests / maximum) * 100));
  return `<li class="repo-work-row">
    <span>${escapeHtml(repository.name)}</span>
    <span class="repo-work-track" aria-hidden="true"><span style="width: ${percentage}%"></span></span>
    <strong>${escapeHtml(formatMetric(repository.mergedPublicPullRequests))}</strong>
  </li>`;
}

function renderDogfoodCase(evidenceCase, index) {
  const rootEntries = Object.entries(evidenceCase.roots || {});
  return `<article class="dogfood-case" id="${escapeAttr(evidenceCase.id)}">
    <div class="case-index" aria-hidden="true">0${index + 1}</div>
    <div class="case-copy">
      <p class="eyebrow">${escapeHtml(evidenceCase.evidenceClass)} · ${escapeHtml(evidenceCase.status)}</p>
      <h2>${escapeHtml(evidenceCase.title)}</h2>
      <p>${escapeHtml(evidenceCase.summary)}</p>
      <dl class="case-roots">
        ${rootEntries.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd><code title="${escapeAttr(value)}">${escapeHtml(value)}</code></dd>`).join("")}
      </dl>
      <div class="card-actions">
        ${evidenceCase.links.map((link) => `<a class="card-action" href="${escapeAttr(link.url)}">${escapeHtml(link.label)}</a>`).join("")}
      </div>
    </div>
  </article>`;
}

function dogfoodLiveProjectionScript() {
  return `<script>
  (() => {
    const number = new Intl.NumberFormat("en-US");
    const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    const render = (evidence) => {
      document.documentElement.dataset.dogfoodSnapshot = evidence.snapshotId;
      setText("dogfood-state", "public dogfood / latest observed");
      setText("dogfood-window-start", evidence.observation.window.startInclusive);
      setText("dogfood-window-end", evidence.observation.window.endInclusive);
      setText("dogfood-pr-total", number.format(evidence.metrics.mergedPublicPullRequests.value));
      setText("dogfood-pr-caption", evidence.metrics.mergedPublicPullRequests.label + " across " + number.format(evidence.metrics.repositoriesWithMergedPullRequests.value) + " repositories");
      setText("dogfood-observed-at", evidence.observation.observedAt);
      setText("dogfood-query", evidence.sources.github.baseQuery);
      const cut = document.getElementById("dogfood-cut");
      if (cut) {
        cut.textContent = evidence.sources.projectCuts.gitCommit;
        cut.href = evidence.sources.projectCuts.repository + "/tree/" + evidence.sources.projectCuts.gitCommit + "/.kungfu/project-cuts";
      }
      const metrics = document.getElementById("dogfood-live-metrics");
      if (metrics) {
        metrics.replaceChildren(...[
          ["reviewSearchMatches", false],
          ["retainedPublicProjectCuts", true],
          ["projectCutsWithEpisodeDelta", false],
          ["projectCutTitleMatches", false],
        ].map(([key, primary]) => {
          const article = document.createElement("article");
          article.className = "dogfood-metric" + (primary ? " dogfood-metric-primary" : "");
          const strong = document.createElement("strong");
          strong.textContent = number.format(evidence.metrics[key].value);
          const span = document.createElement("span");
          span.textContent = evidence.metrics[key].label;
          article.append(strong, span);
          return article;
        }));
      }
      const repositories = document.getElementById("dogfood-live-repositories");
      if (repositories) {
        const maximum = Math.max(1, ...evidence.repositories.map((entry) => entry.mergedPublicPullRequests));
        repositories.replaceChildren(...evidence.repositories.map((entry) => {
          const row = document.createElement("li");
          row.className = "repo-work-row";
          const name = document.createElement("span");
          name.textContent = entry.name;
          const track = document.createElement("span");
          track.className = "repo-work-track";
          track.setAttribute("aria-hidden", "true");
          const bar = document.createElement("span");
          bar.style.width = Math.max(1, Math.round(entry.mergedPublicPullRequests / maximum * 100)) + "%";
          track.append(bar);
          const value = document.createElement("strong");
          value.textContent = number.format(entry.mergedPublicPullRequests);
          row.append(name, track, value);
          return row;
        }));
      }
    };
    fetch("/dogfood-evidence.json", { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("evidence fetch failed"); return response.json(); })
      .then(render)
      .catch(() => setText("dogfood-state", "public dogfood / retained fallback"));
  })();
  </script>`;
}

function runtimeQuickstartCard(quickstart) {
  return `<article class="panel quickstart-card">
    <div>
      <p class="eyebrow">${escapeHtml(quickstart.language)}</p>
      <h3>Open and close one native Episode</h3>
    </div>
    <pre><code>${escapeHtml(quickstart.command)}</code></pre>
    <a class="card-action" href="${escapeAttr(runtimeSourceHref(quickstart.sourcePath))}">Read the exact source</a>
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
        <div class="card-actions">
          <a class="card-action" href="${escapeAttr(path)}">Read ${escapeHtml(entry.id)}</a>
          ${usageAction}
        </div>
      </article>`;
    })
    .join("\n");
}

function kfdDecisionNav(currentEntry, currentPage = "decision", currentCandidate, currentCandidateFormal) {
  const currentNumber = currentEntry ? String(currentEntry.number) : undefined;
  const candidateLinks = currentCandidate
    ? [
        `<a class="doc-nav-child" href="${escapeAttr(currentCandidate.url)}"${currentPage === "candidate" ? ' aria-current="page"' : ""}>${escapeHtml(currentCandidate.title)}</a>`,
        currentPage === "candidate-formal" && currentCandidateFormal
          ? `<a class="doc-nav-child" style="margin-left: 28px;" href="${escapeAttr(currentCandidateFormal.url)}" aria-current="page">Formal candidate</a>`
          : "",
      ].join("")
    : "";
  const links = kfdRegistry.entries
    .map((entry) => {
      const isCurrentDecision = String(entry.number) === currentNumber && currentPage === "decision";
      const usagePage = kfdUsagePageByDecisionNumber.get(String(entry.number));
      const formalPage = kfdFormalPageByDecisionNumber.get(String(entry.number));
      const isCurrentUsage = String(entry.number) === currentNumber && currentPage === "usage";
      const isCurrentFormal = String(entry.number) === currentNumber && currentPage === "formal";
      const usageLink = usagePage?.sourceExists && isCurrentUsage
        ? `<a class="doc-nav-child" href="/${escapeAttr(entry.number)}/usage/" aria-current="page">Usage</a>`
        : "";
      const formalLink = formalPage?.sourceExists && isCurrentFormal
        ? `<a class="doc-nav-child" href="/${escapeAttr(entry.number)}/formal/" aria-current="page">Formal reference</a>`
        : "";
      return `<a href="/${escapeAttr(entry.number)}/"${isCurrentDecision ? ' aria-current="page"' : ""}>${escapeHtml(entry.id)}</a>${usageLink}${formalLink}`;
    })
    .join("\n");
  return `<nav class="doc-global-nav" aria-label="Kung Fu Decisions">
    <h2>Kung Fu Decisions</h2>
    <div class="doc-nav-group">
      <a ${surfaceLinkAttrs("kfd")}>Overview</a>
      <a href="${escapeAttr(kfdFoundationPath)}"${currentPage === "foundation" ? ' aria-current="page"' : ""}>Foundation model</a>
      <a href="${escapeAttr(kfdFormalModelPath)}"${currentPage === "formal-model" ? ' aria-current="page"' : ""}>Formal model</a>
      <a href="${escapeAttr(kfdTerminologyPath)}"${currentPage === "terminology" ? ' aria-current="page"' : ""}>Terminology</a>
      <a href="${escapeAttr(kfdCasesPath)}"${currentPage === "cases" ? ' aria-current="page"' : ""}>Historical cases</a>
      ${links}
      <a href="${escapeAttr(kfdCandidateIndexPath)}"${currentPage === "candidates" ? ' aria-current="page"' : ""}>Candidates</a>
      ${candidateLinks}
    </div>
  </nav>`;
}

const site = readFixtureJson("site-manifest.json");
const core = readFixtureJson("core-runtime-surface.json");
const runtimeSurface = readFixtureJson("libkungfu-runtime-surface.json");
const dogfoodEvidence = readFixtureJson("dogfood-evidence.json");
const buildchainSite = readPackageJson("@kungfu-tech/buildchain/site/buildchain-site.json");
const buildchainHomepageCopy = normalizeBuildchainHomepageCopy(buildchainSite.homepage);
const buildchainPackage = readPackageJson("@kungfu-tech/buildchain/package.json");
const buildchainCli = readPackageJson("@kungfu-tech/buildchain/site/cli-registry.json");
const buildchainWorkflow = readPackageJson("@kungfu-tech/buildchain/site/workflow-registry.json");
const buildchainReleaseModel = readPackageJson("@kungfu-tech/buildchain/site/release-model.json");
const buildchainArtifactSchemas = readPackageJson("@kungfu-tech/buildchain/site/artifact-schemas.json");
const buildchainProductMechanism = readPackageJson("@kungfu-tech/buildchain/site/product-mechanism.json");
const buildchainReleaseProvenance = readPackageJson("@kungfu-tech/buildchain/site/release-provenance.json");
const buildchainAgentIndex = readPackageJson("@kungfu-tech/buildchain/site/agent-index.json");
const whitePaperPackageRoot = packageRoot("@kungfu-tech/paper-kungfu-product-white-paper");
const whitePaperEvidence = readJsonFile(path.join(whitePaperPackageRoot, "site", "evidence-site.json"));
const agentSupplyChain = whitePaperEvidence.agentSupplyChain;
const kfdSite = readPackageJson("@kungfu-tech/kfd/site/kfd-site.json");
const kfdPackage = readPackageJson("@kungfu-tech/kfd/package.json");
const kfdTerminology = readPackageJson("@kungfu-tech/kfd/terminology.json");
const kfdTerminologySchema = readPackageJson("@kungfu-tech/kfd/schemas/kfd-terminology.schema.json");
const kfdRegistry = readPackageJson("@kungfu-tech/kfd/registry.json");
const kfdCandidateRegistry = readPackageJson("@kungfu-tech/kfd/drafts/registry.json");
const kfdCaseRegistry = readPackageJson("@kungfu-tech/kfd/cases/registry.json");
const kfdStandards = readPackageJson("@kungfu-tech/kfd/standards.json");
const kfdPropagationLockPath = fs.existsSync(path.join(repoRoot, ".buildchain", "upstreams", "kfd.release.json"))
  ? path.join(repoRoot, ".buildchain", "upstreams", "kfd.release.json")
  : path.join(repoRoot, "buildchain.upstreams", "kfd.release.json");
const kfdPropagationLock = readOptionalJsonFile(kfdPropagationLockPath);
const kfdSourceRepository = "https://github.com/kungfu-systems/kfd";
const kfdSourceRef = kfdPropagationLock?.upstream?.sourceSha
  || kfdPropagationLock?.upstream?.tag
  || "main";
const kfdSourceHref = (sourcePath = "") =>
  `${kfdSourceRepository}/blob/${encodeURIComponent(kfdSourceRef)}/${sourcePath}`;
const expectedBuildchainVersion = "2.14.14-alpha.4";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.41";
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
if (
  agentSupplyChain?.contract !== "kungfu-agent-supply-chain-public-narrative/v1"
  || agentSupplyChain.layers?.map((layer) => layer.id).join(",") !== "kfd-3,buildchain,kfd-2,libkungfu,agent-hub-portability"
  || agentSupplyChain.maturityVocabulary?.join(",") !== "proved-now,enabled-by-protocol,not-claimed"
  || agentSupplyChain.notClaimed?.includes("two independent production Hubs") !== true
  || agentSupplyChain.notClaimed?.includes("external vendor adoption or endorsement") !== true
  || !agentSupplyChain.vendorNextAction?.includes("30-day assessment")
  || agentSupplyChain.layers.some((layer) => !layer.owner || !layer.input || !layer.output)
  || agentSupplyChain.layers.some((layer) => !layer.evidenceCoordinates?.length || !layer.knownLimits?.length)
) {
  throw new Error("unexpected Agent Supply Chain narrative contract");
}
const buildchainSupplyLayer = agentSupplyChain.layers.find((layer) => layer.id === "buildchain");
if (
  buildchainProductMechanism.agentSupplyChain?.order !== buildchainSupplyLayer.order
  || buildchainProductMechanism.agentSupplyChain?.statusClass !== buildchainSupplyLayer.statusClass
) {
  throw new Error("Buildchain and white-paper Agent Supply Chain facts drifted");
}
if (
  core.contract !== "libkungfu-core-runtime-surface-fixture"
  || core.status !== "evidence-linked-fixture"
  || !core.sourceRef
  || !core.homepage?.headline
  || !core.architecture?.journal
  || !Array.isArray(core.evidence)
  || !core.sourceContract
) {
  throw new Error("unexpected Core runtime surface fixture");
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
    "scripts/publication-packages.cjs",
    "src/fixtures/*.json",
    "src/publication-packages.json",
    "pnpm-lock.yaml",
    "@kungfu-tech/buildchain package content",
    "@kungfu-tech/kfd package content",
    "declared @kungfu-tech/paper-* package content",
  ],
  artifactDigestScope: "site dist manifest JSON files",
});
const buildchainBadgeEndpoints = renderBuildchainBadgeEndpoints();
const publicationArchives = renderPublicationArchives();
const buildchainPrimarySectionIds = buildchainSite.homepage.displayPlan?.primary || [];
const buildchainSupportSectionIds = buildchainSite.homepage.displayPlan?.support || [];
const buildchainFirstScreenSectionIds = (buildchainSite.homepage.displayPlan?.firstScreen?.include || [])
  .filter((id) => buildchainSite.homepage.sections?.some((section) => section.id === id));
const buildchainRendererContract = buildchainSite.homepage.rendererContract;
const kfdSupportSectionIds = kfdSite.homepage.displayPlan?.support || [];
const kfdUsagePages = kfdSite.decisionPages?.usagePages?.pages || [];
const kfdUsagePageByDecisionNumber = new Map(kfdUsagePages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const kfdFormalPages = kfdSite.decisionPages?.formalPages?.pages || [];
const kfdFormalPageByDecisionNumber = new Map(kfdFormalPages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const kfdCandidatePages = kfdSite.candidatePages?.pages || [];
const kfdCandidatePageById = new Map(kfdCandidatePages.map((pageEntry) => [pageEntry.id, pageEntry]));
const kfdCandidateFormalPages = kfdSite.candidatePages?.formalPages?.pages || [];
const kfdCandidateFormalPageByCandidateId = new Map(
  kfdCandidateFormalPages.map((pageEntry) => [pageEntry.candidateId, pageEntry]),
);
const kfdCandidateIndexPath = `${kfdSite.candidatePages?.indexUrl?.replace(/\/+$/, "") || "/drafts"}/`;
const kfdDecisionMetadataCodeLinks = {
  "kungfu-systems/kfd": kfdSourceRepository,
  [kfdSourceRepository]: kfdSourceRepository,
  "decisions/KFD-N.md": "#current-decisions",
  "registry.json": "/registry.json",
  "standards.json": "/standards.json",
  "drafts/registry.json": "/drafts/registry.json",
  "cases/registry.json": "/cases/registry.json",
  "https://kfd.libkungfu.dev": "/",
  "https://kfd.libkungfu.dev/N": "#current-decisions",
  "kfd.libkungfu.dev": "/",
};
const kfdFoundationPath = `${kfdSite.foundationPage.url.replace(/\/+$/, "")}/`;
const kfdFormalModelPath = `${kfdSite.formalPage.url.replace(/\/+$/, "")}/`;
const kfdTerminologyPath = `${kfdSite.terminologyPage.url.replace(/\/+$/, "")}/`;
const kfdCasesPath = `${kfdSite.casesPage.url.replace(/\/+$/, "")}/`;
const kfdPageRouteBySourcePath = new Map([
  [kfdSite.foundationPage.sourcePath, kfdFoundationPath],
  [kfdSite.formalPage.sourcePath, kfdFormalModelPath],
  [kfdSite.terminologyPage.sourcePath, kfdTerminologyPath],
  [kfdSite.casesPage.sourcePath, kfdCasesPath],
  ["terminology.json", "/terminology.json"],
  ["schemas/kfd-terminology.schema.json", "/schemas/kfd-terminology.schema.json"],
  ...kfdRegistry.entries.map((entry) => [entry.path, `/${entry.number}/`]),
  ...kfdUsagePages
    .filter((pageEntry) => pageEntry.sourceExists)
    .map((pageEntry) => [pageEntry.sourcePath || pageEntry.path, `/${pageEntry.decisionNumber}/usage/`]),
  ...kfdFormalPages
    .filter((pageEntry) => pageEntry.sourceExists)
    .map((pageEntry) => [pageEntry.sourcePath || pageEntry.path, `/${pageEntry.decisionNumber}/formal/`]),
  [kfdSite.kfdCandidates.source, `${kfdCandidateIndexPath}registry.json`],
  ...kfdCandidatePages.map((pageEntry) => [pageEntry.sourcePath, pageEntry.url]),
  ...kfdCandidateFormalPages.map((pageEntry) => [pageEntry.sourcePath, pageEntry.url]),
]);

function normalizeKfdHomepageLink(entry) {
  const href = kfdPageRouteBySourcePath.get(entry.sourceTarget) || entry.url;
  if (href.startsWith("/") && !href.endsWith("/") && !href.includes("#") && !path.posix.basename(href).includes(".")) {
    return `${href}/`;
  }
  return href;
}
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

function kfdFoundationModelExplanationMarkdown() {
  const explanation = kfdSite.homepage.foundation.explanation || [];
  const sectionMarkdown = kfdHomepageSection("foundation-structure")?.markdown || "";
  const firstParagraph = explanation[0] || "";
  const marker = firstParagraph.includes(":")
    ? `${firstParagraph.split(":", 1)[0]}:`
    : firstParagraph.slice(0, 48);
  const explanationOffset = marker ? sectionMarkdown.indexOf(marker) : -1;
  if (explanation.length === 0) {
    return "";
  }
  if (explanationOffset < 0) {
    throw new Error("KFD foundation explanation is missing from its bundle-owned Markdown section");
  }
  return sectionMarkdown.slice(explanationOffset);
}

function kfdFuturePictureHero() {
  const futurePicture = kfdSite.homepage.futurePicture || {};
  const question = futurePicture.question
    || futurePicture.pastToFuture
    || kfdSite.homepage.lead;
  const engineeringAnswer = futurePicture.engineeringAnswer
    || futurePicture.kungfuPath;
  const claimBoundary = futurePicture.claimBoundary;

  return [
    `<p class="lead" data-kfd-future-picture="question">${inlineMarkdown(question)}</p>`,
    engineeringAnswer
      ? `<p class="hero-answer" style="max-width: 820px; color: var(--fg); font-size: 18px; line-height: 1.5;" data-kfd-future-picture="engineering-answer">${inlineMarkdown(engineeringAnswer)}</p>`
      : "",
    claimBoundary
      ? `<p class="hero-claim-boundary" style="max-width: 820px; font-size: 14px; line-height: 1.55;" data-kfd-future-picture="claim-boundary">${inlineMarkdown(claimBoundary)}</p>`
      : "",
  ].filter(Boolean).join("\n");
}

function kfdHomepageSectionPanels(ids, className = "") {
  return ids
    .map((id) => kfdHomepageSection(id))
    .filter(Boolean)
    .map((section) => {
      const displayRole = section.id === "current-candidates" && kfdSite.candidatePages?.normative === false
        ? "non-normative"
        : section.renderRole;
      const candidateAction = section.id === "current-candidates"
        ? `<div class="card-actions"><a class="card-action" href="${escapeAttr(kfdCandidateIndexPath)}">Browse candidates</a></div>`
        : "";
      return `<section class="panel doc-content ${className}" data-kfd-section="${escapeAttr(section.id)}">
        <p class="eyebrow">${escapeHtml(displayRole)}</p>
        <h2>${escapeHtml(section.title)}</h2>
        ${renderMarkdownBody(section.markdown, {
          codeLinks: section.id === "decision-metadata" ? kfdDecisionMetadataCodeLinks : undefined,
        })}
        ${candidateAction}
      </section>`;
    })
    .join("\n");
}

function kfdPrimaryContinuationPanels() {
  const handled = new Set(["future-picture", "foundation-triad", "foundation-structure", "current-candidates"]);
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
        return `<section class="panel" id="product-proof-path" style="margin-top: 18px;">
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

function readerPath(surfaceId) {
  const pathEntry = site.readerContract.surfacePaths.find((entry) => entry.id === surfaceId);
  if (!pathEntry) {
    throw new Error(`reader contract is missing surface path: ${surfaceId}`);
  }
  return pathEntry;
}

function readerSource(sourceId) {
  const source = site.readerContract.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error(`reader contract references unknown source: ${sourceId}`);
  }
  return source;
}

function readerSourceHref(source) {
  if (source.kind === "git-document") {
    return `${source.repository}/blob/${source.ref}/${source.path}`;
  }
  const kfdDecision = /^decisions\/KFD-(\d+)\.md$/.exec(source.path);
  if (source.package === "@kungfu-tech/kfd" && kfdDecision) {
    return surfaceEndpointHref("kfd", `${kfdDecision[1]}/`);
  }
  const buildchainDocument = /^docs\/(.+)\.md$/.exec(source.path);
  if (source.package === "@kungfu-tech/buildchain" && buildchainDocument) {
    return surfaceEndpointHref("buildchain", `docs/${buildchainDocument[1]}/`);
  }
  throw new Error(`reader contract source has no public route: ${source.id}`);
}

function renderReaderSources(sourceRefs) {
  return `<span class="reader-sources"><span>Sources</span>${sourceRefs
    .map((sourceId) => {
      const source = readerSource(sourceId);
      return `<a href="${escapeAttr(readerSourceHref(source))}">${escapeHtml(source.id)}</a>`;
    })
    .join("")}</span>`;
}

function renderReaderOrientation(surfaceId, stateLabel) {
  const pathEntry = readerPath(surfaceId);
  return `<section class="reader-orientation" data-reader-surface="${escapeAttr(surfaceId)}">
    <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a><span class="page-kicker-state">${escapeHtml(stateLabel)}</span></p>
    <p class="eyebrow">Start here · ${escapeHtml(pathEntry.audience)}</p>
    <h1>${escapeHtml(pathEntry.question)}</h1>
    <p class="lead">${escapeHtml(pathEntry.promise)}</p>
    <div class="reader-actions">
      <a class="reader-action" ${readerActionLinkAttrs(surfaceId, pathEntry.authorityHref)}>${escapeHtml(pathEntry.authorityLabel)}</a>
      <a class="reader-action secondary" ${readerActionLinkAttrs(surfaceId, pathEntry.evidenceHref)}>${escapeHtml(pathEntry.evidenceLabel)}</a>
    </div>
  </section>`;
}

function renderContinuityStack() {
  const synthesis = site.readerContract.guidedSynthesis;
  const supplyChain = synthesis.supplyChain;
  return `<section id="continuity-stack" aria-labelledby="continuity-stack-heading">
    <div class="section-heading">
      <p class="eyebrow">01 · Guided synthesis · site-owned</p>
      <h2 id="continuity-stack-heading">${escapeHtml(synthesis.heading)}</h2>
      <p>${escapeHtml(synthesis.lead)}</p>
    </div>
    <ol class="reader-layer-strip" aria-label="Reader contract layers">
      ${site.readerContract.layers.map((entry) => `<li><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.owner)}</span></li>`).join("\n")}
    </ol>
    <ol class="reader-chain" aria-label="Continuity stack from Fact and Episode to Project Cut">
      ${synthesis.conceptualChain
        .map(
          (entry) => `<li class="reader-card" data-claim-class="${escapeAttr(entry.claimClass)}">
            <p class="reader-card-role">${escapeHtml(entry.role)}</p>
            <h3>${escapeHtml(entry.label)}</h3>
            <p>${escapeHtml(entry.summary)}</p>
            ${renderReaderSources(entry.sourceRefs)}
          </li>`,
        )
        .join("\n")}
    </ol>
    <div class="reader-supply-chain" aria-labelledby="reader-supply-chain-heading">
      <div>
        <p class="eyebrow">Agent supply chain</p>
        <h3 id="reader-supply-chain-heading">${escapeHtml(supplyChain.heading)}</h3>
        <p>${escapeHtml(supplyChain.summary)}</p>
      </div>
      <div class="reader-supply-grid">
        ${supplyChain.steps
          .map(
            (entry) => `<article class="reader-supply-card" data-claim-class="${escapeAttr(entry.claimClass)}">
              <p class="reader-card-role">${escapeHtml(entry.owner)}</p>
              <h4>${escapeHtml(entry.label)}</h4>
              <p>${escapeHtml(entry.summary)}</p>
              ${renderReaderSources(entry.sourceRefs)}
            </article>`,
          )
          .join("\n")}
      </div>
      <p class="reader-claim-boundary" data-claim-class="${escapeAttr(supplyChain.claimClass)}"><strong>Claim boundary:</strong> ${escapeHtml(supplyChain.nonClaim)} ${renderReaderSources(supplyChain.sourceRefs)}</p>
    </div>
  </section>`;
}

function renderAgentSupplyChainSummary() {
  return `<section id="agent-supply-chain" aria-labelledby="agent-supply-chain-heading">
    <div class="section-heading">
      <p class="eyebrow">01 · Agent Supply Chain · upstream composition</p>
      <h2 id="agent-supply-chain-heading">Five responsibilities. Independent owners. One inspectable path.</h2>
      <p>${escapeHtml(agentSupplyChain.categoryStatement)}</p>
    </div>
    <ol class="reader-chain agent-supply-chain-grid" aria-label="Five Agent Supply Chain responsibilities">
      ${agentSupplyChain.layers.map((layer) => `<li class="reader-card" data-status-class="${escapeAttr(layer.statusClass)}">
        <p class="reader-card-role">${escapeHtml(`${String(layer.order).padStart(2, "0")} · ${layer.owner}`)}</p>
        <h3>${escapeHtml(layer.id)}</h3>
        <p>${escapeHtml(layer.statement)}</p>
        <span class="tag">${escapeHtml(layer.statusClass)}</span>
      </li>`).join("\n")}
    </ol>
    <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(agentSupplyChain.claimBoundary)}</p>
    <div class="card-actions">
      <a class="card-action" href="/agent-supply-chain.json">Inspect the machine contract</a>
      <a class="card-action secondary" href="/architecture/">Explore the complete architecture</a>
    </div>
  </section>`;
}

function renderBuildchainReaderSynthesis() {
  const synthesis = site.readerContract.surfaceSynthesis.buildchain;
  const trustLoop = synthesis.trustLoop;
  const hubValue = synthesis.hubValue;
  const ecosystemEffect = synthesis.ecosystemEffect;
  const ownershipBoundary = synthesis.ownershipBoundary;
  const storyCard = (entry) => `<li class="buildchain-story-card" data-claim-class="${escapeAttr(entry.claimClass)}">
    ${entry.role ? `<p class="reader-card-role">${escapeHtml(entry.role)}</p>` : ""}
    <h4>${escapeHtml(entry.label)}</h4>
    <p>${escapeHtml(entry.summary)}</p>
    ${renderReaderSources(entry.sourceRefs)}
  </li>`;

  return `<section class="buildchain-reader-story" aria-labelledby="buildchain-reader-heading">
    <div class="section-heading">
      <p class="eyebrow">01 · Guided synthesis · site-owned</p>
      <h2 id="buildchain-reader-heading">${escapeHtml(synthesis.heading)}</h2>
      <p>${escapeHtml(synthesis.lead)}</p>
      ${renderReaderSources(synthesis.sourceRefs)}
    </div>

    <section class="buildchain-story-panel" id="buildchain-trust-loop" aria-labelledby="buildchain-trust-loop-heading" data-claim-class="${escapeAttr(trustLoop.claimClass)}">
      <header>
        <p class="eyebrow">02 · KFD-2 × KFD-3</p>
        <h3 id="buildchain-trust-loop-heading">${escapeHtml(trustLoop.heading)}</h3>
        <p>${escapeHtml(trustLoop.summary)}</p>
        ${renderReaderSources(trustLoop.sourceRefs)}
      </header>
      <ol class="buildchain-trust-loop" aria-label="KFD-3 value, KFD-2 trust, Buildchain release binding, and local Hub admission">
        ${trustLoop.steps.map(storyCard).join("\n")}
      </ol>
    </section>

    <section class="buildchain-story-panel" aria-labelledby="buildchain-hub-value-heading" data-claim-class="${escapeAttr(hubValue.claimClass)}">
      <header>
        <p class="eyebrow">03 · Builder Hub value</p>
        <h3 id="buildchain-hub-value-heading">${escapeHtml(hubValue.heading)}</h3>
        <p>${escapeHtml(hubValue.summary)}</p>
        ${renderReaderSources(hubValue.sourceRefs)}
      </header>
      <ol class="buildchain-value-grid" aria-label="Strategic outcomes for a Builder Hub">
        ${hubValue.outcomes.map(storyCard).join("\n")}
      </ol>
    </section>

    <section class="buildchain-story-panel" aria-labelledby="buildchain-ecosystem-heading" data-claim-class="${escapeAttr(ecosystemEffect.claimClass)}">
      <header>
        <p class="eyebrow">04 · Ecosystem effect · future picture</p>
        <h3 id="buildchain-ecosystem-heading">${escapeHtml(ecosystemEffect.heading)}</h3>
        <p>${escapeHtml(ecosystemEffect.summary)}</p>
        ${renderReaderSources(ecosystemEffect.sourceRefs)}
      </header>
      <ol class="buildchain-ecosystem-loop" aria-label="Potential ecosystem effect from portable release trust">
        ${ecosystemEffect.steps.map(storyCard).join("\n")}
      </ol>
      <p class="reader-claim-boundary" data-claim-class="${escapeAttr(ecosystemEffect.nonClaimClass)}"><strong>Claim boundary:</strong> ${escapeHtml(ecosystemEffect.nonClaim)} ${renderReaderSources(ecosystemEffect.nonClaimSourceRefs)}</p>
    </section>

    <section class="buildchain-story-panel buildchain-ownership" aria-labelledby="buildchain-ownership-heading" data-claim-class="${escapeAttr(ownershipBoundary.claimClass)}">
      <header>
        <p class="eyebrow">05 · Product boundary</p>
        <h3 id="buildchain-ownership-heading">${escapeHtml(ownershipBoundary.heading)}</h3>
        <p>${escapeHtml(ownershipBoundary.summary)}</p>
        ${renderReaderSources(ownershipBoundary.sourceRefs)}
      </header>
      <ul class="buildchain-ownership-list" aria-label="Capabilities and relationships retained by the Hub owner">
        ${ownershipBoundary.retainedByHub.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("\n")}
      </ul>
    </section>
  </section>`;
}

function renderBuildchainHomepageSummary() {
  const synthesis = site.readerContract.surfaceSynthesis.buildchain;
  const trustLoop = synthesis.trustLoop;
  const hubValue = synthesis.hubValue;
  const ecosystemEffect = synthesis.ecosystemEffect;
  const ownershipBoundary = synthesis.ownershipBoundary;
  return `<section class="buildchain-reader-story" aria-labelledby="buildchain-reader-heading">
    <div class="section-heading">
      <p class="eyebrow">01 · The essential loop</p>
      <h2 id="buildchain-reader-heading">${escapeHtml(synthesis.heading)}</h2>
      <p>${escapeHtml(synthesis.lead)}</p>
      ${renderReaderSources(synthesis.sourceRefs)}
    </div>

    <section class="buildchain-story-panel" id="buildchain-trust-loop" aria-labelledby="buildchain-trust-loop-heading" data-claim-class="${escapeAttr(trustLoop.claimClass)}">
      <header>
        <p class="eyebrow">KFD-2 × KFD-3 × exact release</p>
        <h3 id="buildchain-trust-loop-heading">${escapeHtml(trustLoop.heading)}</h3>
      </header>
      <ol class="buildchain-trust-loop" aria-label="The shortest Buildchain trust loop">
        ${trustLoop.steps.map((entry) => `<li class="buildchain-story-card" data-claim-class="${escapeAttr(entry.claimClass)}">
          <p class="reader-card-role">${escapeHtml(entry.role)}</p>
          <h4>${escapeHtml(entry.label)}</h4>
          <p>${escapeHtml(entry.summary)}</p>
        </li>`).join("\n")}
      </ol>
    </section>

    <section class="grid" id="buildchain-evidence" aria-label="Builder Hub value and ownership boundary">
      <article class="panel">
        <p class="eyebrow">What the Hub gains</p>
        <h3>${escapeHtml(hubValue.heading)}</h3>
        <ul>${hubValue.outcomes.map((entry) => `<li>${escapeHtml(entry.label)}</li>`).join("")}</ul>
      </article>
      <article class="panel buildchain-ownership">
        <p class="eyebrow">What the Hub keeps</p>
        <h3>${escapeHtml(ownershipBoundary.heading)}</h3>
        <ul class="buildchain-ownership-list">${ownershipBoundary.retainedByHub.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("\n")}</ul>
      </article>
    </section>

    <section class="panel" data-claim-class="${escapeAttr(ecosystemEffect.claimClass)}">
      <p class="eyebrow">Potential ecosystem effect · not an adoption claim</p>
      <h3>${escapeHtml(ecosystemEffect.heading)}</h3>
      <p>${escapeHtml(ecosystemEffect.summary)}</p>
      <p class="reader-claim-boundary" data-claim-class="${escapeAttr(ecosystemEffect.nonClaimClass)}"><strong>Claim boundary:</strong> ${escapeHtml(ecosystemEffect.nonClaim)}</p>
      <div class="card-actions">
        <a class="card-action" ${surfaceRouteLinkAttrs("buildchain", "mechanism/")}>Explore release trust and Buildchain mechanics</a>
        <a class="card-action secondary" href="${escapeAttr(buildchainPackage.repository)}">Open the source repository</a>
      </div>
    </section>
  </section>`;
}

const runtimeHomepageStyles = `<style>
  .agent-supply-chain-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .hero-action {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 8px 16px;
    color: var(--soft);
    background: var(--accent-strong);
    font-weight: 750;
    text-decoration: none;
  }

  .hero-action.secondary {
    color: var(--accent-strong);
    background: transparent;
  }

  .runtime-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .runtime-status .tag {
    color: var(--fg);
    border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
    background: color-mix(in srgb, var(--accent) 8%, var(--soft));
  }

  .architecture-visual {
    display: grid;
    min-width: 0;
    gap: 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--soft) 88%, var(--bg));
    padding: clamp(18px, 3vw, 30px);
    box-shadow: 0 20px 52px color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .action-loop {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 22px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .action-step {
    position: relative;
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 9px;
    margin: 0;
    min-height: 214px;
    height: 100%;
    border: 1px solid var(--line);
    border-top: 4px solid var(--muted);
    border-radius: 8px;
    background: var(--bg);
    padding: 15px;
  }

  .action-step:not(:last-child)::after {
    content: "→";
    position: absolute;
    z-index: 2;
    top: 50%;
    right: -25px;
    width: 26px;
    color: var(--accent-strong);
    font: 700 18px/1 monospace;
    text-align: center;
    transform: translateY(-50%);
  }

  .action-step[data-action-kind="fact"] { border-top-color: #2784c7; }
  .action-step[data-action-kind="geometry"] { border-top-color: #d69732; }
  .action-step[data-action-kind="binding"] { border-top-color: #b16bd3; }
  .action-step[data-action-kind="external"] { border-top-color: #7b8794; }
  .action-step[data-action-kind="episode"] { border-top-color: #2e9d72; }
  .action-step[data-action-kind="admission"] { border-top-color: #476dd0; }

  .architecture-node-label {
    color: var(--fg);
    font: 700 13px/1.25 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .action-step strong {
    font-size: 14px;
    line-height: 1.35;
  }

  .action-step p,
  .foundation-card p,
  .hub-node li,
  .exchange-channel span,
  .invariant-card p,
  .support-reason p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .action-components {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .action-components li {
    border-left: 2px solid #d69732;
    padding-left: 7px;
    color: var(--fg);
    font-size: 11px;
  }

  .loop-return {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    color: var(--accent-strong);
    font: 700 12px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .loop-return::before {
    content: "";
    width: min(320px, 45%);
    border-top: 1px dashed var(--accent);
  }

  .authority-foundation {
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr;
    gap: 10px;
  }

  .foundation-card {
    display: grid;
    min-width: 0;
    gap: 7px;
    border: 1px solid var(--line);
    border-left: 4px solid #2784c7;
    border-radius: 7px;
    background: var(--soft);
    padding: 14px;
  }

  .foundation-card[data-foundation-kind="projection"] {
    border-style: dashed;
    border-left-style: dashed;
    border-left-color: var(--muted);
  }

  .network-diagram {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 0.82fr) minmax(0, 1fr);
    gap: 16px;
    align-items: stretch;
  }

  .hub-node {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 12px;
    border: 2px solid var(--fg);
    border-radius: 10px;
    background: var(--bg);
    padding: 20px;
  }

  .hub-node h3 { margin: 0; }

  .hub-node ol {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hub-node li {
    border: 1px solid var(--line);
    border-bottom: 0;
    background: var(--soft);
    padding: 11px 12px;
  }

  .hub-node li:last-child {
    border-bottom: 1px solid var(--line);
    color: var(--fg);
    font-weight: 650;
  }

  .exchange-boundary {
    display: grid;
    min-width: 0;
    align-content: center;
    gap: 12px;
    border: 1px solid color-mix(in srgb, #8b63d9 70%, var(--line));
    border-radius: 10px;
    background: color-mix(in srgb, #8b63d9 8%, var(--soft));
    padding: 16px;
  }

  .exchange-boundary > strong {
    color: var(--fg);
    text-align: center;
  }

  .exchange-channel {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .exchange-channel li {
    display: grid;
    gap: 3px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    padding: 10px;
  }

  .transport-label,
  .protocol-limit {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
    text-align: center;
  }

  .protocol-limit {
    border: 1px dashed var(--line);
    border-radius: 7px;
    padding: 12px;
  }

  .invariant-strip,
  .support-reasons {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .invariant-card,
  .support-reason {
    display: grid;
    min-width: 0;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--bg);
    padding: 14px;
  }

  .invariant-equation {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    color: var(--fg) !important;
    font-weight: 700;
    text-align: center;
  }

  .invariant-equation b {
    color: #b24b4b;
    font-size: 22px;
  }

  .support-reason strong { font-size: 14px; }

  .architecture-sources {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .architecture-sources a {
    font-size: 13px;
    font-weight: 650;
  }

  .quickstart-card {
    display: grid;
    align-content: start;
    gap: 14px;
  }

  .quickstart-card pre {
    min-width: 0;
    margin: 0;
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--code);
    padding: 12px 14px;
  }

  .quickstart-card pre code {
    border: 0;
    background: transparent;
    padding: 0;
    white-space: pre;
  }

  .runtime-proof {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .runtime-proof div {
    border-left: 3px solid var(--accent);
    padding-left: 12px;
  }

  .runtime-proof strong {
    display: block;
    color: var(--fg);
    font-size: 22px;
    line-height: 1.1;
  }

  .runtime-proof span {
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 820px) {
    .agent-supply-chain-grid,
    .architecture-visual {
      grid-template-columns: 1fr;
    }

    .architecture-visual {
      overflow: hidden;
      padding: 16px;
    }

    .action-loop,
    .authority-foundation,
    .network-diagram,
    .invariant-strip,
    .support-reasons,
    .runtime-proof {
      grid-template-columns: 1fr;
    }

    .action-step {
      min-height: 0;
      overflow-wrap: anywhere;
    }

    .foundation-card,
    .hub-node,
    .exchange-boundary,
    .invariant-card,
    .support-reason {
      overflow-wrap: anywhere;
    }

    .action-step:not(:last-child)::after {
      content: "↓";
      top: auto;
      right: 50%;
      bottom: -22px;
      transform: translateX(50%);
    }

    .loop-return::before { width: 35%; }
  }
</style>`;

const dogfoodStyles = `<style>
  .dogfood-rail {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) repeat(3, minmax(0, 0.7fr));
    gap: 10px;
    margin-top: 48px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--soft);
    padding: 12px;
  }

  .dogfood-rail-intro,
  .dogfood-metric {
    display: grid;
    min-width: 0;
    align-content: center;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    padding: 18px;
  }

  .dogfood-rail-intro h2,
  .dogfood-rail-intro p { margin: 0; }
  .dogfood-rail-intro h2 { font-size: 22px; }
  .dogfood-rail-intro a { font-weight: 750; }

  .dogfood-metric strong {
    color: var(--fg);
    font-size: clamp(28px, 4vw, 48px);
    line-height: 0.95;
    letter-spacing: -0.04em;
  }

  .dogfood-metric span {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.35;
  }

  .dogfood-metric-primary {
    border-color: color-mix(in srgb, var(--accent) 68%, var(--line));
    background: color-mix(in srgb, var(--accent) 8%, var(--soft));
  }

  .dogfood-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
    gap: 28px;
    align-items: end;
    border-bottom: 1px solid var(--line);
    padding-bottom: 36px;
  }

  .dogfood-hero-copy {
    display: grid;
    gap: 18px;
  }

  .dogfood-hero-copy h1,
  .dogfood-hero-copy p { margin: 0; }

  .dogfood-hero-number {
    display: grid;
    justify-items: start;
    border-left: 5px solid var(--accent);
    padding-left: 22px;
  }

  .dogfood-hero-number strong {
    color: var(--fg);
    font-size: clamp(68px, 12vw, 142px);
    line-height: 0.82;
    letter-spacing: -0.065em;
  }

  .dogfood-hero-number span {
    max-width: 300px;
    margin-top: 14px;
    color: var(--muted);
    font-weight: 700;
  }

  .dogfood-window {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .dogfood-window code { font-size: 12px; }

  .dogfood-flow {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dogfood-flow li {
    position: relative;
    display: grid;
    align-content: start;
    gap: 8px;
    margin: 0;
    min-height: 142px;
    border: 1px solid var(--line);
    border-top: 4px solid var(--accent);
    border-radius: 8px;
    background: var(--soft);
    padding: 16px;
  }

  .dogfood-flow li:not(:last-child)::after {
    content: "→";
    position: absolute;
    top: 50%;
    right: -25px;
    z-index: 2;
    width: 28px;
    color: var(--accent-strong);
    font-weight: 800;
    text-align: center;
    transform: translateY(-50%);
  }

  .dogfood-flow strong { font-size: 14px; }
  .dogfood-flow span { color: var(--muted); font-size: 13px; }

  .dogfood-dashboard {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(360px, 1.15fr);
    gap: 18px;
  }

  .dogfood-metric-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .repo-work-list {
    display: grid;
    gap: 10px;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }

  .repo-work-row {
    display: grid;
    grid-template-columns: minmax(130px, 0.75fr) minmax(120px, 1fr) 54px;
    gap: 12px;
    align-items: center;
    min-width: 0;
    font-size: 13px;
  }

  .repo-work-row > span:first-child { overflow-wrap: anywhere; }
  .repo-work-row strong { text-align: right; }

  .repo-work-track {
    display: block;
    height: 9px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--code);
  }

  .repo-work-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  .dogfood-case {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 22px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--soft);
    padding: clamp(20px, 3vw, 30px);
  }

  .case-index {
    color: color-mix(in srgb, var(--accent) 82%, var(--fg));
    font: 800 38px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .case-copy {
    display: grid;
    min-width: 0;
    gap: 14px;
  }

  .case-copy h2,
  .case-copy p { margin: 0; }

  .case-roots {
    display: grid;
    grid-template-columns: minmax(130px, auto) minmax(0, 1fr);
    gap: 8px 14px;
    margin: 0;
  }

  .case-roots dt { color: var(--muted); font-size: 12px; }
  .case-roots dd { min-width: 0; margin: 0; }
  .case-roots code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .boundary-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }

  .boundary-list li {
    border-left: 3px solid var(--warn);
    background: var(--bg);
    padding: 12px 14px;
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 820px) {
    .dogfood-rail,
    .dogfood-hero,
    .dogfood-dashboard,
    .dogfood-metric-grid,
    .boundary-list { grid-template-columns: 1fr; }

    .dogfood-flow { grid-template-columns: 1fr; }
    .dogfood-flow li { min-height: 0; }
    .dogfood-flow li:not(:last-child)::after {
      content: "↓";
      top: auto;
      right: 50%;
      bottom: -21px;
      transform: translateX(50%);
    }

    .dogfood-case { grid-template-columns: 1fr; }
    .case-roots { grid-template-columns: 1fr; }
    .case-roots dd + dt { margin-top: 6px; }
    .repo-work-row { grid-template-columns: minmax(100px, 0.8fr) minmax(70px, 1fr) 48px; }
  }
</style>`;

writeFile(
  "architecture/index.html",
  page({
    title: `Continuity architecture | ${site.title}`,
    description: "The complete Kungfu continuity, Hub cooperation, runtime qualification, and release-trust architecture.",
    current: "hub",
    body: `${runtimeHomepageStyles}${dogfoodStyles}
    <section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev">Back to libkungfu.dev</a><span class="page-kicker-state">architecture / complete model</span></p>
      <h1>How the continuity stack works</h1>
      <p class="lead">Follow the full path from recorded action and plural-Hub cooperation to runtime qualification, release trust, and public evidence.</p>
    </section>

    ${renderContinuityStack()}

    <section aria-labelledby="agent-supply-chain-heading">
      <div class="section-heading">
        <p class="eyebrow">Agent Supply Chain</p>
        <h2 id="agent-supply-chain-heading">Five responsibilities. Independent owners. One inspectable path.</h2>
        <p>${escapeHtml(agentSupplyChain.categoryStatement)}</p>
      </div>
      <div class="support-reasons">
        ${agentSupplyChain.layers
          .map((layer) => `<article class="support-reason"><strong>${escapeHtml(`${String(layer.order).padStart(2, "0")} · ${layer.id}`)}</strong><p><strong>Owner:</strong> ${escapeHtml(layer.owner)}</p><p>${escapeHtml(layer.statement)}</p><p><strong>Input:</strong> ${escapeHtml(layer.input)}</p><p><strong>Output:</strong> ${escapeHtml(layer.output)}</p><p><strong>Known limit:</strong> ${escapeHtml(layer.knownLimits[0])}</p><p><code>${escapeHtml(layer.evidenceCoordinates[0])}</code></p><span class="tag">${escapeHtml(layer.statusClass)}</span></article>`)
          .join("\n")}
      </div>
      <p class="protocol-limit"><strong>Claim boundary:</strong> ${escapeHtml(agentSupplyChain.claimBoundary)}</p>
      <div class="hero-actions">
        <a class="hero-action" href="/agent-supply-chain.json">Inspect machine contract</a>
        <a class="hero-action secondary" href="${escapeAttr(agentSupplyChain.layers[4].humanRoute)}">Open the Hub profile</a>
      </div>
    </section>

    <section aria-labelledby="action-world-heading">
      <div class="section-heading">
        <p class="eyebrow">02 · Upstream authority · Kungfu</p>
        <h2 id="action-world-heading">${escapeHtml(runtimeSurface.actionWorld.headline)}</h2>
        <p>${escapeHtml(runtimeSurface.actionWorld.summary)}</p>
        <div class="runtime-status" style="margin-top: 12px;">
          <span class="tag">${escapeHtml(runtimeSurface.status)}</span>
          <span class="tag">claim: ${escapeHtml(runtimeSurface.claimLevel)}</span>
          <span class="tag">${escapeHtml(runtimeSurface.qualification.platform)}</span>
        </div>
      </div>
      <div class="architecture-visual" aria-label="libkungfu action world architecture">
        <ol class="action-loop">
          ${runtimeSurface.actionWorld.steps.map(renderActionWorldStep).join("\n")}
        </ol>
        <div class="loop-return" aria-label="The successor Fact cut begins the next action loop">next action loop</div>
        <div class="authority-foundation" aria-label="Runtime authority and projection layers">
          ${runtimeSurface.actionWorld.foundation.map(renderFoundationLayer).join("\n")}
        </div>
      </div>
      <div class="architecture-sources">
        <strong>Semantic source:</strong>
        ${runtimeSurface.architectureSources.kungfu.documents
          .map((document) => `<a href="${escapeAttr(architectureSourceHref(runtimeSurface.architectureSources.kungfu, document))}">${escapeHtml(document.path)}</a>`)
          .join("\n")}
      </div>
    </section>

    <section aria-labelledby="hub-network-heading">
      <div class="section-heading">
        <p class="eyebrow">03 · Upstream authority · KFD</p>
        <h2 id="hub-network-heading">${escapeHtml(runtimeSurface.hubNetwork.headline)}</h2>
        <p>${escapeHtml(runtimeSurface.hubNetwork.summary)}</p>
      </div>
      <div class="architecture-visual">
        <div class="network-diagram" aria-label="Two independently owned Agent Hubs exchanging responsibility through KFD">
          ${renderHub(runtimeSurface.hubNetwork.hubs[0])}
          <div class="exchange-boundary">
            <strong>KFD responsibility boundary</strong>
            <ol class="exchange-channel">
              ${runtimeSurface.hubNetwork.exchange.map(renderExchangeStep).join("\n")}
            </ol>
            <p class="transport-label"><strong>Replaceable transport</strong><br>${escapeHtml(runtimeSurface.hubNetwork.transport)}</p>
          </div>
          ${renderHub(runtimeSurface.hubNetwork.hubs[1])}
        </div>
        <p class="protocol-limit"><strong>KFD does not own:</strong> ${escapeHtml(runtimeSurface.hubNetwork.notOwned)}</p>
        <div class="invariant-strip" aria-label="KFD protocol invariants">
          ${runtimeSurface.invariants.map(renderInvariant).join("\n")}
        </div>
      </div>
      <div class="architecture-sources">
        <strong>Protocol source:</strong>
        ${runtimeSurface.architectureSources.kfd.documents
          .map((document) => `<a href="${escapeAttr(architectureSourceHref(runtimeSurface.architectureSources.kfd, document))}">${escapeHtml(document.path)}</a>`)
          .join("\n")}
        <span class="tag">${escapeHtml(runtimeSurface.architectureSources.kfd.profile)}</span>
      </div>
    </section>

    <section aria-labelledby="hub-support-heading">
      <div class="section-heading">
        <p class="eyebrow">04 · Guided consequence</p>
        <h2 id="hub-support-heading">${escapeHtml(site.readerContract.guidedSynthesis.hubConsequence.heading)}</h2>
        <p>${escapeHtml(site.readerContract.guidedSynthesis.hubConsequence.summary)}</p>
        ${renderReaderSources(site.readerContract.guidedSynthesis.hubConsequence.sourceRefs)}
      </div>
      <div class="support-reasons">
        ${runtimeSurface.hubNetwork.supportReasons
          .map((reason) => `<article class="support-reason"><strong>${escapeHtml(reason.pressure)}</strong><p>${escapeHtml(reason.mechanism)}</p></article>`)
          .join("\n")}
      </div>
    </section>

    <section class="dogfood-rail" aria-labelledby="dogfood-rail-heading">
      <div class="dogfood-rail-intro">
        <p class="eyebrow">Dogfood · public evidence</p>
        <h2 id="dogfood-rail-heading">The substrate is building itself.</h2>
        <p>A fixed 30-day snapshot connects public work, exact Cuts, independent review, and production delivery.</p>
        <a href="/dogfood/">Audit the complete evidence chain</a>
      </div>
      ${renderDogfoodMetric(dogfoodEvidence.metrics.mergedPublicPullRequests, true)}
      ${renderDogfoodMetric(dogfoodEvidence.metrics.repositoriesWithMergedPullRequests)}
      ${renderDogfoodMetric(dogfoodEvidence.metrics.retainedPublicProjectCuts)}
    </section>

    <section aria-labelledby="quickstart-heading">
      <div class="section-heading">
        <p class="eyebrow">One native authority · three host languages</p>
        <h2 id="quickstart-heading">Start with an Episode</h2>
        <p>These commands run after building the exact source candidate. Each card links to the single reviewed implementation.</p>
      </div>
      <div class="grid three">
        ${runtimeSurface.quickstarts.map(runtimeQuickstartCard).join("\n")}
      </div>
      <div class="card-actions">
        <a class="card-action" href="${escapeAttr(runtimeSurface.source.pullRequest)}">Open the reviewed reference</a>
        <a class="card-action" href="/runtime.json">Inspect machine facts</a>
      </div>
    </section>

    <section class="panel warning" style="margin-top: 18px;">
      <p class="eyebrow">Package availability</p>
      <h2>Source is ready; registry installation is not claimed</h2>
      <p>No public registry install is claimed yet. Use the exact reviewed source candidate for evaluation.</p>
      <div class="grid" style="margin-top: 18px;">
        ${runtimeSurface.packages
          .map(
            (packageEntry) => `<div>
          <h3><code>${escapeHtml(packageEntry.name)}</code></h3>
          <p>${escapeHtml(packageEntry.role)}</p>
          <p style="margin-top: 8px;"><strong>Status:</strong> ${escapeHtml(packageEntry.availability)}</p>
        </div>`,
          )
          .join("\n")}
      </div>
    </section>

    <section aria-labelledby="boundary-heading">
      <div class="section-heading">
        <p class="eyebrow">Data and authority boundary</p>
        <h2 id="boundary-heading">Record lifecycle evidence, not customer payloads</h2>
      </div>
      <div class="grid">
        <article class="panel">
          <h3>Retained by the reference adapter</h3>
          <ul>${runtimeSurface.dataBoundary.retained.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
        </article>
        <article class="panel">
          <h3>Deliberately dropped</h3>
          <ul>${runtimeSurface.dataBoundary.dropped.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
        </article>
      </div>
    </section>

    <section class="panel" style="margin-top: 18px;" aria-labelledby="evidence-heading">
      <p class="eyebrow">Observed evidence · exact candidate</p>
      <h2 id="evidence-heading">KFD Runtime 100 and restart qualification</h2>
      <div class="runtime-proof">
        <div><strong>${escapeHtml(runtimeSurface.qualification.core)}</strong><span>Core</span></div>
        <div><strong>${escapeHtml(runtimeSurface.qualification.experimental)}</strong><span>Experimental</span></div>
        <div><strong>${escapeHtml(runtimeSurface.qualification.pairedHooks)}</strong><span>paired hooks</span></div>
        <div><strong>${escapeHtml(runtimeSurface.qualification.latencyMs.p95)} ms</strong><span>observed p95 hook latency</span></div>
      </div>
      <p style="margin-top: 18px;">${escapeHtml(runtimeSurface.qualification.recovery)}</p>
      <div class="card-actions">
        <a class="card-action" href="${escapeAttr(runtimeSourceHref(runtimeSurface.source.qualificationGuidePath))}">Read qualification boundary</a>
        <a class="card-action" href="${escapeAttr(runtimeSurface.source.pullRequest)}">Audit PR #1171</a>
      </div>
    </section>

    <section class="panel warning" style="margin-top: 18px;">
      <h2>What this does not claim</h2>
      <p><strong>${escapeHtml(runtimeSurface.claimBoundary)}</strong></p>
      <ul style="margin-top: 14px;">${runtimeSurface.knownLimits.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
    </section>

    <section aria-labelledby="release-trust-heading">
      <div class="section-heading">
        <p class="eyebrow">Release trust</p>
        <h2 id="release-trust-heading">Why the candidate is inspectable</h2>
      </div>
      <div class="visual substrate-map" aria-label="Product generation map">
        <img src="/assets/substrate-flow.svg" alt="KFD defines principles, Buildchain makes them executable, Core proves them in a complex product, and Kungfu Tech carries future products.">
        <a class="map-hotspot kfd" ${surfaceLinkAttrs("kfd")} aria-label="Open KFD"></a>
        <a class="map-hotspot buildchain" ${surfaceLinkAttrs("buildchain")} aria-label="Open Buildchain"></a>
        <a class="map-hotspot core" ${surfaceLinkAttrs("core")} aria-label="Open Core"></a>
        <a class="map-hotspot products" href="${escapeAttr(site.homepage.futureProducts.url)}" aria-label="Open ${escapeAttr(site.homepage.futureProducts.displayName)}"></a>
      </div>
      <div class="grid three mechanism-chain" style="margin-top: 18px;">
        ${site.homepage.chain.map(mechanismStepCard).join("\n")}
      </div>
    </section>

    <section class="panel future-products">
      <p class="eyebrow">${escapeHtml(site.homepage.futureProducts.label)}</p>
      <h2><a href="${escapeAttr(site.homepage.futureProducts.url)}">${escapeHtml(site.homepage.futureProducts.displayName)}</a></h2>
      <p>${escapeHtml(site.homepage.futureProducts.summary)}</p>
    </section>

    <section class="panel warning" style="margin-top: 18px;">
      <h2>Source boundary</h2>
      <p><strong>Projection source:</strong> ${escapeHtml(site.sourceBoundary.rule)}</p>
    </section>`,
  }),
);

writeFile(
  "index.html",
  page({
    title: `${site.title} | Embeddable Agent runtime`,
    description: site.tagline,
    current: "hub",
    body: `${runtimeHomepageStyles}
    <section class="hero">
      <p class="eyebrow">Start here · ${escapeHtml(readerPath("hub").audience)}</p>
      <h1>${escapeHtml(site.homepage.headline)}</h1>
      <p class="lead">${escapeHtml(site.homepage.lead)}</p>
      <p><strong>Your Hub stays yours.</strong> ${escapeHtml(site.readerContract.guidedSynthesis.supplyChain.steps[0].summary)}</p>
      <div class="hero-actions">
        <a class="hero-action" href="${escapeAttr(readerPath("hub").authorityHref)}">${escapeHtml(readerPath("hub").authorityLabel)}</a>
        <a class="hero-action secondary" ${surfaceLinkAttrs("core")}>Open Core runtime</a>
      </div>
    </section>

    ${renderAgentSupplyChainSummary()}

    <section class="panel" aria-labelledby="hub-next-depth-heading">
      <p class="eyebrow">Continue only when you need the mechanism</p>
      <h2 id="hub-next-depth-heading">The complete architecture now lives one level down.</h2>
      <p>Open the detailed action world, plural-Hub topology, qualification evidence, quickstarts, release-trust map, and source boundary without making every visitor traverse them first.</p>
      <div class="card-actions">
        <a class="card-action" href="/architecture/">Explore the continuity architecture</a>
        <a class="card-action secondary" href="/dogfood/">Audit public dogfood evidence</a>
        <a class="card-action secondary" href="/runtime.json">Inspect machine facts</a>
      </div>
    </section>`,
  }),
);

const coreAgentManifest = {
  schemaVersion: 1,
  contract: "libkungfu-core-runtime-surface",
  ...surfaceTimestampPolicy,
  canonicalHost: surfaceCanonicalHost("core"),
  source: {
    kind: "evidence-linked-fixture",
    path: "src/fixtures/core-runtime-surface.json",
    contract: core.contract,
    repository: core.sourceRepository,
    ref: core.sourceRef,
  },
  readerContract: {
    contract: site.readerContract.contract,
    owner: site.readerContract.owner,
    path: readerPath("core"),
    humanEntries: {
      overview: surfaceCanonicalHref("core"),
      mechanism: surfaceEndpointHref("core", "runtime/"),
    },
    layers: site.readerContract.layers,
    sourceBoundary: site.sourceBoundary,
  },
  homepage: core.homepage,
  architecture: core.architecture,
  outcomes: core.outcomes,
  semanticBoundary: core.semanticBoundary,
  frontiers: core.frontiers,
  qualificationBoundary: core.qualificationBoundary,
  evidence: core.evidence,
  sourceContract: core.sourceContract,
  machineEntries: {
    manifest: surfaceEndpointHref("core", "manifest.json"),
    llms: surfaceEndpointHref("core", "llms.txt"),
    full: surfaceEndpointHref("core", "llms-full.txt"),
  },
};

writeFile(
  "dogfood/index.html",
  page({
    title: "Kungfu Dogfood | Public evidence",
    description: dogfoodEvidence.headline,
    current: "hub",
    alternates: `  <link rel="alternate" type="application/json" title="Kungfu public dogfood evidence" href="/dogfood-evidence.json">`,
    body: `${dogfoodStyles}
    <section class="dogfood-hero" aria-labelledby="dogfood-title">
      <div class="dogfood-hero-copy">
        <p class="eyebrow page-kicker"><a href="/" aria-label="Back to libkungfu.dev">Back to libkungfu.dev</a><span class="page-kicker-state" id="dogfood-state">public dogfood / retained fallback</span></p>
        <h1 id="dogfood-title">${escapeHtml(dogfoodEvidence.headline)}</h1>
        <p class="lead">Not a demo dataset. These are public work items, repository-retained Project Cuts, independent reviews, continuations, and production releases from the system&rsquo;s own construction.</p>
        <div class="dogfood-window">
          <span class="tag">rolling ${escapeHtml(dogfoodEvidence.observation.window.duration)}</span>
          <code id="dogfood-window-start">${escapeHtml(dogfoodEvidence.observation.window.startInclusive)}</code>
          <span aria-hidden="true">→</span>
          <code id="dogfood-window-end">${escapeHtml(dogfoodEvidence.observation.window.endInclusive)}</code>
        </div>
        <div class="card-actions">
          <a class="card-action" href="/dogfood-evidence.json">Open machine-readable evidence</a>
          <a class="card-action" href="${escapeAttr(dogfoodEvidence.sources.github.repository)}">Inspect the public organization</a>
        </div>
      </div>
      <div class="dogfood-hero-number" aria-label="${escapeAttr(formatMetric(dogfoodEvidence.metrics.mergedPublicPullRequests.value))} merged public pull requests in the observed window">
        <strong id="dogfood-pr-total">${escapeHtml(formatMetric(dogfoodEvidence.metrics.mergedPublicPullRequests.value))}</strong>
        <span id="dogfood-pr-caption">${escapeHtml(dogfoodEvidence.metrics.mergedPublicPullRequests.label)} across ${escapeHtml(formatMetric(dogfoodEvidence.metrics.repositoriesWithMergedPullRequests.value))} repositories</span>
      </div>
    </section>

    <section aria-labelledby="proof-loop-heading">
      <div class="section-heading">
        <p class="eyebrow">One public loop</p>
        <h2 id="proof-loop-heading">Work becomes a claim only after it survives evidence boundaries.</h2>
        <p>The GitHub activity count supplies scale. Project Cut and retained qualification supply meaning.</p>
      </div>
      <ol class="dogfood-flow">
        <li><span class="architecture-node-label">01 · Work</span><strong>Public PR changes source, docs, CI, or release state.</strong><span>Merge is a work event, not a feature claim.</span></li>
        <li><span class="architecture-node-label">02 · Bind</span><strong>Exact source, Atlas, policy, and accepted scope are rooted.</strong><span>Changing an input creates a different claim.</span></li>
        <li><span class="architecture-node-label">03 · Settle</span><strong>Project Cut records Episode delta, omissions, and receipt.</strong><span>An empty Episode delta is explicit, never invented.</span></li>
        <li><span class="architecture-node-label">04 · Review</span><strong>A different actor checks the exact claim and roots.</strong><span>Reviewer search alone is not enough.</span></li>
        <li><span class="architecture-node-label">05 · Continue</span><strong>Close, reopen, or produce a successor Cut and release.</strong><span>The next action keeps lineage instead of rewriting history.</span></li>
      </ol>
    </section>

    <section class="dogfood-dashboard" aria-labelledby="snapshot-heading">
      <div>
        <div class="section-heading">
          <p class="eyebrow">Snapshot</p>
          <h2 id="snapshot-heading">Scale, with the caveats attached.</h2>
        </div>
        <div class="dogfood-metric-grid" id="dogfood-live-metrics">
          ${renderDogfoodMetric(dogfoodEvidence.metrics.reviewSearchMatches)}
          ${renderDogfoodMetric(dogfoodEvidence.metrics.retainedPublicProjectCuts, true)}
          ${renderDogfoodMetric(dogfoodEvidence.metrics.projectCutsWithEpisodeDelta)}
          ${renderDogfoodMetric(dogfoodEvidence.metrics.projectCutTitleMatches)}
        </div>
      </div>
      <article class="panel">
        <p class="eyebrow">Merged public PRs by repository</p>
        <h2>Where the work landed</h2>
        <ul class="repo-work-list" id="dogfood-live-repositories">
          ${dogfoodEvidence.repositories
            .map((repository) => renderRepositoryBar(
              repository,
              Math.max(...dogfoodEvidence.repositories.map((entry) => entry.mergedPublicPullRequests)),
            ))
            .join("\n")}
        </ul>
      </article>
    </section>

    <section aria-labelledby="cases-heading">
      <div class="section-heading">
        <p class="eyebrow">Auditable cases</p>
        <h2 id="cases-heading">Two loops you can open all the way down.</h2>
        <p>The first proves independent continuation. The second proves the architecture pages you just read were themselves delivered through Project Cut and release review.</p>
      </div>
      <div class="stack">
        ${dogfoodEvidence.cases.map(renderDogfoodCase).join("\n")}
      </div>
    </section>

    <section class="panel warning" aria-labelledby="boundaries-heading">
      <p class="eyebrow">Counting and attribution boundaries</p>
      <h2 id="boundaries-heading">What these numbers do not say</h2>
      <p>${escapeHtml(dogfoodEvidence.claimBoundary)}</p>
      <ul class="boundary-list">
        ${dogfoodEvidence.boundaries.map((boundary) => `<li><strong>${escapeHtml(boundary.id)}</strong><br>${escapeHtml(boundary.statement)}</li>`).join("\n")}
      </ul>
    </section>

    <section class="panel" aria-labelledby="reproduce-heading">
      <p class="eyebrow">Reproduce</p>
      <h2 id="reproduce-heading">The snapshot ships its query contract.</h2>
      <p>Run the public GitHub searches, inspect the exact Kungfu commit, or use the site checker. Historical visibility changes can affect a later API replay, so the committed JSON remains the publication snapshot.</p>
      <dl class="meta" style="margin-top: 18px;">
        <dt>Observed at</dt><dd><code id="dogfood-observed-at">${escapeHtml(dogfoodEvidence.observation.observedAt)}</code></dd>
        <dt>GitHub query</dt><dd><code id="dogfood-query">${escapeHtml(dogfoodEvidence.sources.github.baseQuery)}</code></dd>
        <dt>Project Cut commit</dt><dd><a id="dogfood-cut" href="${escapeAttr(`${dogfoodEvidence.sources.projectCuts.repository}/tree/${dogfoodEvidence.sources.projectCuts.gitCommit}/.kungfu/project-cuts`)}">${escapeHtml(dogfoodEvidence.sources.projectCuts.gitCommit)}</a></dd>
        <dt>Machine route</dt><dd><a href="/dogfood-evidence.json"><code>/dogfood-evidence.json</code></a></dd>
      </dl>
    </section>
    ${dogfoodLiveProjectionScript()}`,
  }),
);

writeFile(
  "core/runtime/index.html",
  page({
    title: "Core runtime mechanism | core.libkungfu.dev",
    description: "The complete Core journal, observation, durability, semantic, qualification, and source-contract model.",
    current: "core",
    preserveRelativeMachineEntries: true,
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("core")} aria-label="Back to Core home">Back to Core home</a><span class="page-kicker-state">runtime / complete mechanism</span></p>
      <h1>Core runtime mechanism</h1>
      <p class="lead">Inspect the complete journal, observation, durability, semantic, qualification, and source-contract path.</p>
    </section>
    <section class="hero core-hero" id="core-authority">
      <div class="core-hero-layout">
        <div class="core-hero-copy">
          <p class="eyebrow">${escapeHtml(core.homepage.kicker)}</p>
          <h2 class="authority-title">${escapeHtml(core.homepage.headline)}</h2>
          <p class="lead">${escapeHtml(core.homepage.lead)}</p>
        </div>

        <figure class="core-runtime-map" aria-labelledby="core-runtime-map-title">
          <figcaption id="core-runtime-map-title">${escapeHtml(core.architecture.label)}</figcaption>
          <div class="core-runtime-flow">
            <div class="core-runtime-node core-writer-node">
              <strong>${escapeHtml(core.architecture.writer.label)}</strong>
              <span>${escapeHtml(core.architecture.writer.detail)}</span>
            </div>
            <div class="core-flow-link" aria-hidden="true"><span>append once</span></div>
            <div class="core-runtime-node core-journal-node">
              <div>
                <strong>${escapeHtml(core.architecture.journal.label)}</strong>
                <span>${escapeHtml(core.architecture.journal.detail)}</span>
                <span class="core-journal-qualifier">${escapeHtml(core.architecture.journal.qualifier)}</span>
              </div>
              <div class="core-journal-frames" aria-label="Example runtime frame classes">
                ${core.architecture.journal.frames
                  .map((frame) => `<div class="core-journal-frame">${escapeHtml(frame)}</div>`)
                  .join("")}
              </div>
            </div>
            <div class="core-flow-link" aria-hidden="true"><span>read same frames</span></div>
            <div class="core-reader-stack">
              ${core.architecture.readers
                .map(
                  (reader) => `<div class="core-runtime-node core-reader-node" data-reader="${escapeAttr(reader.id)}">
                    <strong>${escapeHtml(reader.label)}</strong>
                    <span>${escapeHtml(reader.detail)}</span>
                    <span class="core-reader-status">${escapeHtml(reader.status)}</span>
                  </div>`,
                )
                .join("")}
            </div>
          </div>
        </figure>
      </div>
      <p class="hero-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(core.homepage.claimBoundary)}</p>
    </section>

    <section aria-labelledby="core-outcomes-heading">
      <p class="eyebrow">Why mmap matters to an Agent Hub</p>
      <h2 id="core-outcomes-heading" class="section-heading">The evidence path is already the observation path.</h2>
      <div class="grid three core-outcome-grid">
        ${core.outcomes
          .map(
            (outcome) => `<article class="panel core-outcome-card">
              <h3>${escapeHtml(outcome.title)}</h3>
              <p>${escapeHtml(outcome.summary)}</p>
            </article>`,
          )
          .join("")}
      </div>
    </section>

    <section class="panel core-semantic-boundary">
      <div>
        <p class="eyebrow">Runtime evidence × KFD semantics</p>
        <h2>${escapeHtml(core.semanticBoundary.heading)}</h2>
        <p>${escapeHtml(core.semanticBoundary.body)}</p>
        <a class="card-action" href="${escapeAttr(core.semanticBoundary.kfdUrl)}">Read the KFD boundary</a>
      </div>
      <ul class="core-invariant-list">
        ${core.semanticBoundary.invariants.map((invariant) => `<li>${escapeHtml(invariant)}</li>`).join("")}
      </ul>
    </section>

    <section aria-labelledby="core-frontiers-heading">
      <p class="eyebrow section-heading">One stream, explicit frontiers</p>
      <h2 id="core-frontiers-heading">Visibility is not durability.</h2>
      <div class="grid four" style="margin-top: 18px;">
        ${core.frontiers
          .map(
            (frontier) => `<article class="panel core-frontier-card" data-status="${escapeAttr(frontier.status)}">
              <p class="core-frontier-status">${escapeHtml(frontier.status)}</p>
              <h3><code>${escapeHtml(frontier.label)}</code></h3>
              <p>${escapeHtml(frontier.summary)}</p>
            </article>`,
          )
          .join("")}
      </div>
    </section>

    <section class="panel core-qualification">
      <p class="eyebrow">Evidence boundary</p>
      <h2>${escapeHtml(core.qualificationBoundary.heading)}</h2>
      <ul>${core.qualificationBoundary.claims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>
      <ul class="core-evidence-list" aria-label="Pinned runtime evidence">
        ${core.evidence
          .map(
            (entry) => `<li>
              <span class="tag">${escapeHtml(entry.status)}</span>
              <a href="${escapeAttr(entry.sourceUrl)}">${escapeHtml(entry.label)}</a>
              <code>${escapeHtml(entry.sourcePath)}</code>
            </li>`,
          )
          .join("")}
      </ul>
    </section>

    <details class="panel core-source-contract">
      <summary>${escapeHtml(core.sourceContract.heading)}</summary>
      <p>${escapeHtml(core.sourceContract.summary)}</p>
      <dl class="meta" style="margin-top: 18px;">
        <dt>Package</dt>
        <dd><code>${escapeHtml(core.sourceContract.package)}</code></dd>
        <dt>Source repository</dt>
        <dd><a href="${escapeAttr(core.sourceRepository)}">${escapeHtml(core.sourceRepository)}</a></dd>
        <dt>Pinned evidence ref</dt>
        <dd><code>${escapeHtml(core.sourceRef)}</code></dd>
        <dt>Spec fixture</dt>
        <dd><code>${escapeHtml(core.sourceContract.currentSpec.specVersion)}</code></dd>
        <dt>docs_url</dt>
        <dd><code>${escapeHtml(core.sourceContract.currentSpec.docsUrl)}</code></dd>
      </dl>
      <div class="grid three" style="margin-top: 18px;">
        ${listPanels(core.sourceContract.sections)}
      </div>
      <h3 style="margin-top: 18px;">Machine fields expected from upstream</h3>
      <ul>${core.sourceContract.machineFields.map((field) => `<li><code>${escapeHtml(field)}</code></li>`).join("")}</ul>
    </details>`,
  }),
);

writeFile(
  "core/index.html",
  page({
    title: "core.libkungfu.dev | Runtime substrate",
    description: core.homepage.lead,
    current: "core",
    preserveRelativeMachineEntries: true,
    body: `${renderReaderOrientation("core", "Runtime substrate")}
    <section class="panel" id="core-authority" aria-labelledby="core-home-mechanism-heading">
      <p class="eyebrow">Essential mechanism</p>
      <h2 id="core-home-mechanism-heading">${escapeHtml(core.homepage.headline)}</h2>
      <p class="lead">${escapeHtml(core.homepage.lead)}</p>
      <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(core.homepage.claimBoundary)}</p>
      <div class="card-actions">
        <a class="card-action" ${surfaceRouteLinkAttrs("core", "runtime/")}>Explore the runtime mechanism</a>
        <a class="card-action secondary" ${surfaceRouteLinkAttrs("core", "manifest.json")}>Inspect the manifest</a>
      </div>
    </section>

    <section aria-labelledby="core-outcomes-heading">
      <p class="eyebrow">Why this matters to an Agent Hub</p>
      <h2 id="core-outcomes-heading" class="section-heading">One retained path supports live observation and later recovery.</h2>
      <div class="grid three core-outcome-grid">
        ${core.outcomes
          .map(
            (outcome) => `<article class="panel core-outcome-card">
              <h3>${escapeHtml(outcome.title)}</h3>
              <p>${escapeHtml(outcome.summary)}</p>
            </article>`,
          )
          .join("")}
      </div>
    </section>`,
  }),
);

writeFile("core/manifest.json", `${JSON.stringify(coreAgentManifest, null, 2)}\n`);
writeFile(
  "core/llms.txt",
  `# ${surfaceCanonicalHost("core")}

Reader contract: ${site.readerContract.contract}
Audience: ${readerPath("core").audience}
Question: ${readerPath("core").question}
Promise: ${readerPath("core").promise}

${core.homepage.headline}

${core.homepage.lead}

Mechanism:
${core.architecture.writer.label} -> ${core.architecture.journal.label} -> ${core.architecture.readers.map((reader) => reader.label).join(" / ")}

Why it matters:
${core.outcomes.map((outcome) => `- ${outcome.title}: ${outcome.summary}`).join("\n")}

Frontiers:
${core.frontiers.map((frontier) => `- ${frontier.label} [${frontier.status}]: ${frontier.summary}`).join("\n")}

Semantic boundary:
${core.semanticBoundary.heading}
${core.semanticBoundary.body}
${core.semanticBoundary.invariants.map((invariant) => `- ${invariant}`).join("\n")}

Claim boundary:
${core.homepage.claimBoundary}

Qualification boundary:
${core.qualificationBoundary.claims.map((claim) => `- ${claim}`).join("\n")}

Pinned evidence:
${core.evidence.map((entry) => `- ${entry.label} [${entry.status}]: ${entry.sourceUrl}`).join("\n")}

Machine entries:
- ${surfaceEndpointHref("core", "manifest.json")}
- ${surfaceEndpointHref("core", "llms.txt")}
- ${surfaceEndpointHref("core", "llms-full.txt")}
`,
);
writeFile("core/llms-full.txt", `# core.libkungfu.dev full agent index\n\n${JSON.stringify(coreAgentManifest, null, 2)}\n`);

writeFile(
  "kfd/decisions/index.html",
  page({
    title: "KFD decisions and standards | kfd.libkungfu.dev",
    description: "The complete KFD foundation, numbered decisions, candidates, adoption boundary, quickstart, and source metadata.",
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">decisions / complete authority</span></p>
      <h1>KFD decisions and standards</h1>
      <p class="lead">Inspect the complete foundation model, adoption boundary, numbered authority, candidates, quickstart, and decision metadata.</p>
    </section>
    <section class="hero">
      <h2 class="authority-title">${escapeHtml(kfdSite.homepage.title)}</h2>
      ${kfdFuturePictureHero()}
    </section>

    <section class="panel" id="foundation-triad">
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
      <nav class="card-actions" aria-label="Foundation reading paths">
        ${(kfdSite.homepage.foundationTriad.links || [])
          .map((entry) => {
            const href = normalizeKfdHomepageLink(entry);
            return `<a class="card-action secondary" href="${escapeAttr(href)}">${escapeHtml(entry.label)}</a>`;
          })
          .join("\n")}
      </nav>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>${escapeHtml(kfdSite.homepage.foundation.heading)}</h2>
      <p>${inlineMarkdown(kfdSite.homepage.foundation.intro)}</p>
      <div class="grid three foundation-model-list">
        ${foundationModelPanels(kfdSite.homepage.foundation.layers)}
      </div>
      <p style="margin-top: 18px;"><code>${escapeHtml(kfdSite.homepage.foundation.chain)}</code></p>
      <div class="stack doc-content" style="margin-top: 18px;">
        ${renderMarkdownBody(kfdFoundationModelExplanationMarkdown())}
      </div>
    </section>

    ${kfdPrimaryContinuationPanels()}

    <section class="panel" id="current-decisions" style="margin-top: 18px;">
      <p class="eyebrow">numbered authority</p>
      <h2>${escapeHtml(kfdSite.homepage.currentDecisions.heading)}</h2>
      <div class="grid kfd-decision-list">
        ${decisionPanels(kfdRegistry.entries)}
      </div>
    </section>

    <div style="margin-top: 18px;">
      ${kfdHomepageSectionPanels(["current-candidates"], "kfd-candidate-section")}
    </div>

    ${
      kfdSupportSectionIds.length > 0
        ? `<div class="stack" style="margin-top: 18px;">
        ${kfdHomepageSectionPanels(kfdSupportSectionIds, "kfd-support-section")}
      </div>`
        : ""
    }

    `,
  }),
);

writeFile(
  "kfd/index.html",
  page({
    title: "kfd.libkungfu.dev | Kung Fu Decisions",
    description: kfdPackage.description,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `${renderReaderOrientation("kfd", "Kung Fu Decisions")}
    <section class="hero" id="kfd-authority">
      <h2 class="authority-title">${escapeHtml(kfdSite.homepage.title)}</h2>
      ${kfdFuturePictureHero()}
    </section>

    <section class="panel" id="foundation-triad">
      <p class="eyebrow">The minimum model</p>
      <h2>${escapeHtml(kfdSite.homepage.foundationTriad.heading)}</h2>
      <div class="grid three" style="margin-top: 18px;">
        ${kfdSite.homepage.foundationTriad.commitments
          .map((entry) => {
            const match = /^KFD-(\d+)\b/.exec(entry.id);
            return `<article class="panel foundation-triad-card">
              <h3><a href="/${escapeHtml(match[1])}/">${escapeHtml(entry.id)}</a></h3>
              <p>${inlineMarkdown(entry.text)}</p>
            </article>`;
          })
          .join("\n")}
      </div>
      <div class="card-actions">
        <a class="card-action" ${surfaceRouteLinkAttrs("kfd", "decisions/")}>Explore decisions and standards</a>
        <a class="card-action secondary" ${surfaceRouteLinkAttrs("kfd", "registry.json")}>Inspect the registry</a>
      </div>
    </section>`,
  }),
);

const renderedKfdFoundation = renderDecisionMarkdown(
  rewritePackageMarkdownLinks(kfdSite.foundationPage.markdown, "kungfu-systems/kfd", {
    filePattern: /\.md$/,
    internalRoutes: kfdPageRouteBySourcePath,
    sourcePath: kfdSite.foundationPage.sourcePath,
  }),
  "Foundation sections",
);
const kfdFoundationPageHtml = page({
  title: `${kfdSite.foundationPage.title} | kfd.libkungfu.dev`,
  description: kfdSite.foundationPage.authorityNote,
  current: "kfd",
  alternates: kfdSurfaceAlternates(),
  body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">explanation / non-normative</span></p>
      <h1>${escapeHtml(kfdSite.foundationPage.title)}</h1>
      <p class="lead">${escapeHtml(kfdSite.foundationPage.authorityNote)}</p>
    </section>

    <section class="doc-layout">
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, "foundation")}
        ${renderedKfdFoundation.tocHtml}
      </aside>
      <article class="panel doc-content">
        ${renderedKfdFoundation.html}
      </article>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Page metadata</h2>
      <dl class="meta">
        <dt>Route</dt>
        <dd><code>${escapeHtml(kfdFoundationPath)}</code></dd>
        <dt>Relationship</dt>
        <dd><code>${escapeHtml(kfdSite.foundationPage.relationship)}</code></dd>
        <dt>Normative</dt>
        <dd><code>${escapeHtml(String(kfdSite.foundationPage.normative))}</code></dd>
        <dt>Source path</dt>
        <dd><code>${escapeHtml(kfdSite.foundationPage.sourcePath)}</code></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
});
writeFile("kfd/foundation/index.html", kfdFoundationPageHtml);
writeFile("foundation/index.html", kfdFoundationPageHtml);

function renderKfdReferencePage(pageEntry, { currentPage, tocLabel, kicker }) {
  const rendered = renderDecisionMarkdown(
    rewritePackageMarkdownLinks(pageEntry.markdown, "kungfu-systems/kfd", {
      filePattern: /\.md$|\.json$/,
      internalRoutes: kfdPageRouteBySourcePath,
      sourcePath: pageEntry.sourcePath,
    }),
    tocLabel,
  );
  const pagePath = `${pageEntry.url.replace(/\/+$/, "")}/`;
  return page({
    title: `${pageEntry.title} | kfd.libkungfu.dev`,
    description: pageEntry.authorityNote,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">${escapeHtml(kicker)}</span></p>
      <h1>${escapeHtml(pageEntry.title)}</h1>
      <p class="lead">${escapeHtml(pageEntry.authorityNote)}</p>
    </section>

    <section class="doc-layout">
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, currentPage)}
        ${rendered.tocHtml}
      </aside>
      <article class="panel doc-content">
        ${rendered.html}
      </article>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Page metadata</h2>
      <dl class="meta">
        <dt>Route</dt>
        <dd><code>${escapeHtml(pagePath)}</code></dd>
        <dt>Relationship</dt>
        <dd><code>${escapeHtml(pageEntry.relationship)}</code></dd>
        <dt>Normative</dt>
        <dd><code>${escapeHtml(String(pageEntry.normative))}</code></dd>
        <dt>Source path</dt>
        <dd><code>${escapeHtml(pageEntry.sourcePath)}</code></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
  });
}

const kfdFormalModelPageHtml = renderKfdReferencePage(kfdSite.formalPage, {
  currentPage: "formal-model",
  tocLabel: "Formal model sections",
  kicker: "formal reference / non-normative",
});
writeFile("kfd/formal/index.html", kfdFormalModelPageHtml);
writeFile("formal/index.html", kfdFormalModelPageHtml);

const kfdTerminologyPageHtml = renderKfdReferencePage(kfdSite.terminologyPage, {
  currentPage: "terminology",
  tocLabel: "Terminology sections",
  kicker: "vocabulary contract / non-normative",
});
writeFile("kfd/terminology/index.html", kfdTerminologyPageHtml);
writeFile("terminology/index.html", kfdTerminologyPageHtml);

const renderedKfdCases = renderDecisionMarkdown(
  rewritePackageMarkdownLinks(kfdSite.casesPage.markdown, "kungfu-systems/kfd", {
    filePattern: /\.md$/,
    internalRoutes: kfdPageRouteBySourcePath,
    sourcePath: kfdSite.casesPage.sourcePath,
  }),
  "Case sections",
);
const kfdCasesPageHtml = page({
  title: `${kfdSite.casesPage.title} | kfd.libkungfu.dev`,
  description: kfdSite.casesPage.authorityNote,
  current: "kfd",
  alternates: kfdSurfaceAlternates(),
  body: `<style>
    @media (max-width: 820px) {
      .doc-layout.long-toc .doc-sidebar {
        max-height: min(58vh, 520px);
        overflow: auto;
      }
    }
  </style>
    <section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">historical companion / non-normative</span></p>
      <h1>${escapeHtml(kfdSite.casesPage.title)}</h1>
      <p class="lead">${escapeHtml(kfdSite.casesPage.authorityNote)}</p>
    </section>

    <section class="doc-layout long-toc">
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, "cases")}
        ${renderedKfdCases.tocHtml}
      </aside>
      <article class="panel doc-content">
        ${renderedKfdCases.html}
      </article>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Page metadata</h2>
      <dl class="meta">
        <dt>Route</dt>
        <dd><code>${escapeHtml(kfdCasesPath)}</code></dd>
        <dt>Relationship</dt>
        <dd><code>${escapeHtml(kfdSite.casesPage.relationship)}</code></dd>
        <dt>Normative</dt>
        <dd><code>${escapeHtml(String(kfdSite.casesPage.normative))}</code></dd>
        <dt>Source path</dt>
        <dd><code>${escapeHtml(kfdSite.casesPage.sourcePath)}</code></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
});
writeFile("kfd/cases/index.html", kfdCasesPageHtml);
writeFile("cases/index.html", kfdCasesPageHtml);

const renderedKfdCandidateIndex = renderDecisionMarkdown(
  rewritePackageMarkdownLinks(kfdSite.kfdCandidates.indexMarkdown, "kungfu-systems/kfd", {
    filePattern: /\.md$|registry\.json$/,
    internalRoutes: kfdPageRouteBySourcePath,
    sourcePath: kfdSite.kfdCandidates.indexSource,
  }),
  "Candidate index sections",
);
const kfdCandidateIndexHtml = page({
  title: "KFD Candidates | kfd.libkungfu.dev",
  description: kfdSite.kfdCandidates.authorityNote,
  current: "kfd",
  alternates: kfdSurfaceAlternates(),
  body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">candidate index / non-normative</span></p>
      <h1>KFD Candidates</h1>
      <p class="lead">${escapeHtml(kfdSite.kfdCandidates.authorityNote)}</p>
    </section>

    <section class="doc-layout">
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, "candidates")}
        ${renderedKfdCandidateIndex.tocHtml}
      </aside>
      <article class="panel doc-content">
        ${renderedKfdCandidateIndex.html}
      </article>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Candidate index metadata</h2>
      <dl class="meta">
        <dt>Registry source</dt>
        <dd><code>${escapeHtml(kfdSite.kfdCandidates.source)}</code></dd>
        <dt>Relationship</dt>
        <dd><code>${escapeHtml(kfdSite.kfdCandidates.relationship)}</code></dd>
        <dt>Normative</dt>
        <dd><code>${escapeHtml(String(kfdSite.kfdCandidates.normative))}</code></dd>
        <dt>Number allocation</dt>
        <dd><code>${escapeHtml(kfdSite.kfdCandidates.numberingPolicy.allocation)}</code></dd>
        <dt>Slot hints</dt>
        <dd><code>${escapeHtml(kfdSite.kfdCandidates.numberingPolicy.slotHints)}</code></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
});
const kfdCandidateIndexOutput = kfdCandidateIndexPath.replace(/^\/+|\/+$/g, "");
writeFile(`kfd/${kfdCandidateIndexOutput}/index.html`, kfdCandidateIndexHtml);
writeFile(`${kfdCandidateIndexOutput}/index.html`, kfdCandidateIndexHtml);
writeFile(`kfd/${kfdCandidateIndexOutput}/registry.json`, `${JSON.stringify(kfdCandidateRegistry, null, 2)}\n`);
writeFile(`${kfdCandidateIndexOutput}/registry.json`, `${JSON.stringify(kfdCandidateRegistry, null, 2)}\n`);

for (const candidatePage of kfdCandidatePages) {
  const candidateFormalPage = kfdCandidateFormalPageByCandidateId.get(candidatePage.id);
  const candidateTocLinks = candidateFormalPage
    ? [{
        title: "Formal candidate",
        href: candidateFormalPage.url,
        className: "toc-related-link",
      }]
    : [];
  const renderedCandidate = renderDecisionMarkdown(
    rewritePackageMarkdownLinks(candidatePage.markdown, "kungfu-systems/kfd", {
      filePattern: /\.md$/,
      internalRoutes: kfdPageRouteBySourcePath,
      sourcePath: candidatePage.sourcePath,
    }),
    "Candidate sections",
    { tocLinks: candidateTocLinks },
  );
  const candidateHtml = page({
    title: `${candidatePage.title} | KFD Candidates`,
    description: candidatePage.claimBoundary,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
        <p class="eyebrow page-kicker"><a href="${escapeAttr(kfdCandidateIndexPath)}" aria-label="Back to KFD Candidates">Back to KFD Candidates</a><span class="page-kicker-state">candidate / ${escapeHtml(candidatePage.status)}</span></p>
        <h1>${escapeHtml(candidatePage.title)}</h1>
        <p class="lead">${escapeHtml(candidatePage.claimBoundary)}</p>
      </section>

      <section class="doc-layout">
        <aside class="doc-sidebar">
          ${kfdDecisionNav(undefined, "candidate", candidatePage)}
          ${renderedCandidate.tocHtml}
        </aside>
        <article class="panel doc-content">
          ${renderedCandidate.html}
        </article>
      </section>

      <section class="panel" style="margin-top: 18px;">
        <h2>Candidate metadata</h2>
        <dl class="meta">
          <dt>Status</dt>
          <dd><code>${escapeHtml(candidatePage.status)}</code></dd>
          <dt>Slot hint</dt>
          <dd><code>${escapeHtml(String(candidatePage.slotHint))}</code></dd>
          <dt>Relationship</dt>
          <dd><code>${escapeHtml(kfdSite.candidatePages.relationship)}</code></dd>
          <dt>Normative</dt>
          <dd><code>${escapeHtml(String(kfdSite.candidatePages.normative))}</code></dd>
          <dt>Claim boundary</dt>
          <dd>${escapeHtml(candidatePage.claimBoundary)}</dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(candidatePage.sourcePath)}</code></dd>
          <dt>Package</dt>
          <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
        </dl>
      </section>`,
  });
  const candidateOutput = candidatePage.url.replace(/^\/+|\/+$/g, "");
  writeFile(`kfd/${candidateOutput}/index.html`, candidateHtml);
  writeFile(`${candidateOutput}/index.html`, candidateHtml);
}

for (const candidateFormalPage of kfdCandidateFormalPages) {
  const candidatePage = kfdCandidatePageById.get(candidateFormalPage.candidateId);
  if (!candidatePage) {
    throw new Error(`KFD formal candidate has no declared parent: ${candidateFormalPage.candidateId}`);
  }
  const renderedCandidateFormal = renderDecisionMarkdown(
    rewritePackageMarkdownLinks(candidateFormalPage.markdown, "kungfu-systems/kfd", {
      filePattern: /\.md$|registry\.json$/,
      internalRoutes: kfdPageRouteBySourcePath,
      sourcePath: candidateFormalPage.sourcePath,
    }),
    "Formal candidate sections",
  );
  const candidateFormalHtml = page({
    title: `${candidatePage.title} formal candidate | KFD Candidates`,
    description: `Non-normative formal candidate for ${candidatePage.title}.`,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
        <p class="eyebrow page-kicker"><a href="${escapeAttr(candidatePage.url)}" aria-label="Back to ${escapeAttr(candidatePage.title)}">${escapeHtml(`Back to ${candidatePage.title}`)}</a><span class="page-kicker-state">formal candidate / ${escapeHtml(candidateFormalPage.formalCandidateStatus)}</span></p>
        <h1>${escapeHtml(candidatePage.title)} formal candidate</h1>
        <p class="lead">A non-normative formal model owned by the candidate source.</p>
      </section>

      <section class="doc-layout">
        <aside class="doc-sidebar">
          ${kfdDecisionNav(undefined, "candidate-formal", candidatePage, candidateFormalPage)}
          ${renderedCandidateFormal.tocHtml}
        </aside>
        <article class="panel doc-content">
          ${renderedCandidateFormal.html}
        </article>
      </section>

      <section class="panel" style="margin-top: 18px;">
        <h2>Formal candidate metadata</h2>
        <dl class="meta">
          <dt>Candidate</dt>
          <dd><a href="${escapeAttr(candidatePage.url)}"><code>${escapeHtml(candidatePage.id)}</code></a></dd>
          <dt>Stable URL</dt>
          <dd><a href="${escapeAttr(candidateFormalPage.url)}"><code>${escapeHtml(candidateFormalPage.url)}</code></a></dd>
          <dt>Relationship</dt>
          <dd><code>${escapeHtml(candidateFormalPage.relationship)}</code></dd>
          <dt>Normative</dt>
          <dd><code>${escapeHtml(String(candidateFormalPage.normative))}</code></dd>
          <dt>Model status</dt>
          <dd><code>${escapeHtml(candidateFormalPage.formalCandidateStatus)}</code></dd>
          <dt>Model version</dt>
          <dd><code>${escapeHtml(String(candidateFormalPage.formalCandidateVersion))}</code></dd>
          <dt>Authority path</dt>
          <dd><code>${escapeHtml(candidateFormalPage.authorityPath)}</code></dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(candidateFormalPage.sourcePath)}</code></dd>
          <dt>Package</dt>
          <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
        </dl>
      </section>`,
  });
  const candidateFormalOutput = candidateFormalPage.url.replace(/^\/+|\/+$/g, "");
  writeFile(`kfd/${candidateFormalOutput}/index.html`, candidateFormalHtml);
  writeFile(`${candidateFormalOutput}/index.html`, candidateFormalHtml);
}

for (const entry of kfdRegistry.entries) {
  const decisionMarkdown = readPackageText(`@kungfu-tech/kfd/${entry.path}`);
  const usagePage = kfdUsagePageByDecisionNumber.get(String(entry.number));
  const formalPage = kfdFormalPageByDecisionNumber.get(String(entry.number));
  const relatedTocLinks = [
    usagePage?.sourceExists
      ? {
          title: usagePage.title || "Usage",
          href: `/${entry.number}/usage/`,
          className: "toc-related-link",
        }
      : undefined,
    formalPage?.sourceExists
      ? {
          title: formalPage.title || "Formal reference",
          href: `/${entry.number}/formal/`,
          className: "toc-related-link",
        }
      : undefined,
  ].filter(Boolean);
  const renderedDecision = renderDecisionMarkdown(
    rewritePackageMarkdownLinks(decisionMarkdown, "kungfu-systems/kfd", {
      filePattern: /\.md$/,
      internalRoutes: kfdPageRouteBySourcePath,
      sourcePath: entry.path,
    }),
    "Decision sections",
    relatedTocLinks.length > 0 ? { tocLinks: relatedTocLinks } : {},
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
          <dd><a href="/${escapeAttr(entry.number)}/"><code>${escapeHtml(entry.url)}</code></a></dd>
          <dt>Source path</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(entry.path))}"><code>${escapeHtml(entry.path)}</code></a></dd>
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
    const renderedUsage = renderDecisionMarkdown(
      rewritePackageMarkdownLinks(usageMarkdown, "kungfu-systems/kfd", {
        filePattern: /\.md$/,
        internalRoutes: kfdPageRouteBySourcePath,
        sourcePath: usagePage.sourcePath || usagePage.path,
      }),
      "Usage sections",
    );
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

  if (formalPage?.sourceExists) {
    const formalMarkdown = readPackageText(`@kungfu-tech/kfd/${formalPage.sourcePath || formalPage.path}`);
    const renderedFormal = renderDecisionMarkdown(
      rewritePackageMarkdownLinks(formalMarkdown, "kungfu-systems/kfd", {
        filePattern: /\.md$/,
        internalRoutes: kfdPageRouteBySourcePath,
        sourcePath: formalPage.sourcePath || formalPage.path,
      }),
      "Formal reference sections",
    );
    const formalPageHtml = page({
      title: `${entry.id} formal reference | kfd.libkungfu.dev`,
      description: formalPage.title || `${entry.id} formal reference`,
      current: "kfd",
      alternates: kfdSurfaceAlternates(),
      body: `<section class="hero">
        <p class="eyebrow page-kicker"><a href="/${escapeAttr(entry.number)}/" aria-label="Back to ${escapeAttr(entry.id)}">${escapeHtml(`Back to ${entry.id}`)}</a><span class="page-kicker-state">formal reference / ${escapeHtml(entry.id)}</span></p>
        <h1>${escapeHtml(formalPage.title || `${entry.id} formal reference`)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
      </section>

      <section class="panel">
        <h2>Formal reference metadata</h2>
        <dl class="meta">
          <dt>Decision</dt>
          <dd><a href="/${escapeAttr(entry.number)}/"><code>${escapeHtml(entry.id)}</code></a></dd>
          <dt>Stable URL</dt>
          <dd><code>${escapeHtml(formalPage.url || `https://kfd.libkungfu.dev/${entry.number}/formal`)}</code></dd>
          <dt>Source path</dt>
          <dd><code>${escapeHtml(formalPage.sourcePath || formalPage.path)}</code></dd>
          <dt>Relationship</dt>
          <dd><code>${escapeHtml(formalPage.relationship || "formal-reference-child-of-decision")}</code></dd>
          <dt>Normative</dt>
          <dd><code>${escapeHtml(String(formalPage.normative))}</code></dd>
          <dt>Model status</dt>
          <dd><code>${escapeHtml(formalPage.formalModelStatus || "unspecified")}</code></dd>
          <dt>Model version</dt>
          <dd><code>${escapeHtml(String(formalPage.formalModelVersion || "unspecified"))}</code></dd>
          <dt>Authority path</dt>
          <dd><code>${escapeHtml(formalPage.authorityPath || entry.path)}</code></dd>
        </dl>
      </section>

      <section class="doc-layout">
        <aside class="doc-sidebar">
          ${kfdDecisionNav(entry, "formal")}
          ${renderedFormal.tocHtml}
        </aside>
        <article class="panel doc-content">
          ${renderedFormal.html}
        </article>
      </section>`,
    });
    writeFile(`kfd/${entry.number}/formal/index.html`, formalPageHtml);
    writeFile(`${entry.number}/formal/index.html`, formalPageHtml);
  }
}

writeFile(
  "buildchain/mechanism/index.html",
  page({
    title: "Buildchain release trust and mechanics | buildchain.libkungfu.dev",
    description: "The complete KFD-2/3 trust model and package-owned Buildchain mechanism, CLI, workflows, artifacts, and release facts.",
    current: "buildchain",
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("buildchain")} aria-label="Back to Buildchain home">Back to Buildchain home</a><span class="page-kicker-state">mechanism / complete reference</span></p>
      <h1>Buildchain release trust and mechanics</h1>
      <p class="lead">Inspect the complete KFD-2/3 trust model, Hub boundary, package-owned mechanism, CLI, workflows, artifacts, and release facts.</p>
    </section>
    ${renderBuildchainReaderSynthesis()}
    <section class="hero" id="buildchain-authority">
      <p class="eyebrow">06 · Upstream authority · @kungfu-tech/buildchain</p>
      <h2 class="authority-title">${escapeHtml(buildchainSite.homepage.title)}</h2>
      <div class="lead badge-strip">${renderBuildchainLead(buildchainHomepageCopy.lead)}</div>
      <div class="stack">
        ${buildchainHomepageCopy.mechanismSummary.map((entry) => `<p>${escapeHtml(entry)}</p>`).join("\n")}
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

writeFile(
  "buildchain/index.html",
  page({
    title: "buildchain.libkungfu.dev | Buildchain surface",
    description: buildchainPageDescription(),
    current: "buildchain",
    body: `${renderReaderOrientation("buildchain", "Buildchain product surface")}
    ${renderBuildchainHomepageSummary()}`,
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

const runtimeAgentProjection = {
  ...runtimeSurface,
  agentSupplyChain,
  canonicalHost: surfaceCanonicalHost("hub"),
  humanEntry: surfaceCanonicalHref("hub"),
  machineEntry: surfaceEndpointHref("hub", "runtime.json"),
  readerContract: {
    contract: site.readerContract.contract,
    owner: site.readerContract.owner,
    path: readerPath("hub"),
    guidedSynthesis: site.readerContract.guidedSynthesis,
    sources: site.readerContract.sources,
  },
  sourceBoundary: {
    truthOwner: "kungfu-systems/kungfu exact public source and KFD Runtime 100 authority",
    siteRole: site.sourceBoundary.siteRole,
    rule: "This site owns reader framing and synthesis, then projects the pinned source, qualification, and claim boundary. It does not publish packages, rerun conformance, fork upstream meaning, or upgrade the claim.",
  },
};

const manifest = {
  schemaVersion: 1,
  contract: "libkungfu-dev-generated-site-manifest",
  ...surfaceTimestampPolicy,
  canonicalHost: surfaceCanonicalHost("hub"),
  sourceBoundary: site.sourceBoundary,
  readerContract: site.readerContract,
  pages: [
    { path: "/", host: surfaceCanonicalHost("hub"), source: "src/fixtures/site-manifest.json" },
    { path: "/architecture/", host: surfaceCanonicalHost("hub"), source: "src/fixtures/site-manifest.json" },
    {
      path: "/dogfood/",
      host: surfaceCanonicalHost("hub"),
      source: "src/fixtures/dogfood-evidence.json",
    },
    {
      path: "/dogfood-evidence.json",
      host: surfaceCanonicalHost("hub"),
      source: "src/fixtures/dogfood-evidence.json",
    },
    {
      path: "/runtime.json",
      host: surfaceCanonicalHost("hub"),
      source: "src/fixtures/libkungfu-runtime-surface.json",
    },
    {
      path: "/agent-supply-chain.json",
      host: surfaceCanonicalHost("hub"),
      source: `@kungfu-tech/paper-kungfu-product-white-paper@${whitePaperEvidence.source.packageVersion}/site/evidence-site.json`,
    },
    { path: "/core/", host: surfaceCanonicalHost("core"), source: "src/fixtures/core-runtime-surface.json" },
    { path: "/runtime/", host: surfaceCanonicalHost("core"), source: "src/fixtures/core-runtime-surface.json" },
    { path: "/manifest.json", host: surfaceCanonicalHost("core"), source: "src/fixtures/core-runtime-surface.json" },
    { path: "/llms.txt", host: surfaceCanonicalHost("core"), source: "src/fixtures/core-runtime-surface.json" },
    { path: "/llms-full.txt", host: surfaceCanonicalHost("core"), source: "src/fixtures/core-runtime-surface.json" },
    ...publicationArchives.routes.map((route) => ({
      path: route.path,
      host: route.host,
      source: route.source,
      routeKind: route.routeKind,
      immutable: route.immutable || undefined,
      sha256: route.sha256,
    })),
    {
      path: "/buildchain/",
      host: surfaceCanonicalHost("buildchain"),
      source: `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/buildchain-site.json`,
    },
    {
      path: "/mechanism/",
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
    {
      path: "/decisions/",
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/site/kfd-site.json`,
    },
    {
      path: kfdFoundationPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.foundationPage.sourcePath}`,
    },
    {
      path: kfdFormalModelPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.formalPage.sourcePath}`,
    },
    {
      path: kfdTerminologyPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.terminologyPage.sourcePath}`,
    },
    {
      path: "/terminology.json",
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/terminology.json`,
    },
    {
      path: "/schemas/kfd-terminology.schema.json",
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/schemas/kfd-terminology.schema.json`,
    },
    {
      path: kfdCasesPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.casesPage.sourcePath}`,
    },
    {
      path: "/cases/registry.json",
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/cases/registry.json`,
    },
    {
      path: kfdCandidateIndexPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.kfdCandidates.indexSource}`,
    },
    ...kfdCandidatePages.map((pageEntry) => ({
      path: pageEntry.url,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${pageEntry.sourcePath}`,
    })),
    ...kfdCandidateFormalPages.map((pageEntry) => ({
      path: pageEntry.url,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${pageEntry.sourcePath}`,
    })),
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
    ...kfdFormalPages
      .filter((pageEntry) => pageEntry.sourceExists)
      .map((pageEntry) => ({
        path: `/${pageEntry.decisionNumber}/formal/`,
        host: surfaceCanonicalHost("kfd"),
        source: `@kungfu-tech/kfd@${kfdPackage.version}/${pageEntry.sourcePath || pageEntry.path}`,
      })),
  ],
  machineEntries: site.stableMachineEntries,
  upstreamFixtures: {
    runtime: {
      contract: runtimeSurface.contract,
      status: runtimeSurface.status,
      claimLevel: runtimeSurface.claimLevel,
      sourceCommit: runtimeSurface.source.sourceCommit,
      mainlineCommit: runtimeSurface.source.mainlineCommit,
      projectCutRoot: runtimeSurface.source.projectCutRoot,
      suiteRoot: runtimeSurface.qualification.suiteRoot,
    },
    core: {
      contract: core.contract,
      status: core.status,
      sourceRepository: core.sourceRepository,
      sourceRef: core.sourceRef,
      surfaceManifest: surfaceEndpointHref("core", "manifest.json"),
      evidence: core.evidence,
      sourceContract: {
        package: core.sourceContract.package,
        status: core.sourceContract.status,
        docsUrlPattern: core.sourceContract.docsUrlPattern,
      },
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
    papers: {
      contract: publicationArchives.registry.contract,
      source: publicationArchives.source.source,
      sourceKind: publicationArchives.source.kind,
      packages: publicationArchives.source.packages,
      archivePolicy: publicationArchives.registry.archivePolicy,
      publicationCount: publicationArchives.registry.publications.length,
      immutableArtifactCount: publicationArchives.immutableArtifacts.length,
      routes: publicationArchives.routes,
    },
    kfd: {
      contract: kfdSite.contract,
      package: kfdPackage.name,
      version: kfdPackage.version,
      lockIntegrity: kfdLock.integrity,
      releaseLock: kfdPropagationLock
        ? {
            path: kfdPropagationLockPath.startsWith(path.join(repoRoot, ".buildchain"))
              ? ".buildchain/upstreams/kfd.release.json"
              : "buildchain.upstreams/kfd.release.json",
            tag: kfdPropagationLock.upstream?.tag,
            lockSha256: kfdPropagationLock.lockSha256,
          }
        : undefined,
      registryContract: kfdRegistry.contract,
      candidateRegistryContract: kfdCandidateRegistry.contract,
      standardsContract: kfdStandards.contract,
      decisionCount: kfdRegistry.entries.length,
      candidateCount: kfdCandidatePages.length,
      candidateFormalCount: kfdCandidateFormalPages.length,
    },
  },
};

writeFile("runtime.json", `${JSON.stringify(runtimeAgentProjection, null, 2)}\n`);
writeFile("agent-supply-chain.json", `${JSON.stringify(agentSupplyChain, null, 2)}\n`);
writeFile("dogfood-evidence.json", `${JSON.stringify(dogfoodEvidence, null, 2)}\n`);
writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const kfdDecisionEntries = kfdRegistry.entries.map((entry) => ({
  usage: kfdUsagePageByDecisionNumber.get(String(entry.number))?.sourceExists
    ? {
        path: `/${entry.number}/usage/`,
        url: surfaceEndpointHref("kfd", `${entry.number}/usage/`),
        source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdUsagePageByDecisionNumber.get(String(entry.number)).sourcePath || kfdUsagePageByDecisionNumber.get(String(entry.number)).path}`,
      }
    : undefined,
  formal: kfdFormalPageByDecisionNumber.get(String(entry.number))?.sourceExists
    ? {
        path: `/${entry.number}/formal/`,
        url: surfaceEndpointHref("kfd", `${entry.number}/formal/`),
        source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdFormalPageByDecisionNumber.get(String(entry.number)).sourcePath || kfdFormalPageByDecisionNumber.get(String(entry.number)).path}`,
        relationship: kfdFormalPageByDecisionNumber.get(String(entry.number)).relationship,
        normative: kfdFormalPageByDecisionNumber.get(String(entry.number)).normative,
        formalModelVersion: kfdFormalPageByDecisionNumber.get(String(entry.number)).formalModelVersion,
        formalModelStatus: kfdFormalPageByDecisionNumber.get(String(entry.number)).formalModelStatus,
        authorityPath: kfdFormalPageByDecisionNumber.get(String(entry.number)).authorityPath,
        sha256: kfdFormalPageByDecisionNumber.get(String(entry.number)).sha256,
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
  humanEntries: {
    overview: surfaceCanonicalHref("kfd"),
    decisions: surfaceEndpointHref("kfd", "decisions/"),
  },
  agentEntries: {
    llms: surfaceEndpointHref("kfd", "llms.txt"),
    manifest: surfaceEndpointHref("kfd", "manifest.json"),
    registry: surfaceEndpointHref("kfd", "registry.json"),
    candidateRegistry: surfaceEndpointHref("kfd", "drafts/registry.json"),
    caseRegistry: surfaceEndpointHref("kfd", "cases/registry.json"),
    standards: surfaceEndpointHref("kfd", "standards.json"),
    terminology: surfaceEndpointHref("kfd", "terminology.json"),
    terminologySchema: surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json"),
  },
  readerContract: {
    contract: site.readerContract.contract,
    owner: site.readerContract.owner,
    path: readerPath("kfd"),
    layers: site.readerContract.layers,
    sourceBoundary: site.sourceBoundary,
  },
  sourceBoundary: {
    truthOwner: "@kungfu-tech/kfd",
    siteRole: site.sourceBoundary.siteRole,
    rule: "KFD facts, registry entries, standards metadata, and decision text come from the pinned @kungfu-tech/kfd package. This site owns their reader framing and may expose and render them, but must not fork their meaning.",
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
    surfaceEndpointHref("kfd", "decisions/"),
    surfaceEndpointHref("kfd", kfdFoundationPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", kfdFormalModelPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", kfdTerminologyPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", "terminology.json"),
    surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json"),
    surfaceEndpointHref("kfd", kfdCasesPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", kfdCandidateIndexPath.replace(/^\/+/, "")),
    ...kfdCandidatePages.map((entry) => surfaceEndpointHref("kfd", entry.url.replace(/^\/+/, ""))),
    ...kfdCandidateFormalPages.map((entry) => surfaceEndpointHref("kfd", entry.url.replace(/^\/+/, ""))),
    ...kfdDecisionEntries.map((entry) => entry.url),
    ...kfdDecisionEntries.map((entry) => entry.usage?.url).filter(Boolean),
    ...kfdDecisionEntries.map((entry) => entry.formal?.url).filter(Boolean),
    surfaceEndpointHref("kfd", "registry.json"),
    surfaceEndpointHref("kfd", "drafts/registry.json"),
    surfaceEndpointHref("kfd", "cases/registry.json"),
    surfaceEndpointHref("kfd", "standards.json"),
  ],
  foundation: {
    path: kfdFoundationPath,
    url: surfaceEndpointHref("kfd", kfdFoundationPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.foundationPage.sourcePath}`,
    relationship: kfdSite.foundationPage.relationship,
    normative: kfdSite.foundationPage.normative,
  },
  formalModel: {
    path: kfdFormalModelPath,
    url: surfaceEndpointHref("kfd", kfdFormalModelPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.formalPage.sourcePath}`,
    relationship: kfdSite.formalPage.relationship,
    normative: kfdSite.formalPage.normative,
    formalModelVersion: kfdSite.formalPage.formalModelVersion,
  },
  terminology: {
    path: kfdTerminologyPath,
    url: surfaceEndpointHref("kfd", kfdTerminologyPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.terminologyPage.sourcePath}`,
    contract: surfaceEndpointHref("kfd", "terminology.json"),
    schema: surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json"),
    relationship: kfdSite.terminologyPage.relationship,
    normative: kfdSite.terminologyPage.normative,
  },
  cases: {
    path: kfdCasesPath,
    url: surfaceEndpointHref("kfd", kfdCasesPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.casesPage.sourcePath}`,
    registry: surfaceEndpointHref("kfd", "cases/registry.json"),
    registryContract: kfdCaseRegistry.contract,
    relationship: kfdSite.casesPage.relationship,
    normative: kfdSite.casesPage.normative,
  },
  candidates: {
    path: kfdCandidateIndexPath,
    url: surfaceEndpointHref("kfd", kfdCandidateIndexPath.replace(/^\/+/, "")),
    registry: surfaceEndpointHref("kfd", "drafts/registry.json"),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.kfdCandidates.source}`,
    relationship: kfdSite.kfdCandidates.relationship,
    normative: kfdSite.kfdCandidates.normative,
    entries: kfdCandidatePages.map((entry) => ({
      formal: kfdCandidateFormalPageByCandidateId.has(entry.id)
        ? {
            id: kfdCandidateFormalPageByCandidateId.get(entry.id).id,
            path: kfdCandidateFormalPageByCandidateId.get(entry.id).url,
            url: surfaceEndpointHref(
              "kfd",
              kfdCandidateFormalPageByCandidateId.get(entry.id).url.replace(/^\/+/, ""),
            ),
            source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdCandidateFormalPageByCandidateId.get(entry.id).sourcePath}`,
            relationship: kfdCandidateFormalPageByCandidateId.get(entry.id).relationship,
            normative: kfdCandidateFormalPageByCandidateId.get(entry.id).normative,
            formalCandidateVersion: kfdCandidateFormalPageByCandidateId.get(entry.id).formalCandidateVersion,
            formalCandidateStatus: kfdCandidateFormalPageByCandidateId.get(entry.id).formalCandidateStatus,
            authorityPath: kfdCandidateFormalPageByCandidateId.get(entry.id).authorityPath,
          }
        : undefined,
      id: entry.id,
      title: entry.title,
      status: entry.status,
      slotHint: entry.slotHint,
      path: entry.url,
      url: surfaceEndpointHref("kfd", entry.url.replace(/^\/+/, "")),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.sourcePath}`,
      relationship: kfdSite.candidatePages.relationship,
      normative: kfdSite.candidatePages.normative,
      claimBoundary: entry.claimBoundary,
    })),
  },
  decisions: kfdDecisionEntries,
  relatedSurfaces: {
    buildchain: surfaceCanonicalHref("buildchain"),
    kungfu: "https://kungfu.tech/",
    hub: surfaceCanonicalHref("hub"),
  },
};

writeFile("kfd/manifest.json", `${JSON.stringify(kfdAgentManifest, null, 2)}\n`);
writeFile("kfd/registry.json", `${JSON.stringify(kfdRegistry, null, 2)}\n`);
writeFile("kfd/terminology.json", `${JSON.stringify(kfdTerminology, null, 2)}\n`);
writeFile("terminology.json", `${JSON.stringify(kfdTerminology, null, 2)}\n`);
writeFile("kfd/schemas/kfd-terminology.schema.json", `${JSON.stringify(kfdTerminologySchema, null, 2)}\n`);
writeFile("schemas/kfd-terminology.schema.json", `${JSON.stringify(kfdTerminologySchema, null, 2)}\n`);
writeFile("kfd/cases/registry.json", `${JSON.stringify(kfdCaseRegistry, null, 2)}\n`);
writeFile("cases/registry.json", `${JSON.stringify(kfdCaseRegistry, null, 2)}\n`);
writeFile("kfd/standards.json", `${JSON.stringify(kfdStandards, null, 2)}\n`);
writeFile(
  "kfd/llms.txt",
  `# ${surfaceCanonicalHost("kfd")}

Kung Fu Decisions (KFD) is the kungfu-systems decision registry surface.

Reader contract: ${site.readerContract.contract}
Audience: ${readerPath("kfd").audience}
Question: ${readerPath("kfd").question}
Promise: ${readerPath("kfd").promise}

Human entry:
- ${surfaceCanonicalHref("kfd")}

Agent-first entries:
- ${surfaceEndpointHref("kfd", "manifest.json")}
- ${surfaceEndpointHref("kfd", "registry.json")}
- ${surfaceEndpointHref("kfd", "drafts/registry.json")}
- ${surfaceEndpointHref("kfd", "cases/registry.json")}
- ${surfaceEndpointHref("kfd", "standards.json")}
- ${surfaceEndpointHref("kfd", "terminology.json")}
- ${surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json")}
- ${surfaceEndpointHref("kfd", "llms.txt")}

Read order:
${kfdAgentManifest.readOrder.map((entry) => `- ${entry}`).join("\n")}

Source boundary:
KFD facts, registry entries, standards metadata, and decision text come from
@kungfu-tech/kfd@${kfdPackage.version}. site-libkungfu-dev owns reader framing
and renders and exposes those facts, but does not own or fork their meaning.
`,
);

writeFile(
  "llms.txt",
  `# ${surfaceCanonicalHost("hub")}

libkungfu.dev is the open developer and agent substrate hub for Kungfu.

Reader contract: ${site.readerContract.contract}
${site.readerContract.promise}

Reader layers:
${site.readerContract.layers.map((entry) => `- ${entry.label} [${entry.owner}]: ${entry.purpose}`).join("\n")}

Guided synthesis:
${site.readerContract.guidedSynthesis.heading}
${site.readerContract.guidedSynthesis.lead}
${site.readerContract.guidedSynthesis.conceptualChain.map((entry) => `- ${entry.label} [${entry.claimClass}]: ${entry.summary} Sources: ${entry.sourceRefs.join(", ")}`).join("\n")}
- ${site.readerContract.guidedSynthesis.hubConsequence.heading} [${site.readerContract.guidedSynthesis.hubConsequence.claimClass}]: ${site.readerContract.guidedSynthesis.hubConsequence.summary} Sources: ${site.readerContract.guidedSynthesis.hubConsequence.sourceRefs.join(", ")}

Agent supply chain:
${site.readerContract.guidedSynthesis.supplyChain.summary}
${site.readerContract.guidedSynthesis.supplyChain.steps.map((entry) => `- ${entry.label} [${entry.owner}; ${entry.claimClass}]: ${entry.summary} Sources: ${entry.sourceRefs.join(", ")}`).join("\n")}
- Claim boundary [non-claim]: ${site.readerContract.guidedSynthesis.supplyChain.nonClaim}

Buildchain reader synthesis:
${site.readerContract.surfaceSynthesis.buildchain.heading}
${site.readerContract.surfaceSynthesis.buildchain.lead}
- ${site.readerContract.surfaceSynthesis.buildchain.trustLoop.heading} [${site.readerContract.surfaceSynthesis.buildchain.trustLoop.claimClass}]: ${site.readerContract.surfaceSynthesis.buildchain.trustLoop.summary} Sources: ${site.readerContract.surfaceSynthesis.buildchain.trustLoop.sourceRefs.join(", ")}
${site.readerContract.surfaceSynthesis.buildchain.trustLoop.steps.map((entry) => `- ${entry.label} / ${entry.role} [${entry.claimClass}]: ${entry.summary} Sources: ${entry.sourceRefs.join(", ")}`).join("\n")}
- ${site.readerContract.surfaceSynthesis.buildchain.hubValue.heading} [${site.readerContract.surfaceSynthesis.buildchain.hubValue.claimClass}]: ${site.readerContract.surfaceSynthesis.buildchain.hubValue.summary} Sources: ${site.readerContract.surfaceSynthesis.buildchain.hubValue.sourceRefs.join(", ")}
${site.readerContract.surfaceSynthesis.buildchain.hubValue.outcomes.map((entry) => `- ${entry.label} [${entry.claimClass}]: ${entry.summary} Sources: ${entry.sourceRefs.join(", ")}`).join("\n")}
- ${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.heading} [${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.claimClass}]: ${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.summary} Sources: ${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.sourceRefs.join(", ")}
${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.steps.map((entry) => `- ${entry.label} [${entry.claimClass}]: ${entry.summary} Sources: ${entry.sourceRefs.join(", ")}`).join("\n")}
- Claim boundary [${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.nonClaimClass}]: ${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.nonClaim} Sources: ${site.readerContract.surfaceSynthesis.buildchain.ecosystemEffect.nonClaimSourceRefs.join(", ")}
- ${site.readerContract.surfaceSynthesis.buildchain.ownershipBoundary.heading} [${site.readerContract.surfaceSynthesis.buildchain.ownershipBoundary.claimClass}]: ${site.readerContract.surfaceSynthesis.buildchain.ownershipBoundary.summary} Sources: ${site.readerContract.surfaceSynthesis.buildchain.ownershipBoundary.sourceRefs.join(", ")}
- Retained by the Hub: ${site.readerContract.surfaceSynthesis.buildchain.ownershipBoundary.retainedByHub.join("; ")}

Surface reading paths:
${site.readerContract.surfacePaths.map((entry) => `- ${entry.id} / ${entry.audience}: ${entry.question} ${entry.promise}`).join("\n")}

Primary pages:
- ${surfaceCanonicalHref("hub")}
- ${surfaceEndpointHref("hub", "architecture/")} (complete continuity architecture)
- ${surfaceEndpointHref("hub", "dogfood/")}
- ${surfaceCanonicalHref("core")}
- ${surfaceEndpointHref("core", "runtime/")} (complete runtime mechanism)
- ${surfaceCanonicalHref("buildchain")}
- ${surfaceEndpointHref("buildchain", "mechanism/")} (complete release-trust mechanism)
- ${surfaceCanonicalHref("kfd")}
- ${surfaceEndpointHref("kfd", "decisions/")} (complete decisions and standards)
- ${surfaceCanonicalHref("papers")}
- ${surfaceEndpointHref("papers", "archive/")} (publication evidence)

Machine entries:
- ${surfaceEndpointHref("hub", "manifest.json")}
- ${surfaceEndpointHref("hub", "runtime.json")}
- ${surfaceEndpointHref("hub", "agent-supply-chain.json")}
- ${surfaceEndpointHref("hub", "dogfood-evidence.json")}
- ${surfaceEndpointHref("hub", "llms.txt")}
- ${surfaceEndpointHref("hub", "llms-full.txt")}
- ${surfaceEndpointHref("core", "manifest.json")}
- ${surfaceEndpointHref("core", "llms.txt")}
- ${surfaceEndpointHref("papers", "manifest.json")}
- ${surfaceEndpointHref("papers", "registry.json")}

Core runtime mechanism:
${core.architecture.writer.label} -> ${core.architecture.journal.label} -> ${core.architecture.readers.map((reader) => reader.label).join(" / ")}

Core claim boundary:
${core.homepage.claimBoundary}

Agent Supply Chain:
${agentSupplyChain.layers.map((layer) => `${layer.order}. ${layer.id} [${layer.statusClass}] - ${layer.statement}`).join("\n")}

Claim boundary:
${agentSupplyChain.claimBoundary}

Vendor next action:
${agentSupplyChain.vendorNextAction}

Source boundary:
This repository owns the reader contract and renders pinned upstream evidence,
manifests, and packages. It is not a product fact source. Embeddable runtime facts come from the pinned
Kungfu source/PR and KFD Runtime 100 roots in /runtime.json. Core mmap and
recovery claims are pinned to exact Kungfu evidence while the future spec
handoff remains a secondary fixture. Buildchain facts must come from the
@kungfu-tech/buildchain docs/site bundle. KFD facts must come from the
@kungfu-tech/kfd site bundle, registry, and decision documents. Publication
archive facts must come from Buildchain publication registry data.
`,
);

writeFile(
  "llms-full.txt",
  `# libkungfu.dev full agent index

${JSON.stringify(manifest, null, 2)}
`,
);
