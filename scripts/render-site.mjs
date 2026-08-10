import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import MarkdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import { createSurfaceTimestampPolicy } from "@kungfu-tech/buildchain/surface-manifest";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const fixturesDir = path.join(repoRoot, "src", "fixtures");
const require = createRequire(import.meta.url);
const { loadPublicationPackageSet, readPublicationArtifact } = require("./publication-packages.cjs");
const {
  IMMUTABLE_PUBLICATION_PAGE_CONTRACT,
  renderImmutablePublicationPage,
} = require("./immutable-publication-page.cjs");
const {
  verifyPaperPropagationQualification,
} = require("./paper-propagation.cjs");
const BRAND_SIGNATURE = "Kungfu UNGFU™";
const BRAND_CONTEXT = "Developer Platform";
const BRAND_BOUNDARY = "Kungfu is the product name. UNGFU is not a second product or runtime, and the trademark symbol makes no registration-status claim.";

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

function extractTarEntry(archivePath, entryPath) {
  const archive = gunzipSync(fs.readFileSync(archivePath));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const readField = (start, end) => header.subarray(start, end).toString("utf8").replace(/\0.*$/, "").trim();
    const name = [readField(345, 500), readField(0, 100)].filter(Boolean).join("/");
    const size = Number.parseInt(readField(124, 136) || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`invalid source bundle entry size: ${name}`);
    const contentOffset = offset + 512;
    if (contentOffset + size > archive.length) throw new Error(`truncated source bundle entry: ${name}`);
    if (name === entryPath) return archive.subarray(contentOffset, contentOffset + size);
    offset = contentOffset + Math.ceil(size / 512) * 512;
  }
  throw new Error(`publication source bundle is missing ${entryPath}`);
}

function readPublicationPackageJson(packageName, relativePath) {
  const root = packageRoot(packageName);
  const directPath = path.join(root, relativePath);
  if (fs.existsSync(directPath)) return readJsonFile(directPath);

  const packageInfo = readJsonFile(path.join(root, "package.json"));
  const registry = readJsonFile(path.join(root, ".buildchain", "publication", "publication-registry.json"));
  const version = registry.versions?.find((entry) => entry.version === packageInfo.version);
  const metadata = version?.metadata?.find((entry) => entry.path === relativePath);
  if (!metadata?.sha256) throw new Error(`publication registry does not authenticate ${relativePath}`);
  const content = extractTarEntry(path.join(root, ".buildchain", "publication", "source.tar.gz"), relativePath);
  const digest = crypto.createHash("sha256").update(content).digest("hex");
  if (digest !== metadata.sha256) throw new Error(`publication source bundle digest mismatch for ${relativePath}`);
  return JSON.parse(content.toString("utf8"));
}

function readPnpmLockPackage(packageName, version) {
  const lockText = fs.readFileSync(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '${escapedName}@${escapedVersion}':\\n(?:    .+\\n)*?    resolution: \\{integrity: ([^}]+)\\}`, "m");
  const match = lockText.match(pattern);
  if (match) {
    return {
      version,
      integrity: match[1].trim(),
    };
  }
  const localPattern = new RegExp(
    `^  '${escapedName}@file:[^']+':\\n    resolution: \\{integrity: ([^,}]+)[^\\n]*\\}\\n    version: ${escapedVersion}$`,
    "m",
  );
  const localMatch = lockText.match(localPattern);
  if (!localMatch) {
    throw new Error(`pnpm-lock.yaml missing ${packageName}@${version}`);
  }
  return {
    version,
    integrity: localMatch[1].trim(),
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

function copyDirectoryContents(sourceDir, outputDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputPath = path.posix.join(outputDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, outputPath);
    } else if (entry.isFile()) {
      writeBinaryFile(outputPath, fs.readFileSync(sourcePath));
    }
  }
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
  return String(source).replace(/\]\((?!https?:\/\/|\/|#)([^)\s#]+)(#[^)]+)?\)/g, (_match, target, hash = "") => {
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

function extractBuildchainBadgeBlock(source) {
  const markdown = String(source || "");
  const startMarker = "<!-- buildchain:badges:start -->";
  const endMarker = "<!-- buildchain:badges:end -->";
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker, start + startMarker.length);
  return start >= 0 && end >= start
    ? markdown.slice(start, end + endMarker.length)
    : "";
}

function normalizeBuildchainHomepageCopy(homepage, pages = []) {
  const mechanismSummary = [...(homepage.mechanismSummary || [])];
  const overviewMarkdown = pages.find((page) => page.sourcePath === "README.md")?.markdown || "";
  const leadParts = [extractBuildchainBadgeBlock(homepage.lead) || extractBuildchainBadgeBlock(overviewMarkdown)];
  if (!leadParts[0]) {
    leadParts[0] = homepage.lead || "";
  }
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
  if (current === "buildchain" && pathPart === "manifest.json") {
    return "/manifest.json";
  }
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

function papersOutputPath(urlValue, label) {
  const url = new URL(String(urlValue || ""));
  if (url.protocol !== "https:" || url.host !== "papers.libkungfu.dev" || url.search || url.hash) {
    throw new Error(`${label} must be a stable papers.libkungfu.dev URL`);
  }
  return archiveOutputPath(url.pathname);
}

function readPublicationReleaseEvidence(publication) {
  const lockPath = path.join(repoRoot, "buildchain.upstreams", `paper-${publication.id}.release.json`);
  if (!fs.existsSync(lockPath)) return undefined;
  const lock = readJsonFile(lockPath);
  if (
    lock.upstream?.package?.name !== publication.package
    || lock.upstream?.package?.version !== publication.latest.version
    || lock.upstream?.publicationArtifact?.id !== publication.id
  ) {
    return undefined;
  }
  const evidencePath = path.join(
    repoRoot,
    "src",
    "upstream-release-evidence",
    publication.id,
    "buildchain.release.json",
  );
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`current publication release evidence is missing: ${publication.id}@${publication.latest.version}`);
  }
  const content = fs.readFileSync(evidencePath);
  const contentSha256 = sha256Buffer(content);
  if (contentSha256 !== `sha256:${lock.upstream.releasePassport.sha256}`) {
    throw new Error(`publication release evidence digest mismatch: ${publication.id}@${publication.latest.version}`);
  }
  JSON.parse(content.toString("utf8"));
  return {
    content,
    contentSha256,
    lockPath: path.relative(repoRoot, lockPath).split(path.sep).join("/"),
    lockSha256: `sha256:${lock.lockSha256}`,
    sourceSha: lock.upstream.sourceSha,
    version: lock.upstream.package.version,
    canonicalUrl: publication.latest.evidenceUrl,
    executionProfile: lock.downstream.executionProfile,
  };
}

function publicationArtifactDescriptors(version) {
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
    return {
      ...artifact,
      path: artifactPath,
    };
  });
}

function renderPublicationArtifacts(version) {
  return publicationArtifactDescriptors(version).map((artifact) => {
    const body = readPublicationArtifact(artifact);
    const digest = sha256Buffer(body);
    if (digest !== artifact.sha256) {
      throw new Error(`publication artifact digest mismatch for ${artifact.path}: expected ${artifact.sha256}, got ${digest}`);
    }
    const renderedArtifact = {
      ...artifact,
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

const FROZEN_IMMUTABLE_PUBLICATION_PAGES = new Map([
  ...[
    "0.1.0-alpha.0",
    "0.1.0-alpha.1",
    "0.1.0-alpha.2",
    "0.1.0-alpha.3",
    "0.1.0-alpha.4",
    "0.1.0-alpha.5",
    "0.1.0-alpha.6",
    "0.1.0-alpha.7",
    "0.1.0-alpha.8",
    "0.1.0-alpha.9",
    "0.1.0-alpha.11",
    "0.1.0-alpha.12",
  ].map((version) => [
    `/archive/kungfu-product-white-paper/v${version}/`,
    {
      contract: IMMUTABLE_PUBLICATION_PAGE_CONTRACT,
      path: `src/immutable-publication-pages/kungfu-product-white-paper/v${version}/index.html`,
    },
  ]),
  ...[
    "0.1.0-alpha.0",
    "0.1.0-alpha.1",
    "0.1.0-alpha.3",
    "0.1.0-alpha.4",
    "0.1.0-alpha.5",
    "0.1.0-alpha.6",
    "0.1.0-alpha.7",
    "0.1.0-alpha.8",
    "0.1.0-alpha.9",
    "0.1.0-alpha.10",
  ].map((version) => [
    `/archive/kfd-machine-life-roadmap/v${version}/`,
    {
      contract: IMMUTABLE_PUBLICATION_PAGE_CONTRACT,
      path: `src/immutable-publication-pages/kfd-machine-life-roadmap/v${version}/index.html`,
    },
  ]),
  [
    "/archive/kungfu-product-white-paper/v0.1.0-alpha.10/",
    {
      contract: "libkungfu-dev-immutable-publication-page-legacy-v0",
      path: "src/immutable-publication-pages/kungfu-product-white-paper/v0.1.0-alpha.10/index.html",
    },
  ],
  [
    "/archive/kfd-foundation-real-world-agent-work/v0.1.0-alpha.8/",
    {
      contract: "libkungfu-dev-immutable-publication-page-legacy-v0",
      path: "src/immutable-publication-pages/kfd-foundation-real-world-agent-work/v0.1.0-alpha.8/index.html",
    },
  ],
  [
    "/archive/observer-declared-timelines/v0.1.0-alpha.9/",
    {
      contract: "libkungfu-dev-immutable-publication-page-legacy-v0",
      path: "src/immutable-publication-pages/observer-declared-timelines/v0.1.0-alpha.9/index.html",
    },
  ],
  [
    "/archive/episodes-to-primitives/v0.1.0-alpha.2/",
    {
      contract: "libkungfu-dev-immutable-publication-page-legacy-v0",
      path: "src/immutable-publication-pages/episodes-to-primitives/v0.1.0-alpha.2/index.html",
    },
  ],
  [
    "/archive/kfd-machine-life-roadmap/v0.1.0-alpha.2/",
    {
      contract: "libkungfu-dev-immutable-publication-page-legacy-v0",
      path: "src/immutable-publication-pages/kfd-machine-life-roadmap/v0.1.0-alpha.2/index.html",
    },
  ],
]);

function renderFrozenImmutablePublicationPage(version) {
  const snapshot = FROZEN_IMMUTABLE_PUBLICATION_PAGES.get(version.immutablePath);
  if (!snapshot) {
    throw new Error(`immutable publication page is not frozen: ${version.immutablePath}`);
  }
  let body = fs.readFileSync(path.join(repoRoot, snapshot.path), "utf8");
  if (snapshot.contract === "libkungfu-dev-immutable-publication-page-legacy-v0") {
    for (const surface of ["papers", "buildchain", "core", "kfd", "hub"]) {
      const productionHref = {
        hub: "https://libkungfu.dev/",
        core: "https://core.libkungfu.dev/",
        buildchain: "https://buildchain.libkungfu.dev/",
        kfd: "https://kfd.libkungfu.dev/",
        papers: "https://papers.libkungfu.dev/",
      }[surface];
      body = body.replaceAll(productionHref, surfaceCanonicalHref(surface));
    }
  }
  return body;
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
        renderedArtifacts: versionId === publication.latest.version
          ? renderPublicationArtifacts(version)
          : publicationArtifactDescriptors(version),
      };
    });
    if (!versions.some((version) => version.version === publication.latest.version)) {
      throw new Error(`publication ${id} latest version is missing from versions: ${publication.latest.version}`);
    }
    for (const version of versions) {
      if (version.version !== publication.latest.version && !FROZEN_IMMUTABLE_PUBLICATION_PAGES.has(version.immutablePath)) {
        throw new Error(`historical immutable publication page is not frozen: ${id}@${version.version}`);
      }
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
  const releaseEvidenceByPublication = new Map(
    normalizedPublications
      .map((publication) => [publication.id, readPublicationReleaseEvidence(publication)])
      .filter(([, evidence]) => evidence),
  );

  const featuredPublicationFrames = [
    {
      id: "kungfu-product-white-paper",
      focus: "present",
      eyebrow: "Present · White Paper",
      orientation: "Kungfu now",
    },
    {
      id: "kfd-machine-life-roadmap",
      focus: "future",
      eyebrow: "Future · Machine Life",
      orientation: "Kungfu next",
    },
  ];
  const featuredPublicationIds = new Set(featuredPublicationFrames.map((frame) => frame.id));
  const featuredPublications = featuredPublicationFrames.map((frame) => {
    const publication = normalizedPublications.find((entry) => entry.id === frame.id);
    if (!publication) {
      throw new Error(`featured publication is missing from the registry: ${frame.id}`);
    }
    return { publication, frame };
  });
  const supportingPublications = normalizedPublications.filter((publication) => !featuredPublicationIds.has(publication.id));
  const renderPublicationCard = (publication, frame = null) => {
    const latestVersion = publication.versions.find((version) => version.version === publication.latest.version);
    const pdf = latestVersion.renderedArtifacts.find((artifact) => artifact.kind === "pdf");
    const cardClass = frame ? "publication-card-featured" : "publication-card-supporting";
    const featuredKind = frame?.focus || "supporting";
    return `<article class="panel publication-card ${cardClass}" data-featured="${escapeAttr(featuredKind)}" data-publication-id="${escapeAttr(publication.id)}">
      <div class="publication-card-heading">
        <p class="eyebrow">${escapeHtml(frame?.eyebrow || publication.kind || "paper")}</p>
        ${frame ? `<p class="publication-orientation">${escapeHtml(frame.orientation)}</p>` : ""}
      </div>
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
  };

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
        <p class="lead">Five papers on Kungfu's system, direction, and evidence model. Start with the defining pair, then follow the supporting research.</p>
      </section>

      <section class="publication-featured" aria-labelledby="featured-papers-heading">
        <div class="publication-section-heading">
          <div>
            <p class="eyebrow">Start here</p>
            <h2 id="featured-papers-heading">Kungfu: now and next</h2>
          </div>
          <p>The White Paper explains Kungfu now. Machine Life explores what comes next.</p>
        </div>
        <div class="publication-featured-grid">
          ${featuredPublications.map(({ publication, frame }) => renderPublicationCard(publication, frame)).join("\n")}
        </div>
      </section>

      <section class="publication-library" aria-labelledby="research-papers-heading">
        <div class="publication-section-heading publication-section-heading-compact">
          <div>
            <p class="eyebrow">More papers</p>
            <h2 id="research-papers-heading">Research and foundations</h2>
          </div>
        </div>
        <div class="grid three publication-grid publication-secondary-grid">
          ${supportingPublications.map((publication) => renderPublicationCard(publication)).join("\n")}
        </div>
      </section>

      <section class="panel archive-boundary">
        <p class="eyebrow">Need versions, hashes, and provenance?</p>
        <h2>Publication evidence lives in the archive.</h2>
        <p>Open the archive for manifests, source bundles, passports, hashes, and immutable version paths.</p>
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
      immutableArchive: true,
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

    const publicationPageBody = page({
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
      });
    writeFile(archiveOutputPath(publicationBasePath, "index.html"), publicationPageBody);
    renderedRoutes.push({ path: publicationBasePath, host: surfaceCanonicalHost("papers"), source: source.source, routeKind: "publication-index" });

    const releaseEvidence = releaseEvidenceByPublication.get(publication.id);
    if (releaseEvidence) {
      const pageAliases = (releaseEvidence.executionProfile?.readbackUrls || [])
        .filter((url) => new URL(url).pathname.endsWith("/") && url !== publication.canonicalReader.url);
      for (const alias of pageAliases) {
        writeFile(path.posix.join(papersOutputPath(alias, `${publication.id} readback page`), "index.html"), publicationPageBody);
        renderedRoutes.push({ path: new URL(alias).pathname, host: surfaceCanonicalHost("papers"), source: releaseEvidence.lockPath, routeKind: "publication-readback-alias" });
      }
    }

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

    if (releaseEvidence) {
      const evidenceUrls = new Set([
        releaseEvidence.canonicalUrl,
        ...(releaseEvidence.executionProfile?.readbackUrls || []).filter((url) => url.endsWith("/buildchain.release.json")),
      ]);
      for (const evidenceUrl of evidenceUrls) {
        writeBinaryFile(papersOutputPath(evidenceUrl, `${publication.id} release evidence`), releaseEvidence.content);
        renderedRoutes.push({
          path: new URL(evidenceUrl).pathname,
          host: surfaceCanonicalHost("papers"),
          source: releaseEvidence.lockPath,
          routeKind: "latest-release-evidence",
          sha256: releaseEvidence.contentSha256,
          mediaType: "application/json",
        });
      }
    }

    for (const version of publication.versions) {
      const currentPackageVersion = version.version === publication.latest.version;
      const frozenImmutableIndex = FROZEN_IMMUTABLE_PUBLICATION_PAGES.get(version.immutablePath);
      if (currentPackageVersion || frozenImmutableIndex) {
        const immutableIndexContract = frozenImmutableIndex?.contract || IMMUTABLE_PUBLICATION_PAGE_CONTRACT;
        const immutableIndexBody = frozenImmutableIndex
          ? renderFrozenImmutablePublicationPage(version)
          : renderImmutablePublicationPage({ publication, version });
        const immutableIndexSha256 = sha256Buffer(Buffer.from(immutableIndexBody));
        writeFile(
          archiveOutputPath(version.immutablePath, "index.html"),
          immutableIndexBody,
        );
        const immutableIndexRoute = {
          path: version.immutablePath,
          host: surfaceCanonicalHost("papers"),
          source: source.source,
          routeKind: "version-index",
          immutable: true,
          sha256: immutableIndexSha256,
          mediaType: "text/html",
        };
        version.immutableIndex = {
          contract: immutableIndexContract,
          path: "index.html",
          sha256: immutableIndexSha256,
          mediaType: "text/html",
        };
        renderedRoutes.push(immutableIndexRoute);
        immutableArtifacts.push({
          publication: publication.id,
          version: version.version,
          ...immutableIndexRoute,
        });
      }

      for (const artifact of currentPackageVersion ? version.renderedArtifacts : []) {
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
        immutableIndex: version.immutableIndex,
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
    releaseEvidence: [...releaseEvidenceByPublication.entries()].map(([publication, evidence]) => ({
      publication,
      version: evidence.version,
      sourceSha: evidence.sourceSha,
      lockPath: evidence.lockPath,
      lockSha256: evidence.lockSha256,
      contentSha256: evidence.contentSha256,
      url: evidence.canonicalUrl,
    })),
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
  <meta name="description" content="${escapeAttr(description)}">${immutableArchive ? "" : `
  <meta name="application-name" content="${escapeAttr(BRAND_SIGNATURE)}">
  <meta property="og:site_name" content="${escapeAttr(BRAND_SIGNATURE)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">`}
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/json" title="libkungfu.dev manifest" href="${escapeAttr(preserveRelativeMachineEntries ? "/manifest.json" : pageMachineEntryHref(current, "manifest.json"))}">
  <link rel="alternate" type="text/plain" title="Agent entrypoint" href="${escapeAttr(preserveRelativeMachineEntries ? "/llms.txt" : pageMachineEntryHref(current, "llms.txt"))}">
  <link rel="alternate" type="text/plain" title="Full agent index" href="${escapeAttr(preserveRelativeMachineEntries ? "/llms-full.txt" : pageMachineEntryHref(current, "llms-full.txt"))}">
${alternates}
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f3f7f8;
      --fg: #111820;
      --muted: #53636f;
      --line: #c9d5da;
      --soft: #ffffff;
      --accent: #0b6f68;
      --accent-strong: #07534e;
      --evidence: #2563eb;
      --protocol: #6d4ec5;
      --warn: #9a580b;
      --danger: #b42318;
      --unknown: #5f6f7d;
      --code: #e8eef1;
${current === "core" ? `
      --core-blue: var(--evidence);
      --core-violet: var(--protocol);
      --core-green: var(--accent);
      --core-amber: var(--warn);
      --core-grid: rgb(15 23 42 / 0.08);
` : ""}    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b1115;
        --fg: #edf4f5;
        --muted: #a7b4bc;
        --line: #2a3942;
        --soft: #121a20;
        --accent: #4bd2c4;
        --accent-strong: #8be4da;
        --evidence: #60a5fa;
        --protocol: #a78bfa;
        --warn: #f0b35a;
        --danger: #fb7185;
        --unknown: #94a3b8;
        --code: #0f171d;
${current === "core" ? `
        --core-blue: var(--evidence);
        --core-violet: var(--protocol);
        --core-green: var(--accent);
        --core-amber: var(--warn);
        --core-grid: rgb(226 232 240 / 0.08);
` : ""}      }
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        linear-gradient(color-mix(in srgb, var(--line) 22%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--line) 22%, transparent) 1px, transparent 1px),
        var(--bg);
      background-size: 32px 32px;
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

    .brand {${immutableArchive ? "" : `
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;`}
      color: var(--fg);
      font-weight: 700;
      letter-spacing: 0;
      text-decoration: none;
    }${immutableArchive ? "" : `

    .brand-context {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }

    .brand-context::before {
      content: "·";
      margin-right: 8px;
      color: var(--line);
    }`}

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
      overflow-wrap: anywhere;
    }

    h1 {
      margin: 0;
      max-width: 920px;
      font-size: clamp(40px, 6vw, 72px);
      line-height: 0.98;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    h3 {
      margin: 0 0 8px;
      font-size: 18px;
      line-height: 1.25;
      letter-spacing: 0;
      overflow-wrap: anywhere;
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

    .publication-grid${immutableArchive ? "" : `,
    .publication-featured-grid`} {
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    }
${immutableArchive ? "" : `
    .publication-featured {
      display: grid;
      gap: 18px;
    }

    .publication-section-heading {
      display: grid;
      grid-template-columns: minmax(0, 0.8fr) minmax(320px, 1.2fr);
      gap: 24px;
      align-items: end;
    }

    .publication-section-heading > div {
      display: grid;
      gap: 8px;
    }

    .publication-section-heading h2 {
      margin: 0;
      font-size: clamp(26px, 3vw, 36px);
    }

    .publication-section-heading > p {
      max-width: 620px;
      justify-self: end;
      font-size: 16px;
    }

    .publication-featured-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .publication-library {
      display: grid;
      gap: 18px;
      margin-top: 52px;
      padding-top: 34px;
      border-top: 1px solid var(--line);
    }

    .publication-section-heading-compact h2 {
      font-size: clamp(22px, 2.4vw, 30px);
    }
`}
    .publication-card {
      display: grid;
      grid-row: span 5;
      grid-template-rows: subgrid;
      gap: 14px;
      align-content: stretch;
    }
${immutableArchive ? "" : `
    .publication-card-featured {
      --publication-focus: var(--accent);
      position: relative;
      overflow: hidden;
      min-height: 390px;
      border-color: color-mix(in srgb, var(--publication-focus) 58%, var(--line));
      border-top: 5px solid var(--publication-focus);
      border-radius: 12px;
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--publication-focus) 18%, transparent), transparent 42%),
        linear-gradient(145deg, color-mix(in srgb, var(--publication-focus) 8%, var(--soft)), var(--soft) 58%);
      padding: clamp(22px, 3vw, 30px);
      box-shadow: 0 18px 42px rgb(15 23 42 / 0.08);
    }

    .publication-card-featured[data-featured="future"] {
      --publication-focus: var(--protocol);
    }

    .publication-card-featured::after {
      position: absolute;
      top: -68px;
      right: -68px;
      width: 156px;
      height: 156px;
      border: 1px solid color-mix(in srgb, var(--publication-focus) 28%, transparent);
      border-radius: 999px;
      content: "";
    }

    .publication-card-featured > * {
      position: relative;
      z-index: 1;
    }

    .publication-card-featured .eyebrow,
    .publication-card-featured .publication-orientation {
      color: color-mix(in srgb, var(--publication-focus) 84%, var(--fg));
    }

    .publication-card-featured h2 {
      max-width: 540px;
      font-size: clamp(25px, 2.7vw, 34px);
    }

    .publication-card-featured h2 a {
      color: var(--fg);
      text-decoration-color: color-mix(in srgb, var(--publication-focus) 45%, transparent);
    }

    .publication-card-heading {
      display: grid;
      gap: 7px;
    }

    .publication-orientation {
      color: var(--fg);
      font-size: 13px;
      font-weight: 700;
    }

    .publication-card-supporting {
      border-top: 2px solid var(--line);
      background: color-mix(in srgb, var(--soft) 92%, var(--bg));
    }
`}
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

    .kfd-reader-orientation {
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 24px;
    }

    .kfd-reader-orientation h1 {
      font-size: clamp(34px, 4.4vw, 56px);
      line-height: 1.02;
    }

    .kfd-homepage-hero {
      display: grid;
      gap: 18px;
      margin-bottom: 28px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 32px;
    }

    .kfd-homepage-hero h1 {
      max-width: 960px;
      margin: 0;
      font-size: clamp(42px, 6vw, 72px);
      line-height: 0.98;
      letter-spacing: -0.04em;
    }

    .kfd-homepage-definition {
      max-width: 900px;
      margin: 0;
      color: var(--fg);
      font-size: clamp(20px, 2.3vw, 28px);
      line-height: 1.34;
    }

    .kfd-continuity-question {
      display: grid;
      max-width: 900px;
      gap: 8px;
      border-left: 4px solid var(--accent);
      padding: 4px 0 4px 16px;
    }

    .kfd-continuity-question h2 {
      margin: 0;
      font-size: clamp(21px, 2.5vw, 30px);
      line-height: 1.25;
    }

    .kfd-adoption-boundary {
      max-width: 900px;
      margin: 0;
      color: var(--muted);
      font-size: 15px;
    }

    .kfd-proof-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 22px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--soft);
      padding: 12px 14px;
    }

    .kfd-proof-group {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
    }

    .kfd-proof-group strong {
      margin-right: 3px;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .kfd-proof-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .kfd-proof-list li {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg);
      padding: 4px 9px;
      color: var(--fg);
      font-size: 12px;
      font-weight: 750;
    }

    .kfd-independent {
      display: grid;
      gap: 18px;
      margin-bottom: 28px;
      border-color: color-mix(in srgb, var(--accent) 58%, var(--line));
      border-top: 5px solid var(--accent);
      background:
        radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 40%),
        var(--soft);
      padding: clamp(20px, 3vw, 30px);
    }

    .kfd-independent h2 {
      max-width: 980px;
      margin: 0;
      font-size: clamp(28px, 3.5vw, 44px);
      line-height: 1.08;
    }

    .kfd-language-list,
    .kfd-independent-steps {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .kfd-language-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .kfd-language-list li {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg);
      padding: 5px 10px;
      color: var(--fg);
      font-size: 13px;
      font-weight: 750;
    }

    .kfd-independent-steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      counter-reset: kfd-independent-step;
    }

    .kfd-independent-step {
      display: grid;
      min-width: 0;
      gap: 10px;
      align-content: start;
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--bg);
      padding: 14px;
    }

    .kfd-independent-step h3 {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
    }

    .kfd-independent-step h3::before {
      counter-increment: kfd-independent-step;
      content: counter(kfd-independent-step, decimal-leading-zero);
      color: var(--accent-strong);
      font: 750 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .kfd-command {
      min-width: 0;
      overflow-x: auto;
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--code);
      padding: 10px;
    }

    .kfd-command code {
      border: 0;
      background: transparent;
      padding: 0;
      overflow-wrap: normal;
      white-space: pre;
    }

    .copy-command {
      width: fit-content;
      border: 1px solid var(--accent);
      border-radius: 999px;
      background: transparent;
      color: var(--accent-strong);
      padding: 5px 10px;
      font: inherit;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }

    .kfd-boundaries {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .kfd-boundaries p {
      border-left: 3px solid var(--warn);
      padding-left: 10px;
      font-size: 13px;
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

    .reader-action.tertiary {
      border-color: var(--line);
      background: transparent;
      color: var(--muted);
    }

    .reader-action.tertiary:hover,
    .reader-action.tertiary:focus-visible {
      border-color: var(--accent);
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

    .kfd-authority-signal {
      display: grid;
      gap: 5px;
      border-left: 3px solid var(--accent);
      padding: 10px 12px;
      background: color-mix(in srgb, var(--soft) 82%, var(--accent) 18%);
    }

    .kfd-authority-signal.strip {
      margin: 18px 0;
      border: 1px solid var(--line);
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      padding: 14px 16px;
    }

    .kfd-content-hero {
      position: relative;
      padding-right: 340px;
    }

    .kfd-authority-signal.hero {
      position: absolute;
      top: 48px;
      right: 0;
      width: 286px;
      border-left: 0;
      border-right: 3px solid var(--accent);
      padding: 10px 12px;
      background: transparent;
      text-align: right;
    }

    .kfd-authority-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .kfd-authority-link {
      font-weight: 750;
      overflow-wrap: anywhere;
    }

    .kfd-authority-projection {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
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
      .grid.three${immutableArchive ? "" : `,
      .publication-featured-grid,
      .publication-section-heading`} {
        grid-template-columns: 1fr;
      }
${immutableArchive ? "" : `

      .publication-section-heading > p {
        justify-self: start;
      }
`}${current === "papers" ? "" : `
      .reader-chain,
      .reader-layer-strip,
      .reader-supply-grid,
      .buildchain-trust-loop,
      .buildchain-value-grid,
      .buildchain-ecosystem-loop {
        grid-template-columns: 1fr;
      }

      .kfd-independent-steps,
      .kfd-boundaries {
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

      .kfd-content-hero {
        padding-right: 0;
      }

      .kfd-authority-signal.hero {
        position: static;
        width: auto;
        border-right: 0;
        border-left: 3px solid var(--accent);
        margin-top: 2px;
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
      .publication-grid${immutableArchive ? "" : `,
      .publication-featured-grid`} {
        grid-template-rows: none;
      }

      .publication-card {
        grid-row: auto;
        grid-template-rows: none;
      }
${immutableArchive ? "" : `

      .publication-card-featured {
        min-height: 0;
      }
`}
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
${immutableArchive
  ? `      <a class="brand" ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">libkungfu.dev</a>`
  : `      <a class="brand" ${surfaceLinkAttrs("hub")} aria-label="${escapeAttr(BRAND_SIGNATURE)} — ${escapeAttr(BRAND_CONTEXT)}; back to libkungfu.dev home"><span>${escapeHtml(BRAND_SIGNATURE)}</span><span class="brand-context">${escapeHtml(BRAND_CONTEXT)}</span></a>`}
      <nav aria-label="Primary">${navHtml}${mainSiteHtml}</nav>
    </div>
  </header>
  <main>${body}</main>
  <footer>
    <div>
      <p>&copy; 2026 Kungfu Origin Technology Limited.</p>${immutableArchive ? "" : `
      <p>${escapeHtml(BRAND_SIGNATURE)} is a trademark of Kungfu Origin Technology Limited.</p>`}
      <p>Open developer and agent substrate hub. Facts come from upstream packages and pinned release artifacts.</p>
      <p>Open-source components are governed by their repository and package licenses. Public collaboration starts on <a href="https://github.com/kungfu-systems">kungfu-systems on GitHub</a>.</p>
    </div>
  </footer>
  <script>
    (() => {
      const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
      if (localHosts.has(window.location.hostname)) {
        for (const link of document.querySelectorAll("[data-local-href]")) {
          link.setAttribute("href", link.getAttribute("data-local-href"));
        }
      }
      for (const button of document.querySelectorAll("[data-copy-command]")) {
        button.addEventListener("click", async () => {
          const command = button.parentElement?.querySelector("code")?.textContent || "";
          if (!command || !navigator.clipboard) return;
          await navigator.clipboard.writeText(command);
          button.textContent = "Copied";
        });
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

function dogfoodLiveProjectionScript(embeddedEvidence) {
  return `<script>
  (() => {
    const number = new Intl.NumberFormat("en-US");
    const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    const latestUrl = "/dogfood-evidence.json";
    const cache = new Map();
    let latestEvidence;
    let timeline = [];
    const status = (message) => setText("dogfood-history-status", message);
    const projection = new URL(window.location.href).searchParams.get("projection");
    const parentOrigin = (() => {
      try { return new URL(document.referrer).origin; } catch { return ""; }
    })();
    const trustedProjectionOrigin = parentOrigin === "https://kungfu.tech"
      || parentOrigin === "https://staging.kungfu.tech"
      || /^https:\\/\\/[a-z0-9-]+\\.preview\\.kungfu\\.tech$/.test(parentOrigin);
    const bridgeEnabled = projection === "kungfu-tech" && window.parent !== window && trustedProjectionOrigin;
    const postProjection = (message) => {
      if (bridgeEnabled) window.parent.postMessage(message, parentOrigin);
    };
    const validate = (evidence, expectedId) => {
      if (!evidence || !["kungfu.public-dogfood-evidence/v1", "kungfu.public-dogfood-evidence/v2"].includes(evidence.schema)) throw new Error("unsupported evidence schema");
      if (!evidence.snapshotId || !evidence.observation || !evidence.metrics || !Array.isArray(evidence.repositories)) throw new Error("incomplete evidence snapshot");
      if (expectedId && evidence.snapshotId !== expectedId) throw new Error("snapshot id mismatch");
      return evidence;
    };
    const embeddedEvidence = validate(${JSON.stringify(embeddedEvidence).replaceAll("<", "\\u003c")});
    const sha256 = async (bytes) => {
      if (!window.crypto || !window.crypto.subtle) return null;
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    };
    const load = async (entry) => {
      if (cache.has(entry.snapshotId)) return cache.get(entry.snapshotId);
      const promise = (async () => {
        const fetchUrl = entry.current ? latestUrl : new URL(entry.url, window.location.href).pathname;
        const response = await fetch(fetchUrl, { cache: entry.current ? "no-store" : "force-cache" });
        if (!response.ok) throw new Error("evidence fetch failed: " + response.status);
        const bytes = await response.arrayBuffer();
        const digest = entry.sha256 ? await sha256(bytes) : null;
        if (digest && digest !== entry.sha256) throw new Error("snapshot sha256 mismatch");
        return validate(JSON.parse(new TextDecoder().decode(bytes)), entry.snapshotId);
      })();
      cache.set(entry.snapshotId, promise);
      try { return await promise; } catch (error) { cache.delete(entry.snapshotId); throw error; }
    };
    const render = (evidence, entry) => {
      document.documentElement.dataset.dogfoodSnapshot = evidence.snapshotId;
      setText("dogfood-state", entry.current ? "public dogfood / latest observed" : "public dogfood / archived observation");
      setText("dogfood-window-start", evidence.observation.window.startInclusive);
      setText("dogfood-window-end", evidence.observation.window.endInclusive);
      setText("dogfood-pr-total", number.format(evidence.metrics.mergedPublicPullRequests.value));
      setText("dogfood-pr-caption", evidence.metrics.mergedPublicPullRequests.label + " across " + number.format(evidence.metrics.repositoriesWithMergedPullRequests.value) + " repositories");
      const hero = document.getElementById("dogfood-hero-number");
      if (hero) hero.setAttribute("aria-label", number.format(evidence.metrics.mergedPublicPullRequests.value) + " merged public pull requests in the observed window");
      setText("dogfood-observed-at", evidence.observation.observedAt);
      setText("dogfood-query", evidence.sources.github.baseQuery);
      setText("dogfood-generated-at", evidence.provenance?.generatedAt || "legacy snapshot; generation timestamp was not recorded");
      setText("dogfood-snapshot-kind", entry.generationKind + (entry.offCadence ? " / off cadence" : ""));
      const machine = document.getElementById("dogfood-machine-route");
      if (machine) { machine.href = entry.url; machine.textContent = entry.current ? latestUrl : new URL(entry.url, window.location.href).pathname; }
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
    const signed = (value) => value > 0 ? "+" + number.format(value) : number.format(value);
    const renderComparison = (current, previous) => {
      const body = document.getElementById("dogfood-comparison-body");
      const heading = document.getElementById("dogfood-comparison-heading");
      if (!body || !heading) return;
      if (previous === undefined) {
        heading.textContent = "Adjacent observation comparison";
        body.innerHTML = '<tr><th scope="row">History</th><td colspan="3">Choose a retained snapshot to compare adjacent observations.</td></tr>';
        return;
      }
      if (!previous) {
        heading.textContent = "First retained observation point";
        body.replaceChildren();
        return;
      }
      heading.textContent = "Change from " + previous.observation.observedAt + " to " + current.observation.observedAt;
      const metrics = [
        ["mergedPublicPullRequests", "Merged public PR search matches"],
        ["repositoriesWithMergedPullRequests", "Repositories with merged PRs"],
        ["reviewSearchMatches", "Reviewed-by search matches"],
        ["retainedPublicProjectCuts", "Retained public Project Cuts"],
        ["projectCutTitleMatches", "Project Cut title matches"],
      ];
      body.replaceChildren(...metrics.map(([key, label]) => {
        const before = previous.metrics[key].value;
        const after = current.metrics[key].value;
        const row = document.createElement("tr");
        for (const value of [label, number.format(before), number.format(after), signed(after - before)]) {
          const cell = document.createElement(value === label ? "th" : "td");
          if (value === label) cell.scope = "row";
          cell.textContent = value;
          row.append(cell);
        }
        return row;
      }));
    };
    const selectSnapshot = async (snapshotId, updateUrl, fallbackStatus, comparePrevious = true) => {
      const entry = timeline.find((candidate) => candidate.snapshotId === snapshotId);
      if (!entry) {
        return selectSnapshot(timeline.at(-1).snapshotId, false, "Unknown snapshot id; showing the latest verified observation.");
      }
      const index = timeline.indexOf(entry);
      try {
        const [evidence, previous] = await Promise.all([
          entry.current ? Promise.resolve(latestEvidence) : load(entry),
          index > 0 && comparePrevious ? load(timeline[index - 1]) : Promise.resolve(index > 0 ? undefined : null),
        ]);
        render(evidence, entry);
        renderComparison(evidence, previous);
        const selector = document.getElementById("dogfood-snapshot-select");
        if (selector) selector.value = entry.snapshotId;
        const previousButton = document.getElementById("dogfood-previous");
        const nextButton = document.getElementById("dogfood-next");
        if (previousButton) previousButton.disabled = index === 0;
        if (nextButton) nextButton.disabled = index === timeline.length - 1;
        document.body.dataset.dogfoodTimelineIndex = String(index);
        if (updateUrl) {
          const url = new URL(window.location.href);
          if (entry.current) url.searchParams.delete("snapshot"); else url.searchParams.set("snapshot", entry.snapshotId);
          window.history.pushState({ snapshotId: entry.snapshotId }, "", url);
        }
        status(fallbackStatus || ((entry.current ? "Showing latest observation: " : "Showing archived observation: ") + entry.observedAt + ". Adjacent deltas compare overlapping P30D windows."));
      } catch (error) {
        if (!entry.current) {
          return selectSnapshot(timeline.at(-1).snapshotId, false, "The requested snapshot failed integrity or schema validation; showing the latest verified observation.", false);
        }
        throw error;
      }
    };
    const move = (offset) => {
      const index = Number(document.body.dataset.dogfoodTimelineIndex || timeline.length - 1);
      const target = timeline[index + offset];
      if (target) selectSnapshot(target.snapshotId, true);
    };
    const initialize = async (evidence, sourceStatus) => {
        latestEvidence = validate(evidence);
        const current = {
          snapshotId: evidence.snapshotId,
          observedAt: evidence.observation.observedAt,
          generatedAt: evidence.provenance?.generatedAt || evidence.observation.observedAt,
          generationKind: evidence.provenance?.generationKind || "legacy",
          backfill: evidence.provenance?.backfill === true,
          offCadence: evidence.provenance ? false : true,
          url: latestUrl,
          sha256: null,
          previousSnapshotId: evidence.history?.previousSnapshotId || null,
          current: true,
        };
        timeline = [...(evidence.history?.entries || []), current].sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
        cache.set(current.snapshotId, Promise.resolve(evidence));
        const postTimeline = () => postProjection({
          type: "kungfu.dogfood.timeline/v1",
          timeline,
          evidence,
        });
        postTimeline();
        if (bridgeEnabled) {
          window.addEventListener("message", async (event) => {
            if (event.origin !== parentOrigin || event.source !== window.parent) return;
            if (event.data?.type === "kungfu.dogfood.timeline.request/v1") {
              postTimeline();
              return;
            }
            if (event.data?.type !== "kungfu.dogfood.snapshot.request/v1") return;
            const requestId = String(event.data.requestId || "");
            const entry = timeline.find((candidate) => candidate.snapshotId === event.data.snapshotId);
            if (!requestId || !entry) {
              postProjection({
                type: "kungfu.dogfood.snapshot.response/v1",
                requestId,
                error: "unknown snapshot id",
              });
              return;
            }
            try {
              const selectedEvidence = entry.current ? evidence : await load(entry);
              postProjection({
                type: "kungfu.dogfood.snapshot.response/v1",
                requestId,
                entry,
                evidence: selectedEvidence,
              });
            } catch {
              postProjection({
                type: "kungfu.dogfood.snapshot.response/v1",
                requestId,
                error: "snapshot integrity or schema validation failed",
              });
            }
          });
        }
        const selector = document.getElementById("dogfood-snapshot-select");
        if (selector) {
          selector.replaceChildren(...timeline.map((entry) => {
            const option = document.createElement("option");
            option.value = entry.snapshotId;
            option.textContent = entry.observedAt + " · " + (entry.current ? "latest" : entry.generationKind) + (entry.offCadence ? " · off cadence" : "");
            return option;
          }));
          selector.addEventListener("change", () => selectSnapshot(selector.value, true));
        }
        document.getElementById("dogfood-previous")?.addEventListener("click", () => move(-1));
        document.getElementById("dogfood-next")?.addEventListener("click", () => move(1));
        window.addEventListener("popstate", () => {
          const requested = new URL(window.location.href).searchParams.get("snapshot");
          selectSnapshot(requested || timeline.at(-1).snapshotId, false);
        });
        const requested = new URL(window.location.href).searchParams.get("snapshot");
        await selectSnapshot(
          requested || current.snapshotId,
          false,
          sourceStatus === "embedded"
            ? "Showing the latest observation embedded and verified when this site artifact was built."
            : undefined,
          false,
        );
    };
    (async () => {
      let evidence = embeddedEvidence;
      let sourceStatus = "embedded";
      try {
        const response = await fetch(latestUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("evidence fetch failed");
        const fetched = validate(await response.json());
        if (Date.parse(fetched.observation.observedAt) >= Date.parse(embeddedEvidence.observation.observedAt)) {
          evidence = fetched;
          sourceStatus = "live";
        }
      } catch {
        // The build-embedded snapshot remains a complete no-network projection.
      }
      await initialize(evidence, sourceStatus);
    })().catch(() => {
      setText("dogfood-state", "public dogfood / embedded observation");
      status("The interactive history is unavailable; the verified build-embedded observation remains readable.");
    });
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

function kfdDecisionNav(currentEntry, currentPage = "decision", currentCandidate, currentCandidateFormal, currentLiveCase) {
  const currentNumber = currentEntry ? String(currentEntry.number) : undefined;
  const standaloneNavLink = (pageId) => {
    const pageEntry = kfdStandalonePages.find((entry) => entry.id === pageId);
    if (!pageEntry) return "";
    return `<a href="${escapeAttr(`${pageEntry.url.replace(/\/+$/, "")}/`)}"${currentPage === `standalone:${pageEntry.id}` ? ' aria-current="page"' : ""}>${escapeHtml(pageEntry.rendering?.navigationLabel || pageEntry.title)}</a>`;
  };
  const candidateLinks = currentCandidate
    ? [
        `<a class="doc-nav-child" href="${escapeAttr(currentCandidate.url)}"${currentPage === "candidate" ? ' aria-current="page"' : ""}>${escapeHtml(currentCandidate.title)}</a>`,
        currentPage === "candidate-formal" && currentCandidateFormal
          ? `<a class="doc-nav-child" style="margin-left: 28px;" href="${escapeAttr(currentCandidateFormal.url)}" aria-current="page">Formal candidate</a>`
          : "",
      ].join("")
    : "";
  const liveCaseLinks = kfdLiveCases
    .map((entry) => `<a class="doc-nav-child" href="${escapeAttr(kfdLiveCasePath(entry))}"${currentPage === "live-case" && currentLiveCase?.id === entry.id ? ' aria-current="page"' : ""}>${escapeHtml(entry.title)}</a>`)
    .join("");
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
      <p class="doc-nav-heading">Orientation</p>
      <a ${surfaceLinkAttrs("kfd")}>Overview</a>
      <a href="${escapeAttr(kfdFoundationPath)}"${currentPage === "foundation" ? ' aria-current="page"' : ""}>Foundation model</a>
    </div>
    <div class="doc-nav-group">
      <p class="doc-nav-heading">Numbered authority</p>
      ${links}
    </div>
    <div class="doc-nav-group">
      <p class="doc-nav-heading">Implement &amp; verify</p>
      ${standaloneNavLink("independent-verification")}
      <a href="${escapeAttr(kfdAgentHubPath)}"${currentPage === "agent-hub" ? ' aria-current="page"' : ""}>Agent Hub qualification</a>
    </div>
    <div class="doc-nav-group">
      <p class="doc-nav-heading">Governance &amp; evolution</p>
      ${standaloneNavLink("self-conformance")}
      <a href="${escapeAttr(kfdCandidateIndexPath)}"${currentPage === "candidates" ? ' aria-current="page"' : ""}>Candidates</a>
      ${candidateLinks}
    </div>
    <div class="doc-nav-group">
      <p class="doc-nav-heading">Evidence &amp; reference</p>
      ${standaloneNavLink("load-bearing-dogfood")}
      <a href="${escapeAttr(kfdFormalModelPath)}"${currentPage === "formal-model" ? ' aria-current="page"' : ""}>Formal model</a>
      <a href="${escapeAttr(kfdTerminologyPath)}"${currentPage === "terminology" ? ' aria-current="page"' : ""}>Terminology</a>
      <a href="${escapeAttr(kfdCasesPath)}"${currentPage === "cases" ? ' aria-current="page"' : ""}>Historical cases</a>
      <p class="doc-nav-heading">Live cases</p>
      ${liveCaseLinks}
    </div>
  </nav>`;
}

const site = readFixtureJson("site-manifest.json");
const coreSiteApi = require("@kungfu-tech/site");
const coreBundleVerification = coreSiteApi.verifyBundle();
const coreBundle = readPackageJson("@kungfu-tech/site/site-bundle.json");
const coreAgentIndex = readPackageJson("@kungfu-tech/site/agent-index.json");
const coreAdrMap = readPackageJson("@kungfu-tech/site/adr-map.json");
const coreBundleSchema = readPackageText("@kungfu-tech/site/schema");
const corePackage = readPackageJson("@kungfu-tech/site/package.json");
const coreFormatManifest = coreSiteApi.loadFormatAuthorityManifest();
const coreFormatRoutes = Object.fromEntries(
  Object.keys(coreBundle.formatAuthority?.routes || {}).map((routeId) => [
    routeId,
    coreSiteApi.loadFormatAuthorityRoute(routeId),
  ]),
);
const runtimeSurface = readFixtureJson("libkungfu-runtime-surface.json");
const dogfoodRenderInputPath = path.join(repoRoot, ".buildchain", "render-inputs", "dogfood-evidence.json");
const dogfoodRenderSourcePath = path.join(repoRoot, ".buildchain", "render-inputs", "dogfood-evidence-source.json");
const dogfoodEvidence = readOptionalJsonFile(dogfoodRenderInputPath) || readFixtureJson("dogfood-evidence.json");
const dogfoodEvidenceSource = readOptionalJsonFile(dogfoodRenderSourcePath) || {
  selection: "retained-fixture",
  source: "src/fixtures/dogfood-evidence.json",
  immutableUrl: null,
  snapshotId: dogfoodEvidence.snapshotId,
  observedAt: dogfoodEvidence.observation.observedAt,
  sha256: crypto.createHash("sha256").update(JSON.stringify(dogfoodEvidence)).digest("hex"),
};
const dogfoodRelatedInterpretation = site.relatedInterpretations.dogfoodBootstrap;
const buildchainSite = readPackageJson("@kungfu-tech/buildchain/site/buildchain-site.json");
const buildchainSurfaceManifest = readPackageJson("@kungfu-tech/buildchain/site/site-manifest.json");
const buildchainHomepageCopy = normalizeBuildchainHomepageCopy(buildchainSite.homepage, buildchainSite.pages);
const buildchainPackage = readPackageJson("@kungfu-tech/buildchain/package.json");
const buildchainCli = readPackageJson("@kungfu-tech/buildchain/site/cli-registry.json");
const buildchainWorkflow = readPackageJson("@kungfu-tech/buildchain/site/workflow-registry.json");
const buildchainReleaseModel = readPackageJson("@kungfu-tech/buildchain/site/release-model.json");
const buildchainArtifactSchemas = readPackageJson("@kungfu-tech/buildchain/site/artifact-schemas.json");
const buildchainProductMechanism = readPackageJson("@kungfu-tech/buildchain/site/product-mechanism.json");
const buildchainReleaseProvenance = readPackageJson("@kungfu-tech/buildchain/site/release-provenance.json");
const buildchainAgentIndex = readPackageJson("@kungfu-tech/buildchain/site/agent-index.json");
const whitePaperPackageRoot = packageRoot("@kungfu-tech/paper-kungfu-product-white-paper");
const whitePaperEvidence = readPublicationPackageJson(
  "@kungfu-tech/paper-kungfu-product-white-paper",
  "site/evidence-site.json",
);
const agentSupplyChainSnapshotPackage = "@kungfu-tech/paper-kungfu-product-white-paper-agent-supply-chain";
const agentSupplyChainSnapshotVersion = "0.1.0-alpha.10";
const agentSupplyChainSnapshotRoot = packageRoot(agentSupplyChainSnapshotPackage);
const agentSupplyChainSnapshotInfo = readJsonFile(path.join(agentSupplyChainSnapshotRoot, "package.json"));
const agentSupplyChainSnapshotEvidence = readJsonFile(path.join(agentSupplyChainSnapshotRoot, "site", "evidence-site.json"));
const agentSupplyChain = agentSupplyChainSnapshotEvidence.agentSupplyChain;
const kfdSite = readPackageJson("@kungfu-tech/kfd/site/kfd-site.json");
const kfdPackage = readPackageJson("@kungfu-tech/kfd/package.json");
const kfdActivationContracts = readPackageJson("@kungfu-tech/kfd/activation-contracts.json");
const kfdActivationSchemas = Object.values(kfdActivationContracts.interfaces).map((entry) => ({
  ...entry,
  body: readPackageJson(`@kungfu-tech/kfd/${entry.schemaPath}`),
}));
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
const kfdPublicFactSource = kfdSite.decisionPages?.metadata?.publicFactSource;

if (
  kfdPublicFactSource?.kind !== "git-repository"
  || kfdPublicFactSource?.repository !== "kungfu-systems/kfd"
  || kfdPublicFactSource?.url !== kfdSourceRepository
) {
  throw new Error("KFD package must declare the canonical kungfu-systems/kfd public fact source");
}

function kfdAuthoritySignal({ sourcePath = "", variant = "strip", projectionLabel = "Rendered projection" } = {}) {
  const sourceHref = sourcePath ? kfdSourceHref(sourcePath) : kfdPublicFactSource.url;
  const sourceLabel = sourcePath
    ? `GitHub · ${sourcePath}`
    : `GitHub · ${kfdPublicFactSource.repository}`;
  const pinnedLabel = /^[0-9a-f]{40}$/u.test(kfdSourceRef)
    ? kfdSourceRef.slice(0, 8)
    : kfdSourceRef;
  const pinnedHref = `${kfdPublicFactSource.url}/tree/${encodeURIComponent(kfdSourceRef)}`;

  return `<div class="kfd-authority-signal ${escapeAttr(variant)}" data-kfd-authority-signal="canonical-fact-source">
    <span class="kfd-authority-label">Canonical source</span>
    <a class="kfd-authority-link" href="${escapeAttr(sourceHref)}">${escapeHtml(sourceLabel)} ↗</a>
    <span class="kfd-authority-projection">${escapeHtml(projectionLabel)} · <a href="${escapeAttr(pinnedHref)}">pinned ${escapeHtml(pinnedLabel)}</a></span>
  </div>`;
}
const expectedBuildchainVersion = "3.0.6-alpha.0";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.41";
const expectedCoreSiteVersion = "4.0.0-alpha.1";
const buildchainLock = readPnpmLockPackage("@kungfu-tech/buildchain", expectedBuildchainVersion);
const kfdLock = readPnpmLockPackage("@kungfu-tech/kfd", expectedKfdVersion);
const coreSiteLock = readPnpmLockPackage("@kungfu-tech/site", expectedCoreSiteVersion);
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
if (
  buildchainSurfaceManifest.contract !== "kungfu-buildchain-site-manifest"
  || buildchainSurfaceManifest.package?.name !== buildchainPackage.name
  || buildchainSurfaceManifest.package?.version !== buildchainPackage.version
) {
  throw new Error("unexpected Buildchain surface manifest authority");
}
if (kfdSite.contract !== "kfd-site-bundle") {
  throw new Error("unexpected KFD site bundle contract");
}
if (
  agentSupplyChainSnapshotInfo.name !== "@kungfu-tech/paper-kungfu-product-white-paper"
  || agentSupplyChainSnapshotInfo.version !== agentSupplyChainSnapshotVersion
  || agentSupplyChainSnapshotEvidence.source?.packageVersion !== agentSupplyChainSnapshotVersion
  || whitePaperEvidence.source?.packageVersion !== "0.1.0-alpha.13"
  || Object.hasOwn(whitePaperEvidence, "agentSupplyChain")
  || agentSupplyChain?.contract !== "kungfu-agent-supply-chain-public-narrative/v1"
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
  corePackage.version !== expectedCoreSiteVersion
  || coreBundle.package?.name !== "@kungfu-tech/site"
  || coreBundle.package?.version !== expectedCoreSiteVersion
  || coreBundle.contract !== "kungfu.site-bundle/v1"
  || coreBundle.schemaVersion !== 1
  || coreBundle.surfaces?.length !== 11
  || coreBundle.sources?.length < 1
  || coreAgentIndex.bundleContentRoot !== coreBundle.contentRoot
  || coreBundle.adrMap?.contentRoot !== sha256Buffer(Buffer.from(`${JSON.stringify(coreAdrMap, null, 2)}\n`))
  || coreAdrMap.summary?.records !== coreAdrMap.records?.length
  || !coreBundle.contentRoot
  || !coreBundle.sourceRoot
  || !coreSiteLock.integrity
  || coreBundleVerification.status !== "passing"
  || coreBundleVerification.contentRoot !== coreBundle.contentRoot
  || coreBundleVerification.format?.manifestRoot !== coreBundle.formatAuthority?.pickup?.manifestRoot
  || coreFormatManifest.normative?.root !== coreBundle.formatAuthority?.normativeRoot
  || Object.keys(coreFormatRoutes).join(",") !== "overview,readerContract,versionMatrix,registry,vectors"
) {
  throw new Error("unexpected @kungfu-tech/site product bundle");
}
const coreSurfaceById = new Map(coreBundle.surfaces.map((surface) => [surface.id, surface]));
const coreSourceById = new Map(coreBundle.sources.map((source) => [source.id, source]));
const coreRuntimeSurface = coreSurfaceById.get("runtime");
const coreRuntimePresentation = coreRuntimeSurface?.presentation;
if (!coreRuntimePresentation?.architecture?.journal || !Array.isArray(coreRuntimePresentation.outcomes)) {
  throw new Error("@kungfu-tech/site runtime surface is missing its presentation projection");
}
const coreRepository = coreBundle.source.repository.replace(/\.git$/, "");
const core = {
  sourceRepository: coreRepository,
  sourceRef: coreBundle.source.revision,
  homepage: {
    kicker: coreRuntimePresentation.kicker,
    headline: coreRuntimeSurface.headline,
    lead: coreRuntimeSurface.summary,
    claimBoundary: coreRuntimeSurface.knownLimits.join(" "),
  },
  architecture: coreRuntimePresentation.architecture,
  outcomes: coreRuntimePresentation.outcomes,
  semanticBoundary: coreRuntimePresentation.semanticBoundary,
  frontiers: coreRuntimePresentation.frontiers,
  qualificationBoundary: {
    heading: "Qualified runtime boundary",
    claims: coreRuntimePresentation.qualificationClaims,
  },
  evidence: coreRuntimeSurface.sourceIds.map((sourceId) => {
    const source = coreSourceById.get(sourceId);
    if (!source) {
      throw new Error(`runtime surface references missing source ${sourceId}`);
    }
    return {
      label: source.path,
      status: source.role,
      sourcePath: source.path,
      sourceUrl: source.url,
    };
  }),
  sourceContract: {
    heading: "Pinned product bundle",
    summary: "The runtime page is rendered from the exact @kungfu-tech/site package consumed by this deployment.",
    package: `${corePackage.name}@${corePackage.version}`,
    currentSpec: {
      specVersion: coreBundle.contract,
      docsUrl: surfaceEndpointHref("core", "site-bundle.json"),
    },
    sections: coreBundle.adoptionLayers.map((layer) => ({
      title: layer.label,
      summary: `${layer.job} Maturity: ${layer.maturity}.`,
    })),
    machineFields: Object.keys(coreBundle),
  },
};
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
    "buildchain.upstreams/paper-*.release.json",
    "src/upstream-release-evidence/**/buildchain.release.json",
    "resolved dogfood immutable snapshot URL and SHA-256",
    "pnpm-lock.yaml",
    "@kungfu-tech/buildchain package content",
    "@kungfu-tech/kfd package content",
    "@kungfu-tech/site package content",
    "declared @kungfu-tech/paper-* package content",
  ],
  artifactDigestScope: "site dist manifest JSON files",
});
const buildchainBadgeEndpoints = renderBuildchainBadgeEndpoints();
const publicationArchives = renderPublicationArchives();
const productionStatus = {
  schemaVersion: 1,
  contract: "kungfu-buildchain-web-surface-production-status",
  ...surfaceTimestampPolicy,
  channel: (process.env.SITE_SURFACE_CHANNEL || process.env.BUILDCHAIN_SURFACE_CHANNEL || "production").trim(),
  repository: "kungfu-systems/site-libkungfu-dev",
  revision: surfaceTimestampPolicy.sourceRevision,
  releaseEvidence: publicationArchives.releaseEvidence,
};
writeFile(".well-known/kungfu-release-status.json", `${JSON.stringify(productionStatus, null, 2)}\n`);
writeFile("papers/.well-known/kungfu-release-status.json", `${JSON.stringify(productionStatus, null, 2)}\n`);
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
const kfdStandalonePages = (kfdSite.standalonePages || [])
  .slice()
  .sort((left, right) => (left.rendering?.navigationOrder || 0) - (right.rendering?.navigationOrder || 0));
const kfdIndependentVerificationPage = kfdStandalonePages.find(
  (entry) => entry.id === "independent-verification",
);
const kfdSelfConformancePage = kfdStandalonePages.find(
  (entry) => entry.id === "self-conformance",
);
const kfdLiveCases = kfdSite.liveCases?.cases || [];
const kfdLiveCasePath = (entry) => `${entry.url.replace(/\/+$/, "")}/`;
const kfdLiveCaseDocumentKeys = [
  "humanEntry",
  "genesis",
  "methodTrace",
  "ontologySplit",
  "distinguishabilityArgument",
  "propagationHypothesis",
  "reviewIndex",
  "developmentLineage",
];
const kfdLiveCaseDocuments = (entry) => kfdLiveCaseDocumentKeys
  .map((key) => entry[key])
  .filter((document) => document?.path && typeof document.markdown === "string");
const kfdCandidateEntriesByLiveCaseId = new Map(kfdLiveCases.map((entry) => [
  entry.id,
  kfdCandidateRegistry.candidates.filter((candidate) => (
    candidate.sourceCases || []
  ).some((sourceCase) => sourceCase.id === entry.id)),
]));
const kfdCandidatePagesByLiveCaseId = new Map(kfdLiveCases.map((entry) => [
  entry.id,
  (kfdCandidateEntriesByLiveCaseId.get(entry.id) || [])
    .map((candidate) => kfdCandidatePageById.get(candidate.id))
    .filter(Boolean),
]));
const kfdPackageRoot = packageRoot("@kungfu-tech/kfd");
const kfdStandaloneMachineAssets = kfdStandalonePages.flatMap((pageEntry) =>
  (pageEntry.machineAssets || []).map((entry) => ({ ...entry, pageId: pageEntry.id })),
).map((entry) => {
  const sourcePath = path.posix.normalize(entry.sourcePath || "");
  const outputPath = path.posix.normalize(String(entry.url || "").replace(/^\/+/, ""));
  if (
    !sourcePath
    || sourcePath !== entry.sourcePath
    || sourcePath.startsWith("../")
    || !outputPath
    || outputPath.startsWith("../")
    || `/${outputPath}` !== entry.url
  ) {
    throw new Error(`Invalid KFD standalone machine asset: ${entry.sourcePath || entry.url}`);
  }
  const content = fs.readFileSync(path.join(kfdPackageRoot, sourcePath));
  if (sha256Buffer(content) !== entry.digest) {
    throw new Error(`KFD standalone machine asset digest drifted: ${sourcePath}`);
  }
  return { ...entry, outputPath, content };
});
const kfdIndependentVerificationAssets = kfdStandaloneMachineAssets.filter(
  (entry) => entry.pageId === kfdIndependentVerificationPage?.id,
);
const kfdSelfConformanceAssets = kfdStandaloneMachineAssets.filter(
  (entry) => entry.pageId === kfdSelfConformancePage?.id,
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
const kfdAgentHubPath = `${kfdSite.agentHubPage.url.replace(/\/+$/, "")}/`;
const kfdPageRouteBySourcePath = new Map([
  [kfdSite.agentHubPage.authorityPath, kfdAgentHubPath],
  [kfdSite.agentHubPage.guidePath, kfdAgentHubPath],
  [kfdSite.foundationPage.sourcePath, kfdFoundationPath],
  [kfdSite.formalPage.sourcePath, kfdFormalModelPath],
  [kfdSite.terminologyPage.sourcePath, kfdTerminologyPath],
  [kfdSite.casesPage.sourcePath, kfdCasesPath],
  [kfdSite.activationContracts.source, "/activation-contracts.json"],
  ...kfdActivationSchemas.map((entry) => [entry.schemaPath, `/${entry.schemaPath}`]),
  ...kfdStandalonePages.map((pageEntry) => [
    pageEntry.sourcePath,
    `${pageEntry.url.replace(/\/+$/, "")}/`,
  ]),
  ...kfdStandaloneMachineAssets.map((entry) => [entry.sourcePath, `/${entry.outputPath}`]),
  ...kfdLiveCases.flatMap((liveCase) => kfdLiveCaseDocuments(liveCase)
    .map((entry) => [entry.path, kfdLiveCasePath(liveCase)])),
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

function kfdHomepageHero() {
  const futurePicture = kfdSite.homepage.futurePicture || {};
  const question = futurePicture.question
    || futurePicture.pastToFuture
    || kfdSite.homepage.lead;
  const engineeringAnswer = futurePicture.engineeringAnswer
    || futurePicture.kungfuPath;
  const claimBoundary = futurePicture.claimBoundary;
  const definition = engineeringAnswer?.match(/^.*?\.(?:\s|$)/u)?.[0]?.trim();
  const foundingBoundary = claimBoundary?.match(/Kungfu is[^.]*\./u)?.[0];
  const proofSteps = kfdSite.homepage.independentImplementation.steps
    .filter((entry) => entry.id === "test" || entry.id === "verify");
  const publicFactSource = kfdPublicFactSource;
  const authorityAction = kfdSite.homepage.authorityAction || {
    id: "canonical-source",
    label: "Canonical source on GitHub",
    url: publicFactSource?.url,
    relationship: "canonical-fact-source",
    source: "decisionPages.metadata.publicFactSource",
    external: true,
  };

  if (
    !definition
    || !foundingBoundary
    || proofSteps.length !== 2
    || publicFactSource?.kind !== "git-repository"
    || publicFactSource?.repository !== "kungfu-systems/kfd"
    || authorityAction.id !== "canonical-source"
    || authorityAction.label !== "Canonical source on GitHub"
    || authorityAction.url !== publicFactSource.url
    || authorityAction.relationship !== "canonical-fact-source"
    || authorityAction.source !== "decisionPages.metadata.publicFactSource"
    || authorityAction.external !== true
  ) {
    throw new Error("KFD package must expose the concise definition, founding boundary, proof steps, and canonical fact-source action");
  }

  return `<section class="hero kfd-homepage-hero" id="kfd-authority" data-reader-surface="kfd">
    <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("hub")} aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a><span class="page-kicker-state">Kung Fu Decisions</span></p>
    <h1>${escapeHtml(kfdSite.homepage.title)}</h1>
    <p class="kfd-homepage-definition" data-kfd-homepage-definition>${escapeHtml(definition)}</p>
    <div class="kfd-continuity-question">
      <p class="eyebrow">${escapeHtml(futurePicture.heading || "Core question")}</p>
      <h2 data-kfd-future-picture="question">${inlineMarkdown(question)}</h2>
    </div>
    <p class="kfd-adoption-boundary" data-kfd-founding-boundary>${escapeHtml(foundingBoundary)}</p>
    <div class="reader-actions" aria-label="KFD homepage reading paths">
      <a class="reader-action" href="#foundation-triad">Understand KFD</a>
      <a class="reader-action secondary" href="#independent-implementation">Implement without Kungfu</a>
      <a class="reader-action tertiary" href="${escapeAttr(authorityAction.url)}" data-kfd-authority-action="${escapeAttr(authorityAction.relationship)}">${escapeHtml(authorityAction.label)} ↗</a>
    </div>
    <div class="kfd-proof-strip" aria-label="Independent implementation proof strip">
      <div class="kfd-proof-group">
        <strong>Supported adapters</strong>
        <ul class="kfd-proof-list" aria-label="Supported adapter languages in the proof strip">
          ${kfdSite.homepage.independentImplementation.supportedLanguages.map((entry) => `<li data-kfd-proof-language="${escapeAttr(entry.id)}">${escapeHtml(entry.label)}</li>`).join("\n")}
        </ul>
      </div>
      <div class="kfd-proof-group">
        <strong>Proof path</strong>
        <ol class="kfd-proof-list" aria-label="Test and offline verification proof steps">
          ${proofSteps.map((entry) => `<li data-kfd-proof-step="${escapeAttr(entry.id)}">${escapeHtml(entry.label)}</li>`).join("\n")}
        </ol>
      </div>
    </div>
  </section>`;
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
  const surfaceClass = surfaceId === "kfd" ? " kfd-reader-orientation" : "";
  return `<section class="reader-orientation${surfaceClass}" data-reader-surface="${escapeAttr(surfaceId)}">
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

function kfdIndependentImplementationPanel() {
  const contract = kfdSite.homepage.independentImplementation;
  if (!contract) {
    throw new Error("KFD site bundle must expose homepage.independentImplementation");
  }
  return `<section class="panel kfd-independent" id="independent-implementation" data-kfd-independent-implementation>
    <div>
      <p class="eyebrow">${escapeHtml(contract.label)}</p>
      <h2>${escapeHtml(contract.promise)}</h2>
    </div>
    <ul class="kfd-language-list" aria-label="Supported adapter languages">
      ${contract.supportedLanguages.map((entry) => `<li data-language="${escapeAttr(entry.id)}">${escapeHtml(entry.label)}</li>`).join("\n")}
    </ul>
    <ol class="kfd-independent-steps" aria-label="Scaffold, test, and verify KFD independently">
      ${contract.steps.map((entry) => `<li class="kfd-independent-step" data-independent-step="${escapeAttr(entry.id)}">
        <h3>${escapeHtml(entry.label)}</h3>
        <pre class="kfd-command"><code>${escapeHtml(entry.command)}</code></pre>
        <button class="copy-command" type="button" data-copy-command aria-label="Copy ${escapeAttr(entry.label)} command">Copy command</button>
      </li>`).join("\n")}
    </ol>
    <nav class="card-actions" aria-label="Independent implementation reading paths">
      ${contract.links.map((entry, index) => `<a class="card-action${index > 0 ? " secondary" : ""}" href="${escapeAttr(entry.url)}">${escapeHtml(entry.label)}</a>`).join("\n")}
    </nav>
    <div class="kfd-boundaries" aria-label="Independent implementation claim boundaries">
      <p><strong>Starter boundary.</strong> ${escapeHtml(contract.starterBoundary)}</p>
      <p><strong>Offline boundary.</strong> ${escapeHtml(contract.offlineBoundary)}</p>
      <p><strong>Claim boundary.</strong> ${inlineMarkdown(contract.claimBoundary)}</p>
    </div>
  </section>`;
}

function kfdSelfConformancePanel() {
  const contract = kfdSite.homepage.selfConformance;
  const recursiveCase = kfdSelfConformancePage?.recursiveCase;
  if (!contract || !recursiveCase) {
    throw new Error("KFD site bundle must expose homepage.selfConformance and its recursive case");
  }
  return `<section class="panel" id="self-conformance" data-kfd-self-conformance>
    <p class="eyebrow">${escapeHtml(contract.status)} · governed self-change</p>
    <h2>${escapeHtml(contract.label)}</h2>
    <dl class="meta">
      <dt>Profile</dt><dd><code>${escapeHtml(kfdSelfConformancePage.profile.id)}@${escapeHtml(kfdSelfConformancePage.profile.version)}</code></dd>
      <dt>Candidate</dt><dd><code>${escapeHtml(recursiveCase.candidate.status)}</code> · non-normative · no allocated number</dd>
      <dt>Case</dt><dd><code>${escapeHtml(recursiveCase.liveCase.status)}</code> · <code>${escapeHtml(recursiveCase.liveCase.outcome)}</code></dd>
    </dl>
    <div class="card-actions">
      <a class="card-action" href="${escapeAttr(`${contract.url.replace(/\/+$/, "")}/`)}">Open evidence</a>
      <a class="card-action secondary" href="${escapeAttr(`${recursiveCase.liveCase.url.replace(/\/+$/, "")}/`)}">Closed live case</a>
    </div>
    <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(contract.claimBoundary)}</p>
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

const coreProductStyles = `<style>
  .core-positioning {
    display: grid;
    gap: 18px;
    border-left: 5px solid var(--accent);
  }

  .core-positioning .product-promise {
    max-width: 24ch;
    margin: 0;
    font-size: clamp(28px, 5vw, 58px);
    line-height: 1.02;
  }

  .core-layer-grid,
  .core-surface-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .core-layer-card,
  .core-surface-card {
    display: grid;
    align-content: start;
    gap: 10px;
  }

  .core-layer-card p,
  .core-surface-card p {
    margin: 0;
  }

  .core-layer-index {
    color: var(--accent-strong);
    font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .core-maturity {
    width: fit-content;
  }

  .core-authority-list,
  .core-limit-list {
    display: grid;
    gap: 10px;
  }

  .core-authority-list li {
    overflow-wrap: anywhere;
  }

  .core-format-orientation {
    border-left: 5px solid var(--accent);
  }

  .core-format-orientation h2 {
    max-width: 26ch;
  }

  .core-format-step {
    display: grid;
    align-content: start;
    gap: 10px;
  }

  .core-format-step p {
    margin: 0;
  }

  .core-format-step-index {
    color: var(--accent-strong);
    font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .core-format-technical > summary {
    display: grid;
    gap: 8px;
    cursor: pointer;
    list-style: none;
  }

  .core-format-technical > summary::-webkit-details-marker {
    display: none;
  }

  .core-format-technical > summary::after {
    content: "Open technical details";
    width: fit-content;
    border-bottom: 1px solid currentColor;
    color: var(--accent-strong);
    font-weight: 700;
  }

  .core-format-technical[open] > summary {
    margin-bottom: 24px;
  }

  .core-format-technical[open] > summary::after {
    content: "Close technical details";
  }

  .core-format-technical-body {
    display: grid;
    gap: 24px;
    border-top: 1px solid var(--line);
    padding-top: 24px;
  }

  .core-format-technical:not([open]) > .core-format-technical-body {
    display: none;
  }

  .core-adr-domains {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .core-adr-domain {
    display: grid;
    gap: 5px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px;
    background: var(--soft);
  }

  .core-adr-domain strong {
    font-size: 24px;
  }

  .core-adr-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .core-adr-record {
    display: grid;
    grid-template-columns: minmax(84px, 0.18fr) minmax(0, 1fr);
    gap: 12px;
    border-top: 1px solid var(--line);
    padding: 14px 0;
  }

  .core-adr-record:first-child {
    border-top: 0;
  }

  .core-adr-record code,
  .core-adr-record span {
    overflow-wrap: anywhere;
  }

  @media (max-width: 900px) {
    .core-layer-grid,
    .core-surface-grid,
    .core-adr-domains {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .core-layer-grid,
    .core-surface-grid,
    .core-adr-domains,
    .core-adr-record {
      grid-template-columns: 1fr;
    }
  }
</style>`;

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

  .action-step[data-action-kind="fact"] { border-top-color: var(--evidence); }
  .action-step[data-action-kind="geometry"] { border-top-color: var(--warn); }
  .action-step[data-action-kind="binding"] { border-top-color: var(--protocol); }
  .action-step[data-action-kind="external"] { border-top-color: var(--unknown); }
  .action-step[data-action-kind="episode"] { border-top-color: var(--accent); }
  .action-step[data-action-kind="admission"] { border-top-color: var(--evidence); }

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
    border-left: 2px solid var(--warn);
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
    border-left: 4px solid var(--evidence);
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
    border: 1px solid color-mix(in srgb, var(--protocol) 70%, var(--line));
    border-radius: 10px;
    background: color-mix(in srgb, var(--protocol) 8%, var(--soft));
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
    color: var(--danger);
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

  .dogfood-history {
    display: grid;
    gap: 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--soft);
    padding: clamp(18px, 3vw, 28px);
  }

  .dogfood-history-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: end;
  }

  .dogfood-history-controls label { display: grid; gap: 7px; font-weight: 750; }
  .dogfood-history-controls select {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--bg);
    color: var(--fg);
    padding: 10px 12px;
    font: inherit;
  }

  .dogfood-history-nav { display: flex; gap: 8px; }
  .dogfood-history-nav button {
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--bg);
    color: var(--fg);
    padding: 10px 14px;
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }
  .dogfood-history-nav button:disabled { cursor: not-allowed; opacity: 0.45; }
  .dogfood-history-status { min-height: 1.5em; margin: 0; color: var(--muted); }
  .dogfood-comparison { overflow-x: auto; }
  .dogfood-comparison h3 { margin: 0 0 12px; }
  .dogfood-comparison table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .dogfood-comparison caption { margin-bottom: 10px; color: var(--muted); text-align: left; }
  .dogfood-comparison th,
  .dogfood-comparison td { border-top: 1px solid var(--line); padding: 9px 10px; text-align: right; }
  .dogfood-comparison th:first-child { min-width: 210px; text-align: left; }

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
    .dogfood-history-controls { grid-template-columns: 1fr; }
    .dogfood-history-nav button { flex: 1; }
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

    <section class="panel" id="installed-agent-hub-qualification">
      <p class="eyebrow">${escapeHtml(kfdSite.agentHubPage.status)} KFD adopter profile</p>
      <h2>Verify Agent Hub with the installed Kungfu product</h2>
      <p><code>${escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.run)}</code></p>
      <div class="card-actions">
        <a class="card-action" ${surfaceRouteLinkAttrs("kfd", "agent-hub/")}>Understand the test and verify again</a>
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

function coreSurfaceAuthorities(surface) {
  return surface.sourceIds.map((sourceId) => {
    const source = coreSourceById.get(sourceId);
    if (!source) {
      throw new Error(`Core surface ${surface.id} references missing source ${sourceId}`);
    }
    return source;
  });
}

function coreSurfaceOutputPath(route) {
  const normalized = route.replace(/^\/+|\/+$/g, "");
  return normalized ? `core/${normalized}/index.html` : "core/index.html";
}

function renderCoreSurfaceCard(surface) {
  return `<article class="panel core-surface-card" data-maturity="${escapeAttr(surface.maturity)}">
    <span class="tag core-maturity">${escapeHtml(surface.maturity)}</span>
    <h3><a ${surfaceRouteLinkAttrs("core", surface.route.replace(/^\//, ""))}>${escapeHtml(surface.label)}</a></h3>
  </article>`;
}

const coreFormatReaderFraming = Object.freeze({
  kicker: ".kungfu portable work format",
  headline: ".kungfu is a portable, verifiable record of real work.",
  lead: "It keeps one bounded piece of work—what happened, the facts and artifacts it produced, and the evidence needed to verify it—together so a fresh person or agent can inspect and continue it without reconstructing the story from a chat.",
  orientationHeading: "Keep the work, not just the conversation.",
  orientationBody: "A folder keeps files. A transcript keeps words. Neither reliably tells the next agent what actually happened, which information was trusted, which outputs belong to the work, or how to check them. .kungfu keeps those relationships together.",
  handoffHeading: "How a fresh agent continues the same work",
  readerLevelsHeading: "Not understanding something is different from losing it.",
  statusHeading: "Qualified does not mean stable.",
  status: "This packaged format authority is qualified but still pre-release. It proves the current contract and retained test corpus; it does not promise stable compatibility or automatic understanding of every future format.",
  contents: [
    {
      label: "What happened",
      body: "An Episode records one bounded occurrence. Facts record the state the work relied on.",
    },
    {
      label: "What it produced",
      body: "Artifacts, a Manifest, Receipts and dependencies keep outputs connected to the work that produced them.",
    },
    {
      label: "Why it can be checked",
      body: "Content roots let another reader verify the retained material before trusting or acting on it.",
    },
  ],
  handoff: [
    {
      label: "Work",
      body: "An agent performs a bounded piece of real work and produces facts, artifacts and evidence.",
    },
    {
      label: "Retain",
      body: ".kungfu keeps the Episode and its verification material together instead of leaving context scattered across a chat and a folder.",
    },
    {
      label: "Continue",
      body: "A fresh agent can inspect what is known, preserve material it does not yet understand, and act only when the required semantics are compatible.",
    },
  ],
  readerLevels: [
    {
      label: "Preserve",
      body: "Keep unfamiliar but well-formed material as exact bytes without pretending to understand it.",
    },
    {
      label: "Inspect",
      body: "Read structure and verification evidence within the reader's declared capability.",
    },
    {
      label: "Act",
      body: "Deriving canonical state, admitting it as trusted, or executing it requires complete compatible semantics.",
    },
  ],
});

function renderCoreFormatAuthorityDetails(surface, authorities) {
  const authority = coreBundle.formatAuthority;
  const overview = coreFormatRoutes.overview.value;
  const readerContract = coreFormatRoutes.readerContract.value;
  const compatibility = coreFormatRoutes.versionMatrix.value;
  const registry = coreFormatRoutes.registry.value;
  const vectors = coreFormatRoutes.vectors.value;
  return `<details class="panel core-format-technical" id="format-technical-details">
    <summary>
      <span class="eyebrow">For implementers and auditors</span>
      <strong>Inspect the exact Spec contract, compatibility rules, roots and machine artifacts.</strong>
      <span>This material remains complete, but it does not have to be understood before the product makes sense.</span>
    </summary>
    <div class="core-format-technical-body">
      <section class="panel" aria-labelledby="format-package-framing-heading">
        <p class="eyebrow">Package-declared surface model</p>
        <h2 id="format-package-framing-heading">${escapeHtml(surface.headline)}</h2>
        <p>${escapeHtml(surface.summary)}</p>
        <div class="grid" style="margin-top: 18px;">
          <article>
            <h3>Capabilities</h3>
            <ul>${surface.capabilities.map((capability) => `<li>${escapeHtml(capability)}</li>`).join("")}</ul>
          </article>
          <article>
            <h3>Known limits</h3>
            <ul class="core-limit-list">${surface.knownLimits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join("")}</ul>
          </article>
        </div>
      </section>

      <section class="panel" aria-labelledby="format-authority-heading">
        <p class="eyebrow">Exact packaged Spec authority</p>
        <h2 id="format-authority-heading">${escapeHtml(overview.boundary.definition)}</h2>
        <dl class="meta" style="margin-top: 18px;">
          <dt>Spec pickup</dt><dd><code>${escapeHtml(authority.pickup.coordinate)}</code></dd>
          <dt>Format namespace</dt><dd><code>${escapeHtml(authority.formatNamespace)}</code></dd>
          <dt>Authority status</dt><dd><code>${escapeHtml(authority.status)}</code></dd>
          <dt>Normative root</dt><dd><code>${escapeHtml(authority.normativeRoot)}</code></dd>
          <dt>Retained corpus</dt><dd><code>${escapeHtml(authority.conformance.release)}</code> · ${escapeHtml(String(authority.conformance.vectorCount))} vectors · <code>${escapeHtml(authority.conformance.releaseRoot)}</code></dd>
          <dt>Projection policy</dt><dd><code>${escapeHtml(authority.projectionPolicy)}</code></dd>
        </dl>
        <p style="margin-top: 18px;"><strong>Composition rule:</strong> ${escapeHtml(compatibility.composition_rule)}</p>
        <div class="grid three" style="margin-top: 18px;">
          ${overview.boundary.notOneOf.map((item) => `<article class="panel"><p class="eyebrow">Not one authority</p><h3>${escapeHtml(item)}</h3></article>`).join("")}
        </div>
      </section>

      <section aria-labelledby="format-reader-heading">
        <p class="eyebrow">Required-reader behavior</p>
        <h2 id="format-reader-heading">${escapeHtml(readerContract.rule)}</h2>
        <div class="grid three" style="margin-top: 18px;">
          ${readerContract.profiles.map((profile) => `<article class="panel">
            <span class="tag">${escapeHtml(profile.id)}</span>
            <h3>${escapeHtml(profile.authorityEffect)}</h3>
            <p><strong>Semantic scope:</strong> ${escapeHtml(profile.semanticScope)}</p>
            <p><strong>Unknown material:</strong> <code>${escapeHtml(profile.unknownOutcome)}</code></p>
            <p><strong>Unsupported root:</strong> <code>${escapeHtml(profile.unsupportedRootOutcome)}</code></p>
          </article>`).join("")}
        </div>
      </section>

      <section class="panel" aria-labelledby="format-version-heading">
        <p class="eyebrow">Independent version axes</p>
        <h2 id="format-version-heading">No package version stands in for every compatibility decision.</h2>
        <ul class="core-authority-list">
          ${overview.version_axes.map((axis) => `<li><code>${escapeHtml(axis.id)}</code> <strong>${escapeHtml(axis.owner)}</strong> — ${escapeHtml(axis.changesWhen)}</li>`).join("")}
        </ul>
        <p><strong>v4 alpha baseline:</strong> <code>${escapeHtml(compatibility.v4_alpha_baseline.latest_release)}</code> · <code>${escapeHtml(compatibility.v4_alpha_baseline.latest_release_root)}</code> · ${escapeHtml(compatibility.v4_alpha_baseline.stability.status)}</p>
      </section>

      <section class="panel" aria-labelledby="format-artifacts-heading">
        <p class="eyebrow">Rooted machine routes</p>
        <h2 id="format-artifacts-heading">Inspect the exact Spec artifacts copied from the verified package.</h2>
        <ul class="core-authority-list">
          ${Object.entries(authority.routes).map(([routeId, descriptor]) => `<li><span class="tag">${escapeHtml(routeId)}</span> <a ${surfaceRouteLinkAttrs("core", descriptor.path)}><code>${escapeHtml(descriptor.path)}</code></a> <code>${escapeHtml(descriptor.artifactRoot)}</code></li>`).join("")}
        </ul>
        <p>${escapeHtml(String(registry.entries.length))} registered protocols · ${escapeHtml(String(vectors.vectors.length))} retained vectors · release <code>${escapeHtml(vectors.latest_release)}</code>.</p>
      </section>

      <section class="panel warning" aria-labelledby="format-nonclaims-heading">
        <p class="eyebrow">Spec claim boundary</p>
        <h2 id="format-nonclaims-heading">What this portable authority does not claim</h2>
        <ul class="core-limit-list">${authority.nonClaims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>
      </section>

      <section class="panel" aria-labelledby="format-upstream-authority-heading">
        <p class="eyebrow">Pinned authority</p>
        <h2 id="format-upstream-authority-heading">Inspect the exact upstream sources</h2>
        <ul class="core-authority-list">
          ${authorities.map((source) => `<li><span class="tag">${escapeHtml(source.role)}</span> <a href="${escapeAttr(source.url)}">${escapeHtml(source.path)}</a> <code>${escapeHtml(source.contentRoot)}</code></li>`).join("")}
        </ul>
      </section>
    </div>
  </details>`;
}

function renderCoreFormatHumanPage(surface, authorities) {
  return `${coreProductStyles}<section class="hero">
    <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("core")} aria-label="Back to Core product map">Back to Core product map</a><span class="page-kicker-state">${escapeHtml(surface.claimClass)} / ${escapeHtml(surface.maturity)}</span></p>
    <p class="eyebrow">${escapeHtml(coreFormatReaderFraming.kicker)}</p>
    <h1>${escapeHtml(coreFormatReaderFraming.headline)}</h1>
    <p class="lead">${escapeHtml(coreFormatReaderFraming.lead)}</p>
  </section>

  <section class="panel core-format-orientation" aria-labelledby="format-orientation-heading">
    <p class="eyebrow">Why it exists</p>
    <h2 id="format-orientation-heading">${escapeHtml(coreFormatReaderFraming.orientationHeading)}</h2>
    <p>${escapeHtml(coreFormatReaderFraming.orientationBody)}</p>
    <div class="grid three" style="margin-top: 18px;">
      ${coreFormatReaderFraming.contents.map((entry) => `<article class="panel">
        <h3>${escapeHtml(entry.label)}</h3>
        <p>${escapeHtml(entry.body)}</p>
      </article>`).join("")}
    </div>
  </section>

  <section aria-labelledby="format-handoff-heading">
    <p class="eyebrow">A simple handoff</p>
    <h2 id="format-handoff-heading">${escapeHtml(coreFormatReaderFraming.handoffHeading)}</h2>
    <div class="grid three" style="margin-top: 18px;">
      ${coreFormatReaderFraming.handoff.map((entry, index) => `<article class="panel core-format-step">
        <span class="core-format-step-index">${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
        <h3>${escapeHtml(entry.label)}</h3>
        <p>${escapeHtml(entry.body)}</p>
      </article>`).join("")}
    </div>
  </section>

  <section class="panel" aria-labelledby="format-reader-levels-heading">
    <p class="eyebrow">Safe reader behavior</p>
    <h2 id="format-reader-levels-heading">${escapeHtml(coreFormatReaderFraming.readerLevelsHeading)}</h2>
    <div class="grid three" style="margin-top: 18px;">
      ${coreFormatReaderFraming.readerLevels.map((entry) => `<article>
        <h3>${escapeHtml(entry.label)}</h3>
        <p>${escapeHtml(entry.body)}</p>
      </article>`).join("")}
    </div>
  </section>

  <section class="panel warning" aria-labelledby="format-human-status-heading">
    <p class="eyebrow">Current boundary</p>
    <h2 id="format-human-status-heading">${escapeHtml(coreFormatReaderFraming.statusHeading)}</h2>
    <p>${escapeHtml(coreFormatReaderFraming.status)}</p>
  </section>

  ${renderCoreFormatAuthorityDetails(surface, authorities)}`;
}

function renderCoreSurfacePage(surface) {
  const authorities = coreSurfaceAuthorities(surface);
  if (surface.id === "format") {
    return page({
      title: `${surface.label} | core.libkungfu.dev`,
      description: coreFormatReaderFraming.lead,
      current: "core",
      preserveRelativeMachineEntries: true,
      body: renderCoreFormatHumanPage(surface, authorities),
    });
  }
  return page({
    title: `${surface.label} | core.libkungfu.dev`,
    description: surface.summary,
    current: "core",
    preserveRelativeMachineEntries: true,
    body: `${coreProductStyles}<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("core")} aria-label="Back to Core product map">Back to Core product map</a><span class="page-kicker-state">${escapeHtml(surface.claimClass)} / ${escapeHtml(surface.maturity)}</span></p>
      <h1>${escapeHtml(surface.headline)}</h1>
      <p class="lead">${escapeHtml(surface.summary)}</p>
    </section>

    <section class="grid" aria-labelledby="${escapeAttr(surface.id)}-capabilities-heading">
      <article class="panel">
        <p class="eyebrow">What this layer supports</p>
        <h2 id="${escapeAttr(surface.id)}-capabilities-heading">Capabilities</h2>
        <ul>${surface.capabilities.map((capability) => `<li>${escapeHtml(capability)}</li>`).join("")}</ul>
      </article>
      <article class="panel warning">
        <p class="eyebrow">Claim boundary</p>
        <h2>Known limits</h2>
        <ul class="core-limit-list">${surface.knownLimits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join("")}</ul>
      </article>
    </section>

    <section class="panel" aria-labelledby="${escapeAttr(surface.id)}-authority-heading">
      <p class="eyebrow">Pinned authority</p>
      <h2 id="${escapeAttr(surface.id)}-authority-heading">Inspect the exact upstream sources</h2>
      <ul class="core-authority-list">
        ${authorities.map((source) => `<li><span class="tag">${escapeHtml(source.role)}</span> <a href="${escapeAttr(source.url)}">${escapeHtml(source.path)}</a> <code>${escapeHtml(source.contentRoot)}</code></li>`).join("")}
      </ul>
    </section>
    ${surface.id === "qualification" ? `<section class="panel warning">
      <p class="eyebrow">Global product boundary</p>
      <h2>Claims this bundle does not make</h2>
      <ul class="core-limit-list">${coreBundle.nonClaims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>
    </section>` : ""}`,
  });
}

function coreAdrSourceHref(record) {
  return `${coreRepository}/blob/${encodeURIComponent(coreBundle.source.revision)}/${record.file}`;
}

const coreAgentManifest = {
  schemaVersion: 1,
  contract: "core.libkungfu.dev/site-bundle-consumer/v1",
  ...surfaceTimestampPolicy,
  canonicalHost: surfaceCanonicalHost("core"),
  package: {
    name: corePackage.name,
    version: corePackage.version,
    integrity: coreSiteLock.integrity,
  },
  bundle: {
    contract: coreBundle.contract,
    contentRoot: coreBundle.contentRoot,
    sourceRoot: coreBundle.sourceRoot,
    source: coreBundle.source,
    schemaDigest: sha256Buffer(Buffer.from(coreBundleSchema)),
  },
  readerContract: {
    contract: site.readerContract.contract,
    owner: site.readerContract.owner,
    path: readerPath("core"),
    humanEntries: Object.fromEntries(coreBundle.surfaces.map((surface) => [
      surface.id,
      surfaceEndpointHref("core", surface.route.replace(/^\//, "")),
    ])),
    layers: site.readerContract.layers,
    sourceBoundary: site.sourceBoundary,
  },
  positioning: coreBundle.positioning,
  adoptionLayers: coreBundle.adoptionLayers,
  formatAuthority: {
    ...coreBundle.formatAuthority,
    manifest: surfaceEndpointHref("core", "format/manifest.json"),
    routes: Object.fromEntries(Object.entries(coreBundle.formatAuthority.routes).map(([routeId, descriptor]) => [
      routeId,
      {
        ...descriptor,
        url: surfaceEndpointHref("core", descriptor.path),
      },
    ])),
  },
  surfaces: coreBundle.surfaces.map((surface) => ({
    ...surface,
    authorities: coreSurfaceAuthorities(surface),
  })),
  nonClaims: coreBundle.nonClaims,
  adrMap: coreBundle.adrMap,
  machineEntries: {
    manifest: surfaceEndpointHref("core", "manifest.json"),
    bundle: surfaceEndpointHref("core", "site-bundle.json"),
    agentIndex: surfaceEndpointHref("core", "agent-index.json"),
    adrMap: surfaceEndpointHref("core", "adr-map.json"),
    schema: surfaceEndpointHref("core", "schema/site-bundle.schema.json"),
    formatManifest: surfaceEndpointHref("core", "format/manifest.json"),
    formatReaderContract: surfaceEndpointHref("core", "format/reader-matrix.json"),
    formatVersionMatrix: surfaceEndpointHref("core", "format/compatibility.json"),
    formatRegistry: surfaceEndpointHref("core", "format/registry.json"),
    formatVectors: surfaceEndpointHref("core", "format/vectors/index.json"),
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
        <p class="eyebrow page-kicker"><a href="/" aria-label="Back to libkungfu.dev">Back to libkungfu.dev</a><span class="page-kicker-state" id="dogfood-state">public dogfood / ${dogfoodEvidenceSource.selection === "observed-immutable" ? "embedded observation" : "retained fallback"}</span></p>
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
      <div class="dogfood-hero-number" id="dogfood-hero-number" aria-label="${escapeAttr(formatMetric(dogfoodEvidence.metrics.mergedPublicPullRequests.value))} merged public pull requests in the observed window">
        <strong id="dogfood-pr-total">${escapeHtml(formatMetric(dogfoodEvidence.metrics.mergedPublicPullRequests.value))}</strong>
        <span id="dogfood-pr-caption">${escapeHtml(dogfoodEvidence.metrics.mergedPublicPullRequests.label)} across ${escapeHtml(formatMetric(dogfoodEvidence.metrics.repositoriesWithMergedPullRequests.value))} repositories</span>
      </div>
    </section>

    <section class="panel" aria-labelledby="bootstrap-interpretation-heading">
      <p class="eyebrow">Related first-party interpretation</p>
      <h2 id="bootstrap-interpretation-heading">What this public work suggests about organizational bootstrap</h2>
      <p>For a bounded first-party interpretation of what this public work suggests about organizational bootstrap, read <a href="${escapeAttr(dogfoodRelatedInterpretation.url)}">${escapeHtml(dogfoodRelatedInterpretation.label)}</a>. ${escapeHtml(dogfoodRelatedInterpretation.claimBoundary)}</p>
    </section>

    <section class="dogfood-history" aria-labelledby="dogfood-history-heading">
      <div class="section-heading">
        <p class="eyebrow">Append-only observation history</p>
        <h2 id="dogfood-history-heading">Review any retained snapshot and its adjacent change.</h2>
        <p>Each delta is a change between observation points over overlapping rolling P30D windows. It is not a count of work newly created in one week.</p>
      </div>
      <div class="dogfood-history-controls">
        <label for="dogfood-snapshot-select">Observation snapshot
          <select id="dogfood-snapshot-select" name="snapshot">
            <option value="${escapeAttr(dogfoodEvidence.snapshotId)}">${escapeHtml(dogfoodEvidence.observation.observedAt)} · ${dogfoodEvidenceSource.selection === "observed-immutable" ? "embedded" : "retained fallback"}</option>
          </select>
        </label>
        <div class="dogfood-history-nav" aria-label="Adjacent observations">
          <button type="button" id="dogfood-previous" disabled>Previous</button>
          <button type="button" id="dogfood-next" disabled>Next</button>
        </div>
      </div>
      <p class="dogfood-history-status" id="dogfood-history-status" role="status" aria-live="polite">Loading the append-only observation chain…</p>
      <div class="dogfood-comparison">
        <h3 id="dogfood-comparison-heading">Adjacent observation comparison</h3>
        <table aria-describedby="dogfood-history-status">
          <caption>Metric values are independent P30D observations; the delta is current minus previous.</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Previous</th><th scope="col">Selected</th><th scope="col">Delta</th></tr></thead>
          <tbody id="dogfood-comparison-body"><tr><th scope="row">History</th><td colspan="3">Available when live evidence loads.</td></tr></tbody>
        </table>
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
      <p>Run the public GitHub searches, inspect the exact Kungfu commit, or use the site checker. Historical visibility changes can affect a later API replay, so the immutable published JSON remains the admitted observation snapshot.</p>
      <dl class="meta" style="margin-top: 18px;">
        <dt>Observed at</dt><dd><code id="dogfood-observed-at">${escapeHtml(dogfoodEvidence.observation.observedAt)}</code></dd>
        <dt>Generated at</dt><dd><code id="dogfood-generated-at">${escapeHtml(dogfoodEvidence.provenance?.generatedAt || "legacy snapshot; generation timestamp was not recorded")}</code></dd>
        <dt>Snapshot kind</dt><dd><code id="dogfood-snapshot-kind">${escapeHtml(dogfoodEvidence.provenance?.generationKind || "retained fallback")}</code></dd>
        <dt>GitHub query</dt><dd><code id="dogfood-query">${escapeHtml(dogfoodEvidence.sources.github.baseQuery)}</code></dd>
        <dt>Project Cut commit</dt><dd><a id="dogfood-cut" href="${escapeAttr(`${dogfoodEvidence.sources.projectCuts.repository}/tree/${dogfoodEvidence.sources.projectCuts.gitCommit}/.kungfu/project-cuts`)}">${escapeHtml(dogfoodEvidence.sources.projectCuts.gitCommit)}</a></dd>
        <dt>Machine route</dt><dd><a id="dogfood-machine-route" href="/dogfood-evidence.json"><code>/dogfood-evidence.json</code></a></dd>
      </dl>
    </section>
    ${dogfoodLiveProjectionScript(dogfoodEvidence)}`,
  }),
);

writeFile(
  "core/runtime/index.html",
  page({
    title: "Core runtime mechanism | core.libkungfu.dev",
    description: "The complete Core journal, observation, durability, semantic, qualification, and source-contract model.",
    current: "core",
    preserveRelativeMachineEntries: true,
    body: `${coreProductStyles}<section class="hero">
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
    title: "core.libkungfu.dev | Kungfu product map",
    description: coreBundle.positioning.promise,
    current: "core",
    preserveRelativeMachineEntries: true,
    body: `${coreProductStyles}${renderReaderOrientation("core", "Complete Kungfu product map")}
    <section class="panel core-positioning" id="core-authority" aria-labelledby="core-product-promise">
      <p class="eyebrow">Kungfu product promise</p>
      <h2 class="product-promise" id="core-product-promise">${escapeHtml(coreBundle.positioning.firstReleaseOutcome)}</h2>
      <p class="lead">${escapeHtml(coreBundle.positioning.promise)}</p>
      <p><strong>${escapeHtml(coreBundle.positioning.principle)}</strong></p>
      <p class="reader-claim-boundary"><strong>Status:</strong> ${escapeHtml(coreBundle.positioning.status)}</p>
      <div class="card-actions">
        <a class="card-action" ${surfaceRouteLinkAttrs("core", "format/")}>Start with the .kungfu contract</a>
        <a class="card-action secondary" ${surfaceRouteLinkAttrs("core", "site-bundle.json")}>Inspect the exact bundle</a>
      </div>
    </section>

    <section aria-labelledby="core-layers-heading">
      <p class="eyebrow">Adopt only what you need</p>
      <h2 id="core-layers-heading" class="section-heading">Six independently bounded product layers</h2>
      <div class="core-layer-grid">
        ${coreBundle.adoptionLayers.map((layer, index) => `<article class="panel core-layer-card">
          <span class="core-layer-index">${String(index + 1).padStart(2, "0")} · ${escapeHtml(layer.maturity)}</span>
          <h3>${escapeHtml(layer.label)}</h3>
        </article>`).join("")}
      </div>
    </section>

    <section aria-labelledby="core-surfaces-heading">
      <p class="eyebrow">Human and agent navigation</p>
      <h2 id="core-surfaces-heading" class="section-heading">Open the layer, boundary, or evidence you need</h2>
      <div class="core-surface-grid">
        ${coreBundle.surfaces.filter((surface) => surface.id !== "overview").map(renderCoreSurfaceCard).join("")}
      </div>
    </section>

    <section class="panel warning">
      <p class="eyebrow">Qualification before promotion</p>
      <h2>Design, implementation, qualification, and publication are separate claims.</h2>
      <a class="card-action" ${surfaceRouteLinkAttrs("core", "qualification/")}>Read all global non-claims</a>
    </section>`,
  }),
);

for (const surface of coreBundle.surfaces) {
  if (surface.id === "overview" || surface.id === "runtime" || surface.id === "decisions") {
    continue;
  }
  writeFile(coreSurfaceOutputPath(surface.route), renderCoreSurfacePage(surface));
}

writeFile(
  "core/decisions/index.html",
  page({
    title: "Kungfu ADR map | core.libkungfu.dev",
    description: coreSurfaceById.get("decisions").summary,
    current: "core",
    preserveRelativeMachineEntries: true,
    body: `${coreProductStyles}<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("core")} aria-label="Back to Core product map">Back to Core product map</a><span class="page-kicker-state">current-contract / implemented</span></p>
      <h1>${escapeHtml(coreSurfaceById.get("decisions").headline)}</h1>
      <p class="lead">${escapeHtml(coreSurfaceById.get("decisions").summary)}</p>
      <p><strong>Authority boundary:</strong> ${escapeHtml(coreBundle.adrMap.authorityBoundary)}</p>
      <div class="card-actions">
        <a class="card-action" href="/adr-map.json">Open machine ADR map</a>
      </div>
    </section>

    <section aria-labelledby="core-adr-domain-heading">
      <p class="eyebrow">Corpus overview</p>
      <h2 id="core-adr-domain-heading">${escapeHtml(String(coreAdrMap.summary.records))} ADRs across ${escapeHtml(String(coreAdrMap.summary.domains))} domains</h2>
      <div class="core-adr-domains">
        ${coreAdrMap.domains.map((domain) => `<a class="core-adr-domain" href="#domain-${escapeAttr(domain.id)}"><strong>${escapeHtml(String(domain.count))}</strong><span>${escapeHtml(domain.title)}</span></a>`).join("")}
      </div>
    </section>

    <section class="panel">
      <p class="eyebrow">Authoritative relations</p>
      <h2>${escapeHtml(String(coreAdrMap.summary.authoritativeEdges))} supersedes edges declared in ADR frontmatter</h2>
      <ul>${coreAdrMap.authoritativeEdges.map((edge) => `<li><code>${escapeHtml(edge.source)}</code> ${escapeHtml(edge.relation)} <code>${escapeHtml(edge.target)}</code></li>`).join("")}</ul>
      <p>${escapeHtml(String(coreAdrMap.summary.inferredNavigationEdges))} inferred nearby edges are navigation aids only; they do not create architecture authority.</p>
    </section>

    ${coreAdrMap.domains.map((domain) => `<section class="panel" id="domain-${escapeAttr(domain.id)}">
      <p class="eyebrow">${escapeHtml(domain.id)} · ${escapeHtml(String(domain.count))} records</p>
      <h2>${escapeHtml(domain.title)}</h2>
      <ul class="core-adr-list">
        ${coreAdrMap.records.filter((record) => record.domain === domain.id).map((record) => `<li class="core-adr-record">
          <code>${escapeHtml(record.key)}</code>
          <span><a href="${escapeAttr(coreAdrSourceHref(record))}"><strong>${escapeHtml(record.title)}</strong></a><br><span class="tag">${escapeHtml(record.decisionStatus)}</span> <span class="tag">${escapeHtml(record.implementationStatus)}</span> <span class="tag">${escapeHtml(record.reviewState)}</span> <small>${escapeHtml(String(record.qualificationRefCount))} qualification refs</small></span>
        </li>`).join("")}
      </ul>
    </section>`).join("")}`,
  }),
);

writeFile("core/manifest.json", `${JSON.stringify(coreAgentManifest, null, 2)}\n`);
writeFile("core/site-bundle.json", readPackageText("@kungfu-tech/site/site-bundle.json"));
writeFile("core/agent-index.json", readPackageText("@kungfu-tech/site/agent-index.json"));
writeFile("core/adr-map.json", readPackageText("@kungfu-tech/site/adr-map.json"));
writeFile("core/schema/site-bundle.schema.json", coreBundleSchema);
copyDirectoryContents(
  path.join(packageRoot("@kungfu-tech/site"), "dist", "site", "format"),
  "core/format",
);
writeFile(
  "core/llms.txt",
  `# ${surfaceCanonicalHost("core")} product map

Reader contract: ${site.readerContract.contract}
Audience: ${readerPath("core").audience}
Question: ${readerPath("core").question}
Promise: ${readerPath("core").promise}

Product promise:
${coreBundle.positioning.promise}

First release outcome:
${coreBundle.positioning.firstReleaseOutcome}

Status:
${coreBundle.positioning.status}

Principle:
${coreBundle.positioning.principle}

Product layers:
${coreBundle.adoptionLayers.map((layer) => `- ${layer.label} [${layer.maturity}]: ${layer.job} Does not require: ${layer.notRequired}`).join("\n")}

Surfaces:
${coreBundle.surfaces.map((surface) => `- ${surface.route} ${surface.label} [${surface.maturity}; ${surface.claimClass}]: ${surface.summary}`).join("\n")}

Portable format authority:
- human definition: ${coreFormatReaderFraming.headline}
- why it exists: ${coreFormatReaderFraming.orientationHeading} ${coreFormatReaderFraming.orientationBody}
- handoff: ${coreFormatReaderFraming.handoffHeading} ${coreFormatReaderFraming.handoff.map((entry) => `${entry.label}: ${entry.body}`).join(" ")}
- safe reader behavior: ${coreFormatReaderFraming.readerLevelsHeading} ${coreFormatReaderFraming.readerLevels.map((entry) => `${entry.label}: ${entry.body}`).join(" ")}
- current boundary: ${coreFormatReaderFraming.statusHeading} ${coreFormatReaderFraming.status}
- pickup: ${coreBundle.formatAuthority.pickup.coordinate}
- status: ${coreBundle.formatAuthority.status}
- normative root: ${coreBundle.formatAuthority.normativeRoot}
- reader rule: ${coreFormatRoutes.readerContract.value.rule}
- compatibility rule: ${coreFormatRoutes.versionMatrix.value.composition_rule}
- retained corpus: ${coreBundle.formatAuthority.conformance.release} / ${coreBundle.formatAuthority.conformance.vectorCount} vectors / ${coreBundle.formatAuthority.conformance.releaseRoot}
${Object.entries(coreBundle.formatAuthority.routes).map(([routeId, descriptor]) => `- ${routeId}: ${surfaceEndpointHref("core", descriptor.path)} [${descriptor.artifactRoot}]`).join("\n")}

Global non-claims:
${coreBundle.nonClaims.map((claim) => `- ${claim}`).join("\n")}

Pinned package:
- ${corePackage.name}@${corePackage.version}
- integrity: ${coreSiteLock.integrity}
- bundle content root: ${coreBundle.contentRoot}
- source root: ${coreBundle.sourceRoot}
- source revision: ${coreBundle.source.revision}

Machine entries:
- ${surfaceEndpointHref("core", "manifest.json")}
- ${surfaceEndpointHref("core", "site-bundle.json")}
- ${surfaceEndpointHref("core", "agent-index.json")}
- ${surfaceEndpointHref("core", "adr-map.json")}
- ${surfaceEndpointHref("core", "schema/site-bundle.schema.json")}
- ${surfaceEndpointHref("core", "format/manifest.json")}
- ${surfaceEndpointHref("core", "format/reader-matrix.json")}
- ${surfaceEndpointHref("core", "format/compatibility.json")}
- ${surfaceEndpointHref("core", "format/registry.json")}
- ${surfaceEndpointHref("core", "format/vectors/index.json")}
- ${surfaceEndpointHref("core", "llms.txt")}
- ${surfaceEndpointHref("core", "llms-full.txt")}
`,
);
writeFile(
  "core/llms-full.txt",
  `# core.libkungfu.dev full agent index\n\n${JSON.stringify({
    site: coreAgentManifest,
    bundle: coreBundle,
    agentIndex: coreAgentIndex,
    adrMap: coreAdrMap,
  }, null, 2)}\n`,
);

writeFile(
  "kfd/decisions/index.html",
  page({
    title: "KFD decisions and standards | kfd.libkungfu.dev",
    description: "The complete KFD foundation, numbered decisions, candidates, adoption boundary, quickstart, and source metadata.",
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">decisions / rendered index</span></p>
      <h1>KFD decisions and standards</h1>
      <p class="lead">Inspect the rendered foundation model, adoption boundary, numbered decisions, candidates, quickstart, and exact repository authority.</p>
    </section>
    ${kfdAuthoritySignal({
      sourcePath: kfdSite.homepage.currentDecisions.source,
      projectionLabel: "Rendered decision index",
    })}
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
    body: `${kfdHomepageHero()}

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
    </section>

    ${kfdIndependentImplementationPanel()}
    ${kfdSelfConformancePanel()}

    <section class="panel" id="agent-hub-qualification">
      <p class="eyebrow">${escapeHtml(kfdSite.agentHubPage.status)} adopter profile</p>
      <h2>Verify Agent Hub in the installed Kungfu product</h2>
      <p><code>${escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.run)}</code></p>
      <p><code>${escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.verify)}</code></p>
      <div class="card-actions">
        <a class="card-action" href="${escapeAttr(kfdAgentHubPath)}">Understand and run the qualification</a>
      </div>
    </section>

    <section class="panel" id="activation-contracts">
      <p class="eyebrow">${escapeHtml(kfdSite.activationContracts.contract.status)} machine interfaces</p>
      <h2>KFD-11–13 activation interfaces</h2>
      <p>${escapeHtml(kfdSite.activationContracts.authorityNote)}</p>
      <div class="card-actions">
        <a class="card-action" href="/activation-contracts.json">Inspect manifest</a>
        <a class="card-action secondary" href="${escapeAttr(kfdAgentHubPath)}#activation-contracts">Read schemas</a>
      </div>
    </section>`,
  }),
);

const renderedKfdAgentHub = renderDecisionMarkdown(
  rewritePackageMarkdownLinks(
    kfdSite.agentHubPage.sections
      .map((section) => `## ${section.title}\n\n${section.markdown}`)
      .join("\n\n"),
    "kungfu-systems/kfd",
    {
      filePattern: /\.md$/,
      internalRoutes: kfdPageRouteBySourcePath,
      sourcePath: kfdSite.agentHubPage.authorityPath,
    },
  ),
  "Agent Hub qualification sections",
);
const kfdAgentHubPageHtml = page({
  title: `${kfdSite.agentHubPage.title} | kfd.libkungfu.dev`,
  description: kfdSite.agentHubPage.lead,
  current: "kfd",
  alternates: kfdSurfaceAlternates(),
  body: `<section class="hero kfd-content-hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">${escapeHtml(kfdSite.agentHubPage.status)} / ${escapeHtml(kfdSite.agentHubPage.relationship)}</span></p>
      <h1>${escapeHtml(kfdSite.agentHubPage.title)}</h1>
      <p class="lead">${escapeHtml(kfdSite.agentHubPage.lead)}</p>
      ${kfdAuthoritySignal({ sourcePath: kfdSite.agentHubPage.authorityPath, variant: "hero" })}
    </section>

    <section class="doc-layout">
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, "agent-hub")}
        ${renderedKfdAgentHub.tocHtml}
      </aside>
      <div class="stack kfd-agent-hub-content">
        <section class="panel" id="installed-kungfu-qualification">
          <p class="eyebrow">First-party product projection</p>
          <h2>Run the fixed suite through installed Kungfu</h2>
          <pre><code class="language-sh">${escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.run)}
${escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.verify)}</code></pre>
          <p>${escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.ownership)}</p>
          <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(kfdSite.agentHubPage.claimBoundary)}</p>
        </section>

        <article class="panel doc-content">
          ${renderedKfdAgentHub.html}
        </article>

        <section class="panel" id="activation-contracts">
          <p class="eyebrow">${escapeHtml(kfdActivationContracts.status)} / ${escapeHtml(kfdSite.activationContracts.relationship)}</p>
          <h2>KFD-11 through KFD-13 activation interfaces</h2>
          <p>${escapeHtml(kfdSite.activationContracts.authorityNote)}</p>
          <div class="grid" style="margin-top: 18px;">
            ${Object.values(kfdActivationContracts.interfaces)
              .map((entry) => `<article class="panel">
                <h3>${escapeHtml(entry.contract)}</h3>
                <p><a href="/${escapeAttr(entry.schemaPath)}"><code>${escapeHtml(entry.schemaPath)}</code></a></p>
              </article>`)
              .join("\n")}
          </div>
          <p class="reader-claim-boundary"><strong>Normative:</strong> <code>${escapeHtml(String(kfdSite.activationContracts.normative))}</code></p>
          <ul>${kfdActivationContracts.nonClaims.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
          <div class="card-actions">
            <a class="card-action" href="/activation-contracts.json">Inspect the discovery manifest</a>
          </div>
        </section>
      </div>
    </section>

    <section class="panel" style="margin-top: 18px;">
      <h2>Page metadata</h2>
      <dl class="meta">
        <dt>Route</dt>
        <dd><code>${escapeHtml(kfdAgentHubPath)}</code></dd>
        <dt>Relationship</dt>
        <dd><code>${escapeHtml(kfdSite.agentHubPage.relationship)}</code></dd>
        <dt>Normative</dt>
        <dd><code>${escapeHtml(String(kfdSite.agentHubPage.normative))}</code></dd>
        <dt>Profile</dt>
        <dd><code>${escapeHtml(kfdSite.agentHubPage.profile)}</code></dd>
        <dt>Suite</dt>
        <dd><code>${escapeHtml(kfdSite.agentHubPage.suite.id)}@${escapeHtml(kfdSite.agentHubPage.suite.version)}</code></dd>
        <dt>Projection source</dt>
        <dd><a href="${escapeAttr(kfdSourceHref(kfdSite.agentHubPage.authorityPath))}">GitHub · <code>${escapeHtml(kfdSite.agentHubPage.authorityPath)}</code> ↗</a></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
});
writeFile("kfd/agent-hub/index.html", kfdAgentHubPageHtml);
writeFile("agent-hub/index.html", kfdAgentHubPageHtml);

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
  body: `<section class="hero kfd-content-hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">explanation / non-normative</span></p>
      <h1>${escapeHtml(kfdSite.foundationPage.title)}</h1>
      <p class="lead">${escapeHtml(kfdSite.foundationPage.authorityNote)}</p>
      ${kfdAuthoritySignal({ sourcePath: kfdSite.foundationPage.sourcePath, variant: "hero" })}
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
        <dt>Projection source</dt>
        <dd><a href="${escapeAttr(kfdSourceHref(kfdSite.foundationPage.sourcePath))}">GitHub · <code>${escapeHtml(kfdSite.foundationPage.sourcePath)}</code> ↗</a></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
});
writeFile("kfd/foundation/index.html", kfdFoundationPageHtml);
writeFile("foundation/index.html", kfdFoundationPageHtml);

function renderKfdVerificationLanes(currentLaneId) {
  return `<section class="panel" data-kfd-verification-lanes>
    <p class="eyebrow">Two verification lanes</p>
    <h2>Choose the evidence path you need</h2>
    <div class="grid" style="margin-top: 18px;">
      ${(kfdSite.verificationLanes || []).map((lane) => `<article class="panel" data-verification-lane="${escapeAttr(lane.id)}">
        <h3><a href="${escapeAttr(`${lane.url.replace(/\/+$/, "")}/`)}"${lane.id === currentLaneId ? ' aria-current="page"' : ""}>${escapeHtml(lane.title)}</a></h3>
        <p><code>${escapeHtml(lane.relationship)}</code></p>
        <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(lane.claimBoundary)}</p>
      </article>`).join("\n")}
    </div>
  </section>`;
}

function renderKfdSelfConformanceEvidence(pageEntry) {
  if (pageEntry.id !== "self-conformance") {
    return "";
  }
  const recursiveCase = pageEntry.recursiveCase;
  const terminal = recursiveCase.terminal;
  return `<div class="stack" style="margin-top: 18px;" data-kfd-self-conformance-evidence>
    <section class="panel">
      <p class="eyebrow">${escapeHtml(pageEntry.profile.status)} profile · ${escapeHtml(pageEntry.profile.id)}@${escapeHtml(pageEntry.profile.version)}</p>
      <h2>Governed self-change, with authority kept separate</h2>
      <ul>${pageEntry.governedObjects.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      <div class="grid" style="margin-top: 18px;">
        ${pageEntry.lifecycle.paths.map((entry) => `<article class="panel">
          <h3>${escapeHtml(entry.id)}</h3>
          <p><strong>Transitions:</strong> ${escapeHtml(entry.transitions.join(", "))}</p>
          <p><strong>Authority roles:</strong> ${escapeHtml(entry.authorityRoles.join(", "))}</p>
          <p><strong>Decisions:</strong> ${escapeHtml(entry.decisions.join(", "))}</p>
        </article>`).join("\n")}
      </div>
      <p class="reader-claim-boundary"><strong>Lifecycle boundary:</strong> ${escapeHtml(pageEntry.lifecycle.claimBoundary)}</p>
    </section>

    <section class="panel">
      <p class="eyebrow">Native + WASM · byte parity · offline · independent</p>
      <h2>Run and verify the fixed transition contract</h2>
      ${pageEntry.commands.map((entry) => `<div style="margin-top: 14px;">
        <h3>${escapeHtml(entry.label)}</h3>
        <pre class="kfd-command"><code>${escapeHtml(entry.command)}</code></pre>
      </div>`).join("\n")}
      <dl class="meta">
        <dt>Verifier necessary</dt><dd><code>${escapeHtml(String(pageEntry.releaseSeparation.verifierNecessary))}</code></dd>
        <dt>Verifier sufficient</dt><dd><code>${escapeHtml(String(pageEntry.releaseSeparation.verifierSufficient))}</code></dd>
        <dt>Human approval required</dt><dd><code>${escapeHtml(String(pageEntry.releaseSeparation.humanApprovalRequired))}</code></dd>
        <dt>Release authority separate</dt><dd><code>${escapeHtml(String(pageEntry.releaseSeparation.releaseAuthoritySeparate))}</code></dd>
      </dl>
      <p class="reader-claim-boundary"><strong>Verifier boundary:</strong> ${escapeHtml(pageEntry.verifierBoundary.claimBoundary)}</p>
    </section>

    <section class="panel" id="recursive-case-status">
      <p class="eyebrow">Closed recursive case · ${escapeHtml(recursiveCase.liveCase.outcome)}</p>
      <h2>No new KFD was allocated</h2>
      <p>The Candidate is <code>${escapeHtml(recursiveCase.candidate.status)}</code> into the existing KFD-1, KFD-2, KFD-5, KFD-11 and Profile closure. It remains <code>normative: ${escapeHtml(String(recursiveCase.candidate.normative))}</code>, with no number, active status, self-certification, merge authority, or release authority.</p>
      <div class="card-actions">
        <a class="card-action" href="${escapeAttr(`${recursiveCase.candidate.url.replace(/\/+$/, "")}/`)}">Inspect Candidate lineage</a>
        <a class="card-action secondary" href="${escapeAttr(`${recursiveCase.liveCase.url.replace(/\/+$/, "")}/`)}">Inspect the closed live case</a>
      </div>
      <dl class="meta">
        <dt>Terminal outcome</dt><dd><code>${escapeHtml(terminal.outcome)}</code></dd>
        <dt>Request root</dt><dd><code>${escapeHtml(terminal.requestRoot)}</code></dd>
        <dt>Fixed package root</dt><dd><code>${escapeHtml(terminal.fixedPackageRoot)}</code></dd>
        <dt>Terminal bundle root</dt><dd><code>${escapeHtml(terminal.terminalBundleRoot)}</code></dd>
        <dt>Terminal report root</dt><dd><code>${escapeHtml(terminal.terminalReportRoot)}</code></dd>
        <dt>Number allocated</dt><dd><code>${escapeHtml(String(terminal.numberAllocated))}</code></dd>
        <dt>Status changed</dt><dd><code>${escapeHtml(String(terminal.statusChanged))}</code></dd>
        <dt>Release authorized</dt><dd><code>${escapeHtml(String(terminal.releaseAuthorized))}</code></dd>
      </dl>
      <p class="reader-claim-boundary"><strong>Case boundary:</strong> ${escapeHtml(recursiveCase.liveCase.claimBoundary)}</p>
    </section>

    <section class="panel">
      <h2>Exact machine assets</h2>
      <ul>${pageEntry.machineAssets.map((asset) => `<li><a href="${escapeAttr(asset.url)}">${escapeHtml(asset.role)}</a> · <code>${escapeHtml(asset.mediaType)}</code> · <code>${escapeHtml(asset.digest)}</code></li>`).join("")}</ul>
      <p>Package: <code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code> · integrity: <code>${escapeHtml(kfdLock.integrity)}</code></p>
    </section>
  </div>`;
}

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
  const implementationEvidence = pageEntry.rendererContract?.showMachineAssets
    ? `<section class="panel" style="margin-top: 18px;">
      <h2>Implementation evidence</h2>
      <p>${escapeHtml(pageEntry.releaseIdentity?.rule || pageEntry.authorityNote)}</p>
      <dl class="meta">
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
        <dt>Coverage</dt>
        <dd><code>${escapeHtml(String(pageEntry.semanticSelfSufficiency?.entryCount || 0))} decisions · ${escapeHtml(String(pageEntry.semanticSelfSufficiency?.coverageCounts?.complete || 0))} complete · ${escapeHtml(String(pageEntry.semanticSelfSufficiency?.coverageCounts?.partial || 0))} partial · ${escapeHtml(String(pageEntry.semanticSelfSufficiency?.coverageCounts?.gap || 0))} gap</code></dd>
        <dt>Warrant profile</dt>
        <dd><code>${escapeHtml(pageEntry.warrantEvidence?.profile || "")}</code> · <code>${escapeHtml(pageEntry.warrantEvidence?.decisionStatus || "")}</code> · <code>${escapeHtml(String(pageEntry.warrantEvidence?.fixedVectorCount || 0))} fixed vectors</code></dd>
      </dl>
      <ul>${(pageEntry.machineAssets || []).map((asset) => `<li><a href="${escapeAttr(asset.url)}">${escapeHtml(asset.role)}</a> · <code>${escapeHtml(asset.mediaType)}</code> · <code>${escapeHtml(asset.digest)}</code></li>`).join("")}</ul>
      <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(pageEntry.warrantEvidence?.claimBoundary || pageEntry.authorityNote)}</p>
    </section>`
    : "";
  return page({
    title: `${pageEntry.title} | kfd.libkungfu.dev`,
    description: pageEntry.authorityNote,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero kfd-content-hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">${escapeHtml(kicker)}</span></p>
      <h1>${escapeHtml(pageEntry.title)}</h1>
      <p class="lead">${escapeHtml(pageEntry.authorityNote)}</p>
      ${kfdAuthoritySignal({ sourcePath: pageEntry.sourcePath, variant: "hero" })}
    </section>

    ${pageEntry.id === "independent-verification" || pageEntry.id === "self-conformance"
      ? renderKfdVerificationLanes(pageEntry.id === "self-conformance" ? "governed-self-change" : "independent-implementation")
      : ""}

    <section class="doc-layout">
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, currentPage)}
        ${rendered.tocHtml}
      </aside>
      <article class="panel doc-content">
        ${rendered.html}
      </article>
    </section>

    ${implementationEvidence}
    ${renderKfdSelfConformanceEvidence(pageEntry)}

    <section class="panel" style="margin-top: 18px;">
      <h2>Page metadata</h2>
      <dl class="meta">
        <dt>Route</dt>
        <dd><code>${escapeHtml(pagePath)}</code></dd>
        <dt>Relationship</dt>
        <dd><code>${escapeHtml(pageEntry.relationship)}</code></dd>
        <dt>Normative</dt>
        <dd><code>${escapeHtml(String(pageEntry.normative))}</code></dd>
        <dt>Projection source</dt>
        <dd><a href="${escapeAttr(kfdSourceHref(pageEntry.sourcePath))}">GitHub · <code>${escapeHtml(pageEntry.sourcePath)}</code> ↗</a></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
  });
}

for (const pageEntry of kfdStandalonePages) {
  if (!["markdown-document", "self-conformance-guide"].includes(pageEntry.rendering?.kind)) {
    throw new Error(`Unsupported KFD standalone page renderer: ${pageEntry.id || pageEntry.url}`);
  }
  const relativeRoute = pageEntry.url.replace(/^\/+|\/+$/g, "");
  if (!relativeRoute) {
    throw new Error(`KFD standalone page must declare a non-root route: ${pageEntry.id || "unknown"}`);
  }
  const pageHtml = renderKfdReferencePage(pageEntry, {
    currentPage: `standalone:${pageEntry.id}`,
    tocLabel: `${pageEntry.title} sections`,
    kicker: `${pageEntry.relationship} / ${pageEntry.normative ? "normative" : "non-normative"}`,
  });
  writeFile(`kfd/${relativeRoute}/index.html`, pageHtml);
  writeFile(`${relativeRoute}/index.html`, pageHtml);
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
    <section class="hero kfd-content-hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">historical companion / non-normative</span></p>
      <h1>${escapeHtml(kfdSite.casesPage.title)}</h1>
      <p class="lead">${escapeHtml(kfdSite.casesPage.authorityNote)}</p>
      ${kfdAuthoritySignal({ sourcePath: kfdSite.casesPage.sourcePath, variant: "hero" })}
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
        <dt>Projection source</dt>
        <dd><a href="${escapeAttr(kfdSourceHref(kfdSite.casesPage.sourcePath))}">GitHub · <code>${escapeHtml(kfdSite.casesPage.sourcePath)}</code> ↗</a></dd>
        <dt>Package</dt>
        <dd><code>${escapeHtml(kfdPackage.name)}@${escapeHtml(kfdPackage.version)}</code></dd>
      </dl>
    </section>`,
});
writeFile("kfd/cases/index.html", kfdCasesPageHtml);
writeFile("cases/index.html", kfdCasesPageHtml);

for (const liveCase of kfdLiveCases) {
  const candidatePages = kfdCandidatePagesByLiveCaseId.get(liveCase.id) || [];
  const singleCandidate = candidatePages.length === 1 ? candidatePages[0] : undefined;
  const liveCaseDocuments = kfdLiveCaseDocuments(liveCase);
  const renderedLiveCase = renderDecisionMarkdown(
    liveCaseDocuments.map((entry) => rewritePackageMarkdownLinks(entry.markdown, "kungfu-systems/kfd", {
      filePattern: /\.md$|\.json$/,
      internalRoutes: kfdPageRouteBySourcePath,
      sourcePath: entry.path,
    })).join("\n\n---\n\n"),
    `${liveCase.title} sections`,
  );
  const relationshipHtml = candidatePages.length === 0
    ? `<p data-candidate-relationship="none"><strong>Candidate relationships:</strong> No Candidate page is registered for this live case.</p>`
    : candidatePages.length === 1
      ? `<p data-candidate-relationship="single"><strong>Candidate ownership:</strong> <a href="${escapeAttr(singleCandidate.url)}">${escapeHtml(singleCandidate.title)}</a> is the single Candidate whose package registry source cases include this live case.</p>`
      : `<div data-candidate-relationship="many"><p><strong>Candidate relationships:</strong> ${escapeHtml(String(candidatePages.length))} Candidates cite this live case; no singular Candidate owner is implied.</p><ul>${candidatePages.map((candidate) => `<li><a href="${escapeAttr(candidate.url)}">${escapeHtml(candidate.title)}</a></li>`).join("")}</ul></div>`;
  const recursiveCase = liveCase.id === "recursive-normative-self-conformance"
    ? kfdSelfConformancePage?.recursiveCase
    : undefined;
  const extraEvidenceHtml = recursiveCase
    ? `<section class="panel" data-live-case-extra="recursive-terminal">
      <p class="eyebrow">Terminal evidence · ${escapeHtml(recursiveCase.liveCase.outcome)}</p>
      <h2>Closed without a new Primitive or KFD number</h2>
      <dl class="meta">
        <dt>Candidate status</dt><dd><code>${escapeHtml(recursiveCase.candidate.status)}</code></dd>
        <dt>Terminal outcome</dt><dd><code>${escapeHtml(recursiveCase.terminal.outcome)}</code></dd>
        <dt>Request root</dt><dd><code>${escapeHtml(recursiveCase.terminal.requestRoot)}</code></dd>
        <dt>Terminal report root</dt><dd><code>${escapeHtml(recursiveCase.terminal.terminalReportRoot)}</code></dd>
        <dt>Number allocated</dt><dd><code>${escapeHtml(String(recursiveCase.terminal.numberAllocated))}</code></dd>
        <dt>Release authorized</dt><dd><code>${escapeHtml(String(recursiveCase.terminal.releaseAuthorized))}</code></dd>
      </dl>
      <div class="card-actions"><a class="card-action secondary" href="${escapeAttr(`${kfdSelfConformancePage.url.replace(/\/+$/, "")}/`)}">Self-Conformance Profile</a></div>
    </section>`
    : liveCase.id === "durable-result-identity-availability"
      ? `<section class="panel" data-live-case-extra="durable-result-boundary">
        <p class="eyebrow">Founding evidence · qualification remains open</p>
        <h2>Product genesis is retained without promoting the Candidate</h2>
        <p>Number allocation and production reuse remain <strong>not authorized</strong>.</p>
      </section>`
      : "";
  const backHref = singleCandidate?.url || kfdCandidateIndexPath;
  const backLabel = singleCandidate ? `Back to ${singleCandidate.title}` : "Back to Candidate registry";
  const liveCaseHtml = page({
    title: `${liveCase.title} | KFD live cases`,
    description: liveCase.claimBoundary,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero kfd-content-hero" data-live-case-hero>
      <p class="eyebrow page-kicker"><a href="${escapeAttr(backHref)}" aria-label="${escapeAttr(backLabel)}">${escapeHtml(backLabel)}</a><span class="page-kicker-state">live case / ${escapeHtml(liveCase.status)}</span></p>
      <h1>${escapeHtml(liveCase.title)}</h1>
      <p class="lead">${escapeHtml(liveCase.claimBoundary)}</p>
      ${kfdAuthoritySignal({ sourcePath: liveCase.humanEntry.path, variant: "hero" })}
    </section>

    <section class="panel" data-live-case-contract>
      <p class="eyebrow">Package-registered live case</p>
      <h2>Status and Candidate relationships</h2>
      <dl class="meta">
        <dt>Live case status</dt><dd><code>${escapeHtml(liveCase.status)}</code></dd>
        <dt>Standard</dt><dd><code>${escapeHtml(liveCase.standard)}</code></dd>
        <dt>Relationship</dt><dd><code>${escapeHtml(liveCase.relationship)}</code></dd>
        <dt>Normative</dt><dd><code>${escapeHtml(String(kfdSite.liveCases.normative))}</code></dd>
        <dt>Candidate count</dt><dd><code>${escapeHtml(String(candidatePages.length))}</code></dd>
      </dl>
      ${relationshipHtml}
      <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(liveCase.claimBoundary)}</p>
    </section>

    ${extraEvidenceHtml}

    <section class="doc-layout long-toc" data-live-case-narrative>
      <aside class="doc-sidebar">
        ${kfdDecisionNav(undefined, "live-case", undefined, undefined, liveCase)}
        ${renderedLiveCase.tocHtml}
      </aside>
      <article class="panel doc-content">${renderedLiveCase.html}</article>
    </section>`,
  });
  const liveCaseOutput = liveCase.url.replace(/^\/+|\/+$/g, "");
  writeFile(`kfd/${liveCaseOutput}/index.html`, liveCaseHtml);
  writeFile(`${liveCaseOutput}/index.html`, liveCaseHtml);
}

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
  body: `<section class="hero kfd-content-hero">
      <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">candidate index / non-normative</span></p>
      <h1>KFD Candidates</h1>
      <p class="lead">${escapeHtml(kfdSite.kfdCandidates.authorityNote)}</p>
      ${kfdAuthoritySignal({ sourcePath: kfdSite.kfdCandidates.indexSource, variant: "hero" })}
    </section>

    ${kfdSelfConformancePage ? `<section class="panel" data-recursive-candidate-summary>
      <p class="eyebrow">Self-conformance result</p>
      <h2>Recursive normative self-conformance: no new KFD</h2>
      <p>The package records the Candidate as <code>${escapeHtml(kfdSelfConformancePage.recursiveCase.candidate.status)}</code> into the existing closure and the live case as <code>${escapeHtml(kfdSelfConformancePage.recursiveCase.liveCase.status)}</code> with outcome <code>${escapeHtml(kfdSelfConformancePage.recursiveCase.liveCase.outcome)}</code>. It remains non-normative and has no allocated number.</p>
      <div class="card-actions">
        <a class="card-action" href="${escapeAttr(`${kfdSelfConformancePage.recursiveCase.candidate.url.replace(/\/+$/, "")}/`)}">Candidate lineage</a>
        <a class="card-action secondary" href="${escapeAttr(`${kfdSelfConformancePage.recursiveCase.liveCase.url.replace(/\/+$/, "")}/`)}">Closed live case</a>
        <a class="card-action secondary" href="${escapeAttr(`${kfdSelfConformancePage.url.replace(/\/+$/, "")}/`)}">Self-Conformance Profile</a>
      </div>
      <p class="reader-claim-boundary"><strong>Claim boundary:</strong> ${escapeHtml(kfdSelfConformancePage.recursiveCase.candidate.claimBoundary)}</p>
    </section>` : ""}

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
  const selfConformanceCandidate = candidatePage.id === kfdSelfConformancePage?.recursiveCase?.id
    ? kfdSelfConformancePage.recursiveCase
    : undefined;
  const candidateHtml = page({
    title: `${candidatePage.title} | KFD Candidates`,
    description: candidatePage.claimBoundary,
    current: "kfd",
    alternates: kfdSurfaceAlternates(),
    body: `<section class="hero kfd-content-hero">
        <p class="eyebrow page-kicker"><a href="${escapeAttr(kfdCandidateIndexPath)}" aria-label="Back to KFD Candidates">Back to KFD Candidates</a><span class="page-kicker-state">candidate / ${escapeHtml(candidatePage.status)}</span></p>
        <h1>${escapeHtml(candidatePage.title)}</h1>
        <p class="lead">${escapeHtml(candidatePage.claimBoundary)}</p>
        ${kfdAuthoritySignal({ sourcePath: candidatePage.sourcePath, variant: "hero" })}
      </section>

      ${selfConformanceCandidate ? `<section class="panel" data-recursive-candidate-status>
        <p class="eyebrow">Terminal self-conformance status</p>
        <h2>Merged into the existing closure; no number allocated</h2>
        <p><code>${escapeHtml(selfConformanceCandidate.candidate.status)}</code> here records the authority-separated <code>${escapeHtml(selfConformanceCandidate.liveCase.outcome)}</code> result. It does not mean Git merge, activation, certification, publication, or release.</p>
        <div class="card-actions">
          <a class="card-action" href="${escapeAttr(`${kfdSelfConformancePage.url.replace(/\/+$/, "")}/`)}">How KFD changes itself</a>
          <a class="card-action secondary" href="${escapeAttr(`${selfConformanceCandidate.liveCase.url.replace(/\/+$/, "")}/`)}">Closed live case</a>
        </div>
      </section>` : ""}

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
          <dd><code>${escapeHtml(candidatePage.slotHint == null ? "none" : String(candidatePage.slotHint))}</code></dd>
          <dt>Relationship</dt>
          <dd><code>${escapeHtml(kfdSite.candidatePages.relationship)}</code></dd>
          <dt>Normative</dt>
          <dd><code>${escapeHtml(String(kfdSite.candidatePages.normative))}</code></dd>
          <dt>Claim boundary</dt>
          <dd>${escapeHtml(candidatePage.claimBoundary)}</dd>
          <dt>Candidate source</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(candidatePage.sourcePath))}">GitHub · <code>${escapeHtml(candidatePage.sourcePath)}</code> ↗</a></dd>
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
    body: `<section class="hero kfd-content-hero">
        <p class="eyebrow page-kicker"><a href="${escapeAttr(candidatePage.url)}" aria-label="Back to ${escapeAttr(candidatePage.title)}">${escapeHtml(`Back to ${candidatePage.title}`)}</a><span class="page-kicker-state">formal candidate / ${escapeHtml(candidateFormalPage.formalCandidateStatus)}</span></p>
        <h1>${escapeHtml(candidatePage.title)} formal candidate</h1>
        <p class="lead">A non-normative formal model owned by the candidate source.</p>
        ${kfdAuthoritySignal({ sourcePath: candidateFormalPage.sourcePath, variant: "hero" })}
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
          <dt>Candidate authority</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(candidateFormalPage.authorityPath))}">GitHub · <code>${escapeHtml(candidateFormalPage.authorityPath)}</code> ↗</a></dd>
          <dt>Projection source</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(candidateFormalPage.sourcePath))}">GitHub · <code>${escapeHtml(candidateFormalPage.sourcePath)}</code> ↗</a></dd>
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
    body: `<section class="hero kfd-content-hero">
        <p class="eyebrow page-kicker"><a ${surfaceLinkAttrs("kfd")} aria-label="Back to KFD home">Back to KFD home</a><span class="page-kicker-state">${escapeHtml(entry.kind)} / ${escapeHtml(entry.status)}</span></p>
        <h1>${escapeHtml(entry.id)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
        ${kfdAuthoritySignal({ sourcePath: entry.path, variant: "hero" })}
      </section>

      <section class="panel">
        <h2>Decision metadata</h2>
        <dl class="meta">
          <dt>Number</dt>
          <dd><code>${escapeHtml(entry.number)}</code></dd>
          <dt>Stable URL</dt>
          <dd><a href="/${escapeAttr(entry.number)}/"><code>${escapeHtml(entry.url)}</code></a></dd>
          <dt>Canonical source</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(entry.path))}">GitHub · <code>${escapeHtml(entry.path)}</code> ↗</a></dd>
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
      body: `<section class="hero kfd-content-hero">
        <p class="eyebrow page-kicker"><a href="/${escapeAttr(entry.number)}/" aria-label="Back to ${escapeAttr(entry.id)}">${escapeHtml(`Back to ${entry.id}`)}</a><span class="page-kicker-state">usage / ${escapeHtml(entry.id)}</span></p>
        <h1>${escapeHtml(usagePage.title || `${entry.id} usage`)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
        ${kfdAuthoritySignal({ sourcePath: usagePage.sourcePath || usagePage.path, variant: "hero" })}
      </section>

      <section class="panel">
        <h2>Usage metadata</h2>
        <dl class="meta">
          <dt>Decision</dt>
          <dd><a href="/${escapeAttr(entry.number)}/"><code>${escapeHtml(entry.id)}</code></a></dd>
          <dt>Stable URL</dt>
          <dd><code>${escapeHtml(usagePage.url || `https://kfd.libkungfu.dev/${entry.number}/usage`)}</code></dd>
          <dt>Canonical decision</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(entry.path))}">GitHub · <code>${escapeHtml(entry.path)}</code> ↗</a></dd>
          <dt>Projection source</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(usagePage.sourcePath || usagePage.path))}">GitHub · <code>${escapeHtml(usagePage.sourcePath || usagePage.path)}</code> ↗</a></dd>
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
      body: `<section class="hero kfd-content-hero">
        <p class="eyebrow page-kicker"><a href="/${escapeAttr(entry.number)}/" aria-label="Back to ${escapeAttr(entry.id)}">${escapeHtml(`Back to ${entry.id}`)}</a><span class="page-kicker-state">formal reference / ${escapeHtml(entry.id)}</span></p>
        <h1>${escapeHtml(formalPage.title || `${entry.id} formal reference`)}</h1>
        <p class="lead">${escapeHtml(entry.title)}</p>
        ${kfdAuthoritySignal({ sourcePath: formalPage.sourcePath || formalPage.path, variant: "hero" })}
      </section>

      <section class="panel">
        <h2>Formal reference metadata</h2>
        <dl class="meta">
          <dt>Decision</dt>
          <dd><a href="/${escapeAttr(entry.number)}/"><code>${escapeHtml(entry.id)}</code></a></dd>
          <dt>Stable URL</dt>
          <dd><code>${escapeHtml(formalPage.url || `https://kfd.libkungfu.dev/${entry.number}/formal`)}</code></dd>
          <dt>Projection source</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(formalPage.sourcePath || formalPage.path))}">GitHub · <code>${escapeHtml(formalPage.sourcePath || formalPage.path)}</code> ↗</a></dd>
          <dt>Relationship</dt>
          <dd><code>${escapeHtml(formalPage.relationship || "formal-reference-child-of-decision")}</code></dd>
          <dt>Normative</dt>
          <dd><code>${escapeHtml(String(formalPage.normative))}</code></dd>
          <dt>Model status</dt>
          <dd><code>${escapeHtml(formalPage.formalModelStatus || "unspecified")}</code></dd>
          <dt>Model version</dt>
          <dd><code>${escapeHtml(String(formalPage.formalModelVersion || "unspecified"))}</code></dd>
          <dt>Canonical decision</dt>
          <dd><a href="${escapeAttr(kfdSourceHref(formalPage.authorityPath || entry.path))}">GitHub · <code>${escapeHtml(formalPage.authorityPath || entry.path)}</code> ↗</a></dd>
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

const paperPropagationQualificationPath = path.resolve(
  repoRoot,
  process.env.PAPER_PROPAGATION_QUALIFICATION_PATH || ".buildchain/paper-propagation-qualification.json",
);
const paperPropagationQualification = fs.existsSync(paperPropagationQualificationPath)
  ? verifyPaperPropagationQualification(readJsonFile(paperPropagationQualificationPath))
  : undefined;
const paperPropagationManifest = paperPropagationQualification?.propagation
  ? paperPropagationQualification
  : undefined;

const manifest = {
  schemaVersion: 1,
  contract: "libkungfu-dev-generated-site-manifest",
  ...surfaceTimestampPolicy,
  canonicalHost: surfaceCanonicalHost("hub"),
  paperPropagation: paperPropagationManifest,
  publicationFastPath: paperPropagationManifest?.qualified
    ? paperPropagationManifest.publicationFastPath
    : undefined,
  brand: {
    signature: BRAND_SIGNATURE,
    context: BRAND_CONTEXT,
    productName: "Kungfu",
    boundary: BRAND_BOUNDARY,
  },
  sourceBoundary: site.sourceBoundary,
  relatedInterpretations: site.relatedInterpretations,
  observedEvidence: {
    contract: dogfoodEvidenceSource.contract || "kungfu-site-dogfood-render-input",
    selection: dogfoodEvidenceSource.selection,
    snapshotId: dogfoodEvidenceSource.snapshotId,
    observedAt: dogfoodEvidenceSource.observedAt,
    source: dogfoodEvidenceSource.source,
    immutableUrl: dogfoodEvidenceSource.immutableUrl,
    sha256: dogfoodEvidenceSource.sha256,
    reproducibility: "Fetch the immutable URL and verify its SHA-256 before rendering the same snapshot.",
  },
  readerContract: site.readerContract,
  pages: [
    { path: "/", host: surfaceCanonicalHost("hub"), source: "src/fixtures/site-manifest.json" },
    { path: "/architecture/", host: surfaceCanonicalHost("hub"), source: "src/fixtures/site-manifest.json" },
    {
      path: "/dogfood/",
      host: surfaceCanonicalHost("hub"),
      source: dogfoodEvidenceSource.immutableUrl || dogfoodEvidenceSource.source,
      sha256: dogfoodEvidenceSource.sha256,
    },
    {
      path: "/dogfood-evidence.json",
      host: surfaceCanonicalHost("hub"),
      source: dogfoodEvidenceSource.immutableUrl || dogfoodEvidenceSource.source,
      sha256: dogfoodEvidenceSource.sha256,
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
    ...coreBundle.surfaces.map((surface) => ({
      path: surface.route,
      host: surfaceCanonicalHost("core"),
      source: `${corePackage.name}@${corePackage.version}/dist/site/site-bundle.json`,
    })),
    ...[
      "manifest.json",
      "site-bundle.json",
      "agent-index.json",
      "adr-map.json",
      "schema/site-bundle.schema.json",
      "llms.txt",
      "llms-full.txt",
    ].map((entry) => ({
      path: `/${entry}`,
      host: surfaceCanonicalHost("core"),
      source: `${corePackage.name}@${corePackage.version}`,
    })),
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
      path: "/manifest.json",
      host: surfaceCanonicalHost("buildchain"),
      source: `@kungfu-tech/buildchain@${buildchainPackage.version}/dist/site/site-manifest.json`,
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
      path: kfdAgentHubPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.agentHubPage.authorityPath}`,
    },
    {
      path: kfdFoundationPath,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.foundationPage.sourcePath}`,
    },
    ...kfdStandalonePages.map((pageEntry) => ({
      path: `${pageEntry.url.replace(/\/+$/, "")}/`,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${pageEntry.sourcePath}`,
    })),
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
      path: "/activation-contracts.json",
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.activationContracts.source}`,
    },
    ...kfdActivationSchemas.map((entry) => ({
      path: `/${entry.schemaPath}`,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.schemaPath}`,
    })),
    ...kfdStandaloneMachineAssets.map((entry) => ({
      path: `/${entry.outputPath}`,
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.sourcePath}`,
    })),
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
    ...kfdLiveCases.map((liveCase) => ({
      path: kfdLiveCasePath(liveCase),
      host: surfaceCanonicalHost("kfd"),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${liveCase.humanEntry.path}`,
    })),
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
      contract: coreBundle.contract,
      package: corePackage.name,
      version: corePackage.version,
      lockIntegrity: coreSiteLock.integrity,
      contentRoot: coreBundle.contentRoot,
      sourceRoot: coreBundle.sourceRoot,
      sourceRepository: coreBundle.source.repository,
      sourceRef: coreBundle.source.revision,
      treeDirty: coreBundle.source.treeDirty,
      surfaceManifest: surfaceEndpointHref("core", "manifest.json"),
      bundle: surfaceEndpointHref("core", "site-bundle.json"),
      agentIndex: surfaceEndpointHref("core", "agent-index.json"),
      adrMap: surfaceEndpointHref("core", "adr-map.json"),
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
      activationContracts: {
        contract: kfdActivationContracts.contract,
        status: kfdActivationContracts.status,
        normative: kfdSite.activationContracts.normative,
        discovery: surfaceEndpointHref("kfd", "activation-contracts.json"),
        schemaCount: kfdActivationSchemas.length,
      },
    },
  },
};

writeFile("runtime.json", `${JSON.stringify(runtimeAgentProjection, null, 2)}\n`);
writeFile("agent-supply-chain.json", `${JSON.stringify(agentSupplyChain, null, 2)}\n`);
writeFile("dogfood-evidence.json", `${JSON.stringify(dogfoodEvidence, null, 2)}\n`);
writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
writeFile("buildchain/manifest.json", `${JSON.stringify(buildchainSurfaceManifest, null, 2)}\n`);

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
    agentHub: surfaceEndpointHref("kfd", kfdAgentHubPath.replace(/^\/+/, "")),
    independentVerification: surfaceEndpointHref("kfd", "verify/"),
    selfConformance: surfaceEndpointHref("kfd", "verify/self-conformance/"),
    recursiveSelfConformanceCase: surfaceEndpointHref("kfd", "cases/live/recursive-normative-self-conformance/"),
    liveCases: Object.fromEntries(kfdLiveCases.map((liveCase) => [
      liveCase.id,
      surfaceEndpointHref("kfd", kfdLiveCasePath(liveCase).replace(/^\/+/, "")),
    ])),
  },
  agentEntries: {
    llms: surfaceEndpointHref("kfd", "llms.txt"),
    manifest: surfaceEndpointHref("kfd", "manifest.json"),
    agentHub: surfaceEndpointHref("kfd", kfdAgentHubPath.replace(/^\/+/, "")),
    registry: surfaceEndpointHref("kfd", "registry.json"),
    candidateRegistry: surfaceEndpointHref("kfd", "drafts/registry.json"),
    caseRegistry: surfaceEndpointHref("kfd", "cases/registry.json"),
    standards: surfaceEndpointHref("kfd", "standards.json"),
    terminology: surfaceEndpointHref("kfd", "terminology.json"),
    terminologySchema: surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json"),
    activationContracts: surfaceEndpointHref("kfd", "activation-contracts.json"),
    activationSchemas: Object.fromEntries(
      kfdActivationSchemas.map((entry) => [entry.contract, surfaceEndpointHref("kfd", entry.schemaPath)]),
    ),
    independentVerification: surfaceEndpointHref("kfd", "verify/"),
    independentVerificationAssets: Object.fromEntries(
      kfdIndependentVerificationAssets.map((entry) => [entry.role, surfaceEndpointHref("kfd", entry.outputPath)]),
    ),
    selfConformance: surfaceEndpointHref("kfd", "verify/self-conformance/"),
    selfConformanceAssets: Object.fromEntries(
      kfdSelfConformanceAssets.map((entry) => [entry.role, surfaceEndpointHref("kfd", entry.outputPath)]),
    ),
    recursiveSelfConformanceCase: surfaceEndpointHref("kfd", "cases/live/recursive-normative-self-conformance/"),
    liveCases: Object.fromEntries(kfdLiveCases.map((liveCase) => [
      liveCase.id,
      surfaceEndpointHref("kfd", kfdLiveCasePath(liveCase).replace(/^\/+/, "")),
    ])),
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
  independentImplementation: kfdSite.homepage.independentImplementation,
  verificationLanes: kfdSite.verificationLanes,
  selfConformance: kfdSelfConformancePage ? {
    ...kfdSelfConformancePage,
    path: `${kfdSelfConformancePage.url.replace(/\/+$/, "")}/`,
    url: surfaceEndpointHref("kfd", "verify/self-conformance/"),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSelfConformancePage.sourcePath}`,
    machineAssets: kfdSelfConformancePage.machineAssets.map((entry) => ({
      ...entry,
      url: surfaceEndpointHref("kfd", String(entry.url || "").replace(/^\/+/, "")),
    })),
  } : undefined,
  readOrder: [
    surfaceCanonicalHref("kfd"),
    surfaceEndpointHref("kfd", kfdAgentHubPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", "decisions/"),
    surfaceEndpointHref("kfd", kfdFoundationPath.replace(/^\/+/, "")),
    ...kfdStandalonePages.map((entry) => surfaceEndpointHref("kfd", `${entry.url.replace(/^\/+|\/+$/g, "")}/`)),
    surfaceEndpointHref("kfd", kfdFormalModelPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", kfdTerminologyPath.replace(/^\/+/, "")),
    surfaceEndpointHref("kfd", "terminology.json"),
    surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json"),
    surfaceEndpointHref("kfd", "activation-contracts.json"),
    ...kfdActivationSchemas.map((entry) => surfaceEndpointHref("kfd", entry.schemaPath)),
    ...kfdStandaloneMachineAssets.map((entry) => surfaceEndpointHref("kfd", entry.outputPath)),
    surfaceEndpointHref("kfd", kfdCasesPath.replace(/^\/+/, "")),
    ...kfdLiveCases.map((liveCase) => surfaceEndpointHref(
      "kfd",
      kfdLiveCasePath(liveCase).replace(/^\/+/, ""),
    )),
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
  agentHub: {
    ...kfdSite.agentHubPage,
    path: kfdAgentHubPath,
    url: surfaceEndpointHref("kfd", kfdAgentHubPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.agentHubPage.authorityPath}`,
  },
  foundation: {
    path: kfdFoundationPath,
    url: surfaceEndpointHref("kfd", kfdFoundationPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.foundationPage.sourcePath}`,
    relationship: kfdSite.foundationPage.relationship,
    normative: kfdSite.foundationPage.normative,
  },
  standalonePages: kfdStandalonePages.map((entry) => ({
    id: entry.id,
    title: entry.title,
    path: `${entry.url.replace(/\/+$/, "")}/`,
    url: surfaceEndpointHref("kfd", `${entry.url.replace(/^\/+|\/+$/g, "")}/`),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.sourcePath}`,
    relationship: entry.relationship,
    normative: entry.normative,
    rendering: entry.rendering,
    status: entry.status,
    authorityNote: entry.authorityNote,
    releaseIdentity: entry.releaseIdentity,
    commands: entry.commands,
    semanticSelfSufficiency: entry.semanticSelfSufficiency,
    warrantEvidence: entry.warrantEvidence,
    firstWaveEvidence: entry.firstWaveEvidence,
    machineAssets: entry.machineAssets?.map((asset) => ({
      ...asset,
      url: surfaceEndpointHref("kfd", String(asset.url || "").replace(/^\/+/, "")),
    })),
    rendererContract: entry.rendererContract,
  })),
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
  activationContracts: {
    path: "/activation-contracts.json",
    url: surfaceEndpointHref("kfd", "activation-contracts.json"),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.activationContracts.source}`,
    relationship: kfdSite.activationContracts.relationship,
    normative: kfdSite.activationContracts.normative,
    authorityNote: kfdSite.activationContracts.authorityNote,
    contract: kfdActivationContracts,
    schemas: kfdActivationSchemas.map(({ body: _body, ...entry }) => ({
      ...entry,
      path: `/${entry.schemaPath}`,
      url: surfaceEndpointHref("kfd", entry.schemaPath),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${entry.schemaPath}`,
    })),
  },
  cases: {
    path: kfdCasesPath,
    url: surfaceEndpointHref("kfd", kfdCasesPath.replace(/^\/+/, "")),
    source: `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.casesPage.sourcePath}`,
    registry: surfaceEndpointHref("kfd", "cases/registry.json"),
    registryContract: kfdCaseRegistry.contract,
    relationship: kfdSite.casesPage.relationship,
    normative: kfdSite.casesPage.normative,
    live: kfdLiveCases.map((liveCase) => ({
      ...liveCase,
      path: kfdLiveCasePath(liveCase),
      url: surfaceEndpointHref("kfd", kfdLiveCasePath(liveCase).replace(/^\/+/, "")),
      source: `@kungfu-tech/kfd@${kfdPackage.version}/${liveCase.humanEntry.path}`,
      candidates: (kfdCandidatePagesByLiveCaseId.get(liveCase.id) || []).map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        path: candidate.url,
        url: surfaceEndpointHref("kfd", candidate.url.replace(/^\/+/, "")),
      })),
    })),
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
writeFile("kfd/activation-contracts.json", `${JSON.stringify(kfdActivationContracts, null, 2)}\n`);
writeFile("activation-contracts.json", `${JSON.stringify(kfdActivationContracts, null, 2)}\n`);
for (const entry of kfdActivationSchemas) {
  writeFile(`kfd/${entry.schemaPath}`, `${JSON.stringify(entry.body, null, 2)}\n`);
  writeFile(entry.schemaPath, `${JSON.stringify(entry.body, null, 2)}\n`);
}
for (const entry of kfdStandaloneMachineAssets) {
  writeBinaryFile(`kfd/${entry.outputPath}`, entry.content);
  writeBinaryFile(entry.outputPath, entry.content);
}
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
- ${surfaceEndpointHref("kfd", kfdAgentHubPath.replace(/^\/+/, ""))}

Installed Kungfu Agent Hub qualification:
- Run: ${kfdSite.agentHubPage.firstPartyProductProjection.run}
- Verify: ${kfdSite.agentHubPage.firstPartyProductProjection.verify}
- Ownership: ${kfdSite.agentHubPage.firstPartyProductProjection.ownership}
- Claim boundary: ${kfdSite.agentHubPage.claimBoundary}

KFD-11 through KFD-13 activation interfaces:
- Status: ${kfdActivationContracts.status}
- Relationship: ${kfdSite.activationContracts.relationship}
- Normative: ${kfdSite.activationContracts.normative}
- Authority: ${kfdSite.activationContracts.authorityNote}
- Discovery: ${surfaceEndpointHref("kfd", "activation-contracts.json")}
${kfdActivationSchemas.map((entry) => `- ${entry.contract}: ${surfaceEndpointHref("kfd", entry.schemaPath)}`).join("\n")}
- Non-claims: ${kfdActivationContracts.nonClaims.join(" ")}

Independent implementation and verification:
- Promise: ${kfdSite.homepage.independentImplementation.promise}
- Languages: ${kfdSite.homepage.independentImplementation.supportedLanguages.map((entry) => entry.label).join(", ")}
${kfdSite.homepage.independentImplementation.steps.map((entry) => `- ${entry.label}: ${entry.command}`).join("\n")}
- Starter boundary: ${kfdSite.homepage.independentImplementation.starterBoundary}
- Offline boundary: ${kfdSite.homepage.independentImplementation.offlineBoundary}
- Claim boundary: ${kfdSite.homepage.independentImplementation.claimBoundary}
- Agent Hub: ${surfaceEndpointHref("kfd", "agent-hub/")}
- Guide: ${surfaceEndpointHref("kfd", "verify/")}
${kfdIndependentVerificationAssets.map((entry) => `- ${entry.role}: ${surfaceEndpointHref("kfd", entry.outputPath)} (${entry.digest})`).join("\n")}
- Claim boundary: ${kfdIndependentVerificationPage?.warrantEvidence?.claimBoundary || kfdIndependentVerificationPage?.authorityNote || "See the package-owned verification guide."}

Governed KFD self-change:
- Human guide: ${surfaceEndpointHref("kfd", "verify/self-conformance/")}
- Verification lanes: ${(kfdSite.verificationLanes || []).map((entry) => `${entry.id}=${surfaceEndpointHref("kfd", `${entry.url.replace(/^\/+|\/+$/g, "")}/`)}`).join(", ")}
- Profile: ${kfdSelfConformancePage.profile.id}@${kfdSelfConformancePage.profile.version} [${kfdSelfConformancePage.profile.status}; normative=${kfdSelfConformancePage.normative}]
- Candidate: ${kfdSelfConformancePage.recursiveCase.candidate.status}; normative=${kfdSelfConformancePage.recursiveCase.candidate.normative}; number allocated=${kfdSelfConformancePage.recursiveCase.terminal.numberAllocated}
- Live case: ${surfaceEndpointHref("kfd", "cases/live/recursive-normative-self-conformance/")} [${kfdSelfConformancePage.recursiveCase.liveCase.status}; ${kfdSelfConformancePage.recursiveCase.liveCase.outcome}]
- Terminal outcome: ${kfdSelfConformancePage.recursiveCase.terminal.outcome}
- Request root: ${kfdSelfConformancePage.recursiveCase.terminal.requestRoot}
- Fixed package root: ${kfdSelfConformancePage.recursiveCase.terminal.fixedPackageRoot}
- Terminal bundle root: ${kfdSelfConformancePage.recursiveCase.terminal.terminalBundleRoot}
- Terminal report root: ${kfdSelfConformancePage.recursiveCase.terminal.terminalReportRoot}
${kfdSelfConformancePage.commands.map((entry) => `- ${entry.label}: ${entry.command}`).join("\n")}
${kfdSelfConformanceAssets.map((entry) => `- ${entry.role}: ${surfaceEndpointHref("kfd", entry.outputPath)} (${entry.digest})`).join("\n")}
- Release boundary: ${kfdSelfConformancePage.releaseSeparation.note}
- Claim boundary: ${kfdSelfConformancePage.authorityNote} ${kfdSelfConformancePage.verifierBoundary.claimBoundary}

Agent-first entries:
- ${surfaceEndpointHref("kfd", "manifest.json")}
- ${surfaceEndpointHref("kfd", kfdAgentHubPath.replace(/^\/+/, ""))}
- ${surfaceEndpointHref("kfd", "registry.json")}
- ${surfaceEndpointHref("kfd", "drafts/registry.json")}
- ${surfaceEndpointHref("kfd", "cases/registry.json")}
- ${surfaceEndpointHref("kfd", "standards.json")}
- ${surfaceEndpointHref("kfd", "terminology.json")}
- ${surfaceEndpointHref("kfd", "schemas/kfd-terminology.schema.json")}
- ${surfaceEndpointHref("kfd", "activation-contracts.json")}
${kfdActivationSchemas.map((entry) => `- ${surfaceEndpointHref("kfd", entry.schemaPath)}`).join("\n")}
${kfdStandaloneMachineAssets.map((entry) => `- ${surfaceEndpointHref("kfd", entry.outputPath)}`).join("\n")}
- ${surfaceEndpointHref("kfd", "verify/self-conformance/")}
- ${surfaceEndpointHref("kfd", "cases/live/recursive-normative-self-conformance/")}
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
  `# ${BRAND_SIGNATURE} — ${BRAND_CONTEXT}

libkungfu.dev is the open developer and agent substrate hub for Kungfu.

Brand boundary: ${BRAND_BOUNDARY}

Reader contract: ${site.readerContract.contract}
${site.readerContract.promise}

Reader layers:
${site.readerContract.layers.map((entry) => `- ${entry.label} [${entry.owner}]: ${entry.purpose}`).join("\n")}

Installed Kungfu Agent Hub qualification:
- Human guide: ${surfaceEndpointHref("kfd", "agent-hub/")}
- Run: ${kfdSite.agentHubPage.firstPartyProductProjection.run}
- Verify: ${kfdSite.agentHubPage.firstPartyProductProjection.verify}
- Ownership: ${kfdSite.agentHubPage.firstPartyProductProjection.ownership}
- Claim boundary: ${kfdSite.agentHubPage.claimBoundary}

KFD governed self-change:
- Human guide: ${surfaceEndpointHref("kfd", "verify/self-conformance/")}
- Closed live case: ${surfaceEndpointHref("kfd", "cases/live/recursive-normative-self-conformance/")}
- Package: ${kfdPackage.name}@${kfdPackage.version}
- Integrity: ${kfdLock.integrity}
- Candidate status: ${kfdSelfConformancePage.recursiveCase.candidate.status}; normative=${kfdSelfConformancePage.recursiveCase.candidate.normative}; number allocated=${kfdSelfConformancePage.recursiveCase.terminal.numberAllocated}
- Case status: ${kfdSelfConformancePage.recursiveCase.liveCase.status}; outcome=${kfdSelfConformancePage.recursiveCase.liveCase.outcome}
- Terminal report root: ${kfdSelfConformancePage.recursiveCase.terminal.terminalReportRoot}
- Claim boundary: ${kfdSelfConformancePage.authorityNote} ${kfdSelfConformancePage.releaseSeparation.note}

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
- ${surfaceEndpointHref("core", "site-bundle.json")}
- ${surfaceEndpointHref("core", "agent-index.json")}
- ${surfaceEndpointHref("core", "adr-map.json")}
- ${surfaceEndpointHref("core", "llms.txt")}
- ${surfaceEndpointHref("papers", "manifest.json")}
- ${surfaceEndpointHref("papers", "registry.json")}

Core product promise:
${coreBundle.positioning.promise}

Core product routes:
${coreBundle.surfaces.map((surface) => `- ${surface.route} ${surface.label} [${surface.maturity}]`).join("\n")}

Agent Supply Chain:
${agentSupplyChain.layers.map((layer) => `${layer.order}. ${layer.id} [${layer.statusClass}] - ${layer.statement}`).join("\n")}

Claim boundary:
${agentSupplyChain.claimBoundary}

Vendor next action:
${agentSupplyChain.vendorNextAction}

Source boundary:
This repository owns the reader contract and renders pinned upstream evidence,
manifests, and packages. It is not a product fact source. Embeddable runtime facts come from the pinned
Kungfu source/PR and KFD Runtime 100 roots in /runtime.json. The complete Core
product map comes from the exact @kungfu-tech/site bundle, including its
per-surface maturity, authority, and non-claim boundaries. Buildchain facts must come from the
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
