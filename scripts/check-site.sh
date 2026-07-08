#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

node scripts/check-infra-outputs.mjs

pnpm exec buildchain badges readme --check

if grep -RInE 'mailto:|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  README.md docs public src dist 2>/dev/null; then
  echo "error: email address or mailto link found" >&2
  exit 1
fi

node - <<'NODE'
const fs = require("fs");
const renderSiteSource = fs.readFileSync("scripts/render-site.mjs", "utf8");
const requiredBaseFiles = [
  "src/fixtures/site-manifest.json",
  "src/fixtures/core-spec-manifest.json",
  "src/fixtures/buildchain-badge-endpoint-registry.json",
  "src/fixtures/badges/v1/kfd-1/passed.json",
  "src/fixtures/badges/v1/kfd-2/passed.json",
  "src/fixtures/badges/v1/kfd-3/passed.json",
  "src/fixtures/badges/v1/buildchain-release-passport/passed.json",
  "buildchain.contract-lock.json",
  "pnpm-lock.yaml",
  "dist/index.html",
  "dist/core/index.html",
  "dist/buildchain/index.html",
  "dist/kfd/index.html",
  "dist/kfd/manifest.json",
  "dist/kfd/registry.json",
  "dist/kfd/standards.json",
  "dist/kfd/llms.txt",
  "dist/badges/v1/badge-endpoint-registry.json",
  "dist/badges/v1/kfd-1/passed.svg",
  "dist/badges/v1/kfd-2/passed.svg",
  "dist/badges/v1/kfd-3/passed.svg",
  "dist/badges/v1/buildchain-release-passport/passed.svg",
  "dist/badges/v1/kfd-1/passed.json",
  "dist/badges/v1/kfd-2/passed.json",
  "dist/badges/v1/kfd-3/passed.json",
  "dist/badges/v1/buildchain-release-passport/passed.json",
  "dist/manifest.json",
  "dist/llms.txt",
];

const site = JSON.parse(fs.readFileSync("src/fixtures/site-manifest.json", "utf8"));
const core = JSON.parse(fs.readFileSync("src/fixtures/core-spec-manifest.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));
const badgeEndpointRegistry = JSON.parse(fs.readFileSync("dist/badges/v1/badge-endpoint-registry.json", "utf8"));
const kfdAgentManifest = JSON.parse(fs.readFileSync("dist/kfd/manifest.json", "utf8"));
const kfdRenderedRegistry = JSON.parse(fs.readFileSync("dist/kfd/registry.json", "utf8"));
const kfdRenderedStandards = JSON.parse(fs.readFileSync("dist/kfd/standards.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const buildchainContractLock = JSON.parse(fs.readFileSync("buildchain.contract-lock.json", "utf8"));
const pnpmLockText = fs.readFileSync("pnpm-lock.yaml", "utf8");
const kfdPropagationLockPath = "buildchain.upstreams/kfd.release.json";
const kfdPropagationLock = fs.existsSync(kfdPropagationLockPath)
  ? JSON.parse(fs.readFileSync(kfdPropagationLockPath, "utf8"))
  : undefined;
const buildchainPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/package.json", "utf8"));
const buildchainSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/dist/site/buildchain-site.json", "utf8"));
const kfdPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/package.json", "utf8"));
const kfdSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/site/kfd-site.json", "utf8"));
const kfdRegistry = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/registry.json", "utf8"));
const kfdStandards = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/standards.json", "utf8"));
const expectedBuildchainVersion = "2.10.2";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.19";
const requiredFiles = [
  ...requiredBaseFiles,
  ...kfdRegistry.entries.flatMap((entry) => [
    `dist/kfd/${entry.number}/index.html`,
    `dist/${entry.number}/index.html`,
  ]),
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`missing required file: ${file}`);
  }
}

function readPnpmLockPackage(packageName, version) {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '${escapedName}@${escapedVersion}':\\n(?:    .+\\n)*?    resolution: \\{integrity: ([^}]+)\\}`, "m");
  const match = pnpmLockText.match(pattern);
  if (!match) {
    throw new Error(`pnpm-lock.yaml missing ${packageName}@${version}`);
  }
  return {
    version,
    integrity: match[1].trim(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeBuildchainRoute(route) {
  const normalized = `/${String(route || "/").replace(/^\/+/, "")}`.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function buildchainRouteFile(route) {
  const normalized = normalizeBuildchainRoute(route);
  const segments = normalized === "/" ? [] : normalized.slice(1).split("/");
  return ["dist", "buildchain", ...segments, "index.html"].join("/");
}

function buildchainCanonicalPath(route) {
  const normalized = normalizeBuildchainRoute(route);
  return normalized === "/" ? "/" : `${normalized}/`;
}

function assertBadgeEndpointFile(badge, state) {
  const jsonPath = `dist/badges/v1/${badge}/${state}.json`;
  const svgPath = `dist/badges/v1/${badge}/${state}.svg`;
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`missing Buildchain badge JSON endpoint: ${jsonPath}`);
  }
  if (!fs.existsSync(svgPath)) {
    throw new Error(`missing Buildchain badge SVG endpoint: ${svgPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const svg = fs.readFileSync(svgPath, "utf8");
  for (const field of ["schemaVersion", "label", "message", "color"]) {
    if (payload[field] === undefined || payload[field] === "") {
      throw new Error(`Buildchain badge payload ${jsonPath} missing ${field}`);
    }
  }
  if (payload.logoPolicy?.placeholder !== "buildchain-monogram") {
    throw new Error(`Buildchain badge payload ${jsonPath} must preserve buildchain-monogram logo policy`);
  }
  if (!svg.startsWith("<svg ") || !svg.includes(`aria-label="${escapeHtml(`${payload.label}: ${payload.message}`)}"`)) {
    throw new Error(`Buildchain badge SVG endpoint did not render accessible label/message: ${svgPath}`);
  }
  if (!svg.includes(`fill="#${payload.color.replace(/^#/, "")}"`) || !svg.includes("buildchain-monogram") && !svg.includes("<path")) {
    throw new Error(`Buildchain badge SVG endpoint did not render payload color and placeholder mark: ${svgPath}`);
  }
  return payload;
}

function badgeRegistryStateNames(registry, badgeEntry) {
  if (Array.isArray(registry.supportedStates) && registry.supportedStates.length > 0) {
    return registry.supportedStates;
  }
  return (badgeEntry.states || []).map((entry) => (typeof entry === "string" ? entry : entry.state)).filter(Boolean);
}

const buildchainHomeWrites = renderSiteSource.match(/writeFile\(\s*"buildchain\/index\.html"/g) || [];
if (buildchainHomeWrites.length !== 1) {
  throw new Error(`render-site.mjs must have exactly one Buildchain homepage write path, found ${buildchainHomeWrites.length}`);
}
if (
  renderSiteSource.includes("grid-template-rows: 3.2em 7.2em auto") ||
  !renderSiteSource.includes(".foundation-layer") ||
  !renderSiteSource.includes("grid-template-rows: subgrid")
) {
  throw new Error("KFD foundation model cards must use subgrid rows so long commitments cannot overlap decision fields");
}

const buildchainLock = readPnpmLockPackage("@kungfu-tech/buildchain", expectedBuildchainVersion);
const kfdLock = readPnpmLockPackage("@kungfu-tech/kfd", expectedKfdVersion);

if (site.contract !== "libkungfu-dev-site-manifest-fixture") {
  throw new Error("site fixture contract mismatch");
}
if (core.contract !== "kungfu-spec-manifest-fixture") {
  throw new Error("core fixture contract mismatch");
}
if (packageJson.dependencies["@kungfu-tech/buildchain"] !== expectedBuildchainVersion) {
  throw new Error(`Buildchain dependency must be pinned to ${expectedBuildchainVersion}`);
}
if (packageJson.dependencies["@kungfu-tech/kfd"] !== expectedKfdVersion) {
  throw new Error(`KFD dependency must be pinned to ${expectedKfdVersion}`);
}
if (!buildchainLock || buildchainLock.version !== expectedBuildchainVersion) {
  throw new Error(`Buildchain lockfile entry must resolve to ${expectedBuildchainVersion}`);
}
if (!kfdLock || kfdLock.version !== expectedKfdVersion) {
  throw new Error(`KFD lockfile entry must resolve to ${expectedKfdVersion}`);
}
if (kfdPropagationLock) {
  if (kfdPropagationLock.contract !== "kungfu-buildchain-release-propagation-lock") {
    throw new Error("KFD release propagation lock contract mismatch");
  }
  if (kfdPropagationLock.upstream?.package?.name !== "@kungfu-tech/kfd") {
    throw new Error("KFD release propagation lock package mismatch");
  }
  if (kfdPropagationLock.downstream?.repository !== "kungfu-systems/site-libkungfu-dev") {
    throw new Error("KFD release propagation lock downstream mismatch");
  }
  if (kfdLock.integrity !== kfdPropagationLock.upstream.package.integrity) {
    throw new Error("KFD lockfile integrity must match Buildchain release propagation lock");
  }
}
if (buildchainPackage.version !== expectedBuildchainVersion) {
  throw new Error("installed Buildchain package version mismatch");
}
if (kfdPackage.version !== expectedKfdVersion) {
  throw new Error("installed KFD package version mismatch");
}
if (buildchainSite.contract !== "kungfu-buildchain-site-bundle") {
  throw new Error("Buildchain site bundle contract mismatch");
}
if (kfdSite.contract !== "kfd-site-bundle") {
  throw new Error("KFD site bundle contract mismatch");
}
if (!Array.isArray(buildchainSite.homepage.sections) || buildchainSite.homepage.sections.length === 0) {
  throw new Error("Buildchain site bundle must expose homepage.sections");
}
if (!Array.isArray(buildchainSite.homepage.displayPlan?.support) || !buildchainSite.homepage.rendererContract) {
  throw new Error("Buildchain site bundle must expose homepage.displayPlan support and homepage.rendererContract");
}
if (!Array.isArray(buildchainSite.pages) || buildchainSite.pages.length < 30) {
  throw new Error("Buildchain site bundle must expose the full page registry");
}
if (!Array.isArray(kfdSite.homepage.sections) || kfdSite.homepage.sections.length === 0) {
  throw new Error("KFD site bundle must expose homepage.sections");
}
if (!Array.isArray(kfdSite.homepage.displayPlan?.support) || !kfdSite.homepage.rendererContract) {
  throw new Error("KFD site bundle must expose homepage.displayPlan support and homepage.rendererContract");
}
if (kfdSite.homepage.rendererContract?.renderAsHomepageContent !== false) {
  throw new Error("KFD rendererContract must declare renderAsHomepageContent=false");
}
if (!Array.isArray(kfdRegistry.entries) || kfdRegistry.entries.length < 4) {
  throw new Error("KFD registry must expose decision entries");
}
if (
  buildchainContractLock.contract !== "kungfu-buildchain-contract-lock" ||
  buildchainContractLock.buildchain?.ref !== "v2" ||
  buildchainContractLock.buildchain?.majorLine !== "v2" ||
  buildchainContractLock.buildchain?.compatibilityPolicy !== "major-compatible" ||
  !buildchainContractLock.buildchain?.resolvedSha ||
  !buildchainContractLock.buildchain?.contractDigest ||
  !buildchainContractLock.buildchain?.compatibilityDigest
) {
  throw new Error("buildchain.contract-lock.json must record the accepted floating Buildchain v2 contract");
}
for (const [name, generatedManifest] of [["dist/manifest.json", manifest], ["dist/kfd/manifest.json", kfdAgentManifest]]) {
  if (!generatedManifest.generatedAt || !generatedManifest.timestampPolicy || generatedManifest.reproducible !== true) {
    throw new Error(`${name} must expose Buildchain surface timestamp and reproducibility policy`);
  }
  if (generatedManifest.timestampPolicyDetails?.contract !== "kungfu-buildchain-surface-timestamp-policy") {
    throw new Error(`${name} must expose Buildchain timestampPolicyDetails contract`);
  }
  if (generatedManifest.timestampPolicy === "ci-injected" && generatedManifest.generatedAt === "1970-01-01T00:00:00.000Z") {
    throw new Error(`${name} must not expose epoch generatedAt when timestampPolicy=ci-injected`);
  }
}
if (manifest.sourceBoundary.truthOwner !== "upstream-manifests") {
  throw new Error("dist manifest source boundary drifted");
}
if (manifest.upstreamPackages.buildchain.version !== expectedBuildchainVersion) {
  throw new Error(`dist manifest does not record Buildchain ${expectedBuildchainVersion}`);
}
const expectedBadgeStates = ["passed", "aligned", "declared", "planned", "draft", "downgraded", "failed", "missing"];
const expectedBadgeIds = ["kfd-1", "kfd-2", "kfd-3", "buildchain-release-passport"];
if (
  badgeEndpointRegistry.contract !== "kungfu-buildchain-badge-endpoint-registry" &&
  badgeEndpointRegistry.contract !== "kungfu-buildchain-readme-badge-endpoint-registry"
) {
  throw new Error("Buildchain badge endpoint registry contract mismatch");
}
if (badgeEndpointRegistry.version !== "v1") {
  throw new Error("Buildchain badge endpoint registry must expose v1 routes");
}
if (badgeEndpointRegistry.logoPolicy?.placeholder !== "buildchain-monogram") {
  throw new Error("Buildchain badge endpoint registry must keep the placeholder logo policy renderer-owned");
}
for (const state of expectedBadgeStates) {
  const registryStates = new Set(
    badgeEndpointRegistry.supportedStates ||
      badgeEndpointRegistry.badges?.flatMap((entry) => badgeRegistryStateNames(badgeEndpointRegistry, entry)) ||
      [],
  );
  if (!registryStates.has(state)) {
    throw new Error(`Buildchain badge endpoint registry missing state: ${state}`);
  }
}
for (const badge of expectedBadgeIds) {
  const badgeEntry = badgeEndpointRegistry.badges?.find((entry) => entry.id === badge);
  if (!badgeEntry) {
    throw new Error(`Buildchain badge endpoint registry missing badge: ${badge}`);
  }
  const badgeStates = new Set(badgeRegistryStateNames(badgeEndpointRegistry, badgeEntry));
  for (const state of expectedBadgeStates) {
    if (!badgeStates.has(state)) {
      throw new Error(`Buildchain badge endpoint registry missing ${badge}/${state}`);
    }
    assertBadgeEndpointFile(badge, state);
  }
  const passedPayload = assertBadgeEndpointFile(badge, "passed");
  if (!passedPayload.message.includes("passed")) {
    throw new Error(`Buildchain hosted README badge endpoint must render passed state for ${badge}`);
  }
}
if (manifest.upstreamPackages.buildchain.badgeEndpoints?.contract !== badgeEndpointRegistry.contract) {
  throw new Error("dist manifest does not record the Buildchain badge endpoint registry contract");
}
if (manifest.upstreamPackages.buildchain.badgeEndpoints?.renderedCount < expectedBadgeIds.length * expectedBadgeStates.length) {
  throw new Error("dist manifest does not record the minimum Buildchain badge endpoint route set");
}
if (!manifest.upstreamPackages.buildchain.badgeEndpoints?.routes?.some((entry) => entry.path === "/badges/v1/kfd-1/passed.svg")) {
  throw new Error("dist manifest does not record the hosted Buildchain badge SVG route");
}
if (manifest.upstreamPackages.kfd.version !== expectedKfdVersion) {
  throw new Error(`dist manifest does not record KFD ${expectedKfdVersion}`);
}
for (const pageEntry of buildchainSite.pages) {
  const route = normalizeBuildchainRoute(pageEntry.route);
  if (route === "/") continue;
  const file = buildchainRouteFile(route);
  if (!fs.existsSync(file)) {
    throw new Error(`missing generated Buildchain page: ${file}`);
  }
  const canonicalPath = buildchainCanonicalPath(route);
  if (!manifest.pages.some((page) => page.host === "buildchain.libkungfu.dev" && page.path === canonicalPath)) {
    throw new Error(`dist manifest does not record Buildchain canonical path: ${canonicalPath}`);
  }
  const html = fs.readFileSync(file, "utf8");
  if (
    !html.includes('class="panel doc-content"') ||
    !html.includes("<h2>Page metadata</h2>") ||
    !html.includes(`<dd><code>${escapeHtml(pageEntry.sourcePath)}</code></dd>`) ||
    !html.includes(`<dd><code>${escapeHtml(buildchainPackage.name)}@${escapeHtml(buildchainPackage.version)}</code></dd>`)
  ) {
    throw new Error(`Buildchain page did not render from bundle markdown: ${file}`);
  }
}
const infraContractHtml = fs.readFileSync("dist/buildchain/docs/infra-contract/index.html", "utf8");
if (
  !infraContractHtml.includes('class="doc-global-nav"') ||
  !infraContractHtml.includes('class="doc-page-sections"') ||
  infraContractHtml.includes('class="doc-toc" aria-label="Page sections"') ||
  !infraContractHtml.includes('href="../../"') ||
  !infraContractHtml.includes(">Overview</a>") ||
  !infraContractHtml.includes('href="../release-passport/"') ||
  !infraContractHtml.includes(">Release Passport</a>") ||
  !infraContractHtml.includes('href="../consumer-issue-reporting/"') ||
  !infraContractHtml.includes(">Consumer Issue Reporting</a>") ||
  !infraContractHtml.includes('href="#configuration"') ||
  !infraContractHtml.includes(">Configuration</a>")
) {
  throw new Error("Buildchain child pages must merge cross-page and in-page navigation in the left sidebar");
}
if (kfdPropagationLock && manifest.upstreamPackages.kfd.releaseLock?.lockSha256 !== kfdPropagationLock.lockSha256) {
  throw new Error("dist manifest does not record the KFD release propagation lock");
}
if (!manifest.pages.some((page) => page.host === "kfd.libkungfu.dev" && page.path === "/")) {
  throw new Error("dist manifest does not record kfd.libkungfu.dev canonical root");
}
for (const entry of kfdRegistry.entries) {
  const path = `/${entry.number}/`;
  if (!manifest.pages.some((page) => page.host === "kfd.libkungfu.dev" && page.path === path)) {
    throw new Error(`dist manifest does not record KFD canonical path: ${path}`);
  }
}
if (kfdAgentManifest.contract !== "kfd-agent-surface") {
  throw new Error("KFD agent manifest contract mismatch");
}
if (!Array.isArray(kfdAgentManifest.decisions) || kfdAgentManifest.decisions.length !== kfdRegistry.entries.length) {
  throw new Error("KFD agent manifest decision list mismatch");
}
if (kfdRenderedRegistry.contract !== kfdRegistry.contract) {
  throw new Error("rendered KFD registry contract mismatch");
}
if (kfdRenderedStandards.contract !== kfdStandards.contract) {
  throw new Error("rendered KFD standards contract mismatch");
}
const hubHtml = fs.readFileSync("dist/index.html", "utf8");
if (hubHtml.includes('name="robots"') && hubHtml.includes("noindex")) {
  throw new Error("production artifact must not embed robots noindex metadata");
}
if (hubHtml.includes(">Manifest</a>") || hubHtml.includes(">Agents</a>")) {
  throw new Error("human navigation should not expose machine-only Manifest or Agents links");
}
if (!hubHtml.includes('<a class="brand" href="https://libkungfu.dev/" data-local-href="/" aria-label="Back to libkungfu.dev home">libkungfu.dev</a>')) {
  throw new Error("human header brand must link to the canonical hub and expose a local fallback");
}
if (
  !hubHtml.includes('<nav aria-label="Primary"><a href="https://core.libkungfu.dev/" data-local-href="/core/">Core</a><a href="https://buildchain.libkungfu.dev/" data-local-href="/buildchain/">Buildchain</a><a href="https://kfd.libkungfu.dev/" data-local-href="/kfd/">KFD</a></nav>')
) {
  throw new Error("human header navigation must use canonical surface hosts with local fallbacks");
}
if (hubHtml.includes(">Hub</a>")) {
  throw new Error("human navigation should not expose the abstract Hub label; the brand link owns home navigation");
}
if (!hubHtml.includes("Kungfu Origin Technology Limited") || !hubHtml.includes("Open developer and agent substrate hub")) {
  throw new Error("human footer must expose the commercial steward and substrate boundary");
}
if (!hubHtml.includes("Public collaboration starts on") || !hubHtml.includes('href="https://github.com/kungfu-systems"')) {
  throw new Error("human footer must route collaboration through GitHub");
}
if (hubHtml.includes("<h3>Agent index</h3>") || hubHtml.includes("<h3>Site manifest</h3>")) {
  throw new Error("human homepage should not render machine-entry cards");
}
if (
  !hubHtml.includes("Kungfu product generation, in public") ||
  !hubHtml.includes(">Principles</p>") ||
  !hubHtml.includes(">First load-bearing layer</p>") ||
  !hubHtml.includes(">First complex product proof</p>") ||
  !hubHtml.includes(">Kungfu Tech</a>") ||
  !hubHtml.includes('href="https://kungfu.tech"')
) {
  throw new Error("human homepage must expose the KFD -> Buildchain -> Core generation chain and future product home");
}
if (hubHtml.includes("Open product generation substrate")) {
  throw new Error("homepage should not render a page-kicker eyebrow because it has no parent page");
}
if (/<a\b[^>]*\shref="\/(?:kfd|buildchain|core)\/"/.test(hubHtml)) {
  throw new Error("homepage cross-surface links must use canonical production hosts; local paths are only allowed as data-local-href fallbacks");
}
for (const [surfaceId, actionLabel] of [
  ["kfd", "Open KFD"],
  ["buildchain", "Open Buildchain"],
  ["core", "Open Core"],
]) {
  const surface = site.surfaces.find((entry) => entry.id === surfaceId);
  if (!surface) {
    throw new Error(`missing homepage surface fixture: ${surfaceId}`);
  }
  const surfacePaths = { kfd: "/kfd/", buildchain: "/buildchain/", core: "/core/" };
  const href = `https://${surface.host}/`;
  const titleLink = `<h3><a href="${escapeHtml(href)}" data-local-href="${escapeHtml(surfacePaths[surfaceId])}">${escapeHtml(surface.label)}</a></h3>`;
  const actionLink = `<a class="card-action" href="${escapeHtml(href)}" data-local-href="${escapeHtml(surfacePaths[surfaceId])}">${escapeHtml(actionLabel)}</a>`;
  if (!hubHtml.includes(titleLink) || !hubHtml.includes(actionLink)) {
    throw new Error(`homepage mechanism card must link to ${href}`);
  }
}
for (const [className, href, label] of [
  ["kfd", "https://kfd.libkungfu.dev/", "Open KFD"],
  ["buildchain", "https://buildchain.libkungfu.dev/", "Open Buildchain"],
  ["core", "https://core.libkungfu.dev/", "Open Core"],
  ["products", site.homepage.futureProducts.url, `Open ${site.homepage.futureProducts.displayName}`],
]) {
  const surfacePaths = { kfd: "/kfd/", buildchain: "/buildchain/", core: "/core/" };
  const localHref = surfacePaths[className] ? ` data-local-href="${escapeHtml(surfacePaths[className])}"` : "";
  const hotspot = `<a class="map-hotspot ${className}" href="${escapeHtml(href)}"${localHref} aria-label="${escapeHtml(label)}"></a>`;
  if (!hubHtml.includes(hotspot)) {
    throw new Error(`homepage substrate map is missing hotspot: ${hotspot}`);
  }
}
if (!hubHtml.includes('rel="alternate" type="application/json"') || !hubHtml.includes('href="/llms.txt"')) {
  throw new Error("human pages must expose machine entries through head alternate links");
}
for (const [label, html, state] of [
  ["Core", fs.readFileSync("dist/core/index.html", "utf8"), "Core substrate"],
  ["KFD", fs.readFileSync("dist/kfd/index.html", "utf8"), "Kung Fu Decisions"],
  ["Buildchain", fs.readFileSync("dist/buildchain/index.html", "utf8"), "Buildchain product surface"],
]) {
  if (!html.includes('<p class="eyebrow page-kicker"><a href="https://libkungfu.dev/" data-local-href="/" aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a>')) {
    throw new Error(`${label} page is missing the parent back link`);
  }
  const stateHtml = `<span class="page-kicker-state">${escapeHtml(state)}</span>`;
  if (!html.includes(stateHtml)) {
    throw new Error(`${label} page is missing the right-side page identity: ${stateHtml}`);
  }
}
const kfdHomeHtml = fs.readFileSync("dist/kfd/index.html", "utf8");
if (kfdHomeHtml.includes('name="robots"') && kfdHomeHtml.includes("noindex")) {
  throw new Error("KFD production artifact must not embed robots noindex metadata");
}
if (
  !kfdHomeHtml.includes('href="https://kfd.libkungfu.dev/manifest.json"') ||
  !kfdHomeHtml.includes('href="https://kfd.libkungfu.dev/llms.txt"')
) {
  throw new Error("KFD HTML must expose agent-first entries through head alternate links");
}
for (const sectionId of kfdSite.homepage.displayPlan.support) {
  const section = kfdSite.homepage.sections.find((entry) => entry.id === sectionId);
  if (!section) {
    throw new Error(`KFD displayPlan references missing homepage section: ${sectionId}`);
  }
  if (!kfdHomeHtml.includes(`data-kfd-section="${escapeHtml(sectionId)}"`) || !kfdHomeHtml.includes(`<h2>${escapeHtml(section.title)}</h2>`)) {
    throw new Error(`KFD homepage did not render support section: ${sectionId}`);
  }
}
if (!kfdHomeHtml.includes("Agent Quickstart") || !kfdHomeHtml.includes("Decision metadata")) {
  throw new Error("KFD homepage must render support sections");
}
const rendererContract = kfdSite.homepage.rendererContract;
if (!rendererContract || !kfdHomeHtml.includes(`<dd><code>${escapeHtml(rendererContract.id)}</code></dd>`)) {
  throw new Error("KFD homepage must expose the renderer contract in machine facts");
}
if (kfdHomeHtml.includes(`data-kfd-section="${escapeHtml(rendererContract.id)}"`)) {
  throw new Error("KFD renderer contract must not render as ordinary homepage content");
}
if (kfdHomeHtml.includes('href="docs/')) {
  throw new Error("KFD package-relative docs links must be rewritten away from site-local missing paths");
}
if (
  !kfdHomeHtml.includes("Practice guidelines") ||
  !kfdHomeHtml.includes("Timelines must declare their observer") ||
  !kfdHomeHtml.includes('href="/4/"') ||
  !kfdHomeHtml.includes("Adoption boundary")
) {
  throw new Error("KFD homepage must render alpha.19 practice guidance and KFD-4 links");
}
for (const entry of kfdSite.homepage.foundationTriad.commitments) {
  const match = /^KFD-(\d+)\b/.exec(entry.id);
  if (!match) {
    throw new Error(`KFD foundation triad commitment does not expose a KFD number: ${entry.id}`);
  }
  const titleLink = `<article class="panel foundation-triad-card">\n              <h3><a href="/${match[1]}/">${escapeHtml(entry.id)}</a></h3>`;
  if (!kfdHomeHtml.includes(titleLink)) {
    throw new Error(`KFD foundation triad commitment title is missing link: ${titleLink}`);
  }
}
for (const layer of kfdSite.homepage.foundationModel.layers) {
  const match = /^KFD-(\d+)\b/.exec(layer.decision);
  if (!match) {
    throw new Error(`KFD foundation triad decision does not expose a KFD number: ${layer.decision}`);
  }
  const number = match[1];
  const href = `href="/${number}/"`;
  if (!kfdHomeHtml.includes(href)) {
    throw new Error(`KFD home page is missing decision link: ${href}`);
  }
  const titleLink = `<h3><a href="/${number}/">${escapeHtml(layer.layer)}</a></h3>`;
  if (!kfdHomeHtml.includes(titleLink)) {
    throw new Error(`KFD foundation triad title is missing link: ${titleLink}`);
  }
  const decisionLink = `<dd><p><a href="/${number}/">${escapeHtml(layer.decision)}</a></p></dd>`;
  if (!kfdHomeHtml.includes(decisionLink)) {
    throw new Error(`KFD foundation triad decision label is missing link: ${decisionLink}`);
  }
}
const kfdDecisionHtmlByNumber = new Map(
  kfdRegistry.entries.map((entry) => [String(entry.number), fs.readFileSync(`dist/kfd/${entry.number}/index.html`, "utf8")]),
);
const kfdOneHtml = kfdDecisionHtmlByNumber.get("1");
const kfdThreeHtml = kfdDecisionHtmlByNumber.get("3");
const kfdFourHtml = kfdDecisionHtmlByNumber.get("4");
for (const entry of kfdRegistry.entries) {
  const number = String(entry.number);
  const canonicalHtml = fs.readFileSync(`dist/kfd/${number}/index.html`, "utf8");
  const subdomainAliasHtml = fs.readFileSync(`dist/${number}/index.html`, "utf8");
  if (subdomainAliasHtml !== canonicalHtml) {
    throw new Error(`KFD subdomain route alias drifted: dist/${number}/index.html`);
  }
}
for (const entry of kfdRegistry.entries) {
  const html = kfdDecisionHtmlByNumber.get(String(entry.number));
  const label = entry.id;
  if (!html.includes('class="doc-toc"') || !html.includes('aria-label="Decision sections"')) {
    throw new Error(`${label} page is missing the decision section navigation`);
  }
  if (
    !html.includes('class="doc-global-nav" aria-label="Kung Fu Decisions"') ||
    !html.includes('<a href="https://kfd.libkungfu.dev/" data-local-href="/kfd/">Overview</a>')
  ) {
    throw new Error(`${label} page is missing the KFD cross-decision navigation`);
  }
  const currentDecisionLink = `<a href="/${escapeHtml(entry.number)}/" aria-current="page">${escapeHtml(entry.id)}</a>`;
  if (!html.includes(currentDecisionLink)) {
    throw new Error(`${label} page is missing the current KFD marker in cross-decision navigation`);
  }
  if (!html.includes('<p class="eyebrow page-kicker"><a href="https://kfd.libkungfu.dev/" data-local-href="/kfd/" aria-label="Back to KFD home">Back to KFD home</a>')) {
    throw new Error(`${label} page is missing the explicit KFD home back link`);
  }
  const stateHtml = `<span class="page-kicker-state">${escapeHtml(entry.kind)} / ${escapeHtml(entry.status)}</span>`;
  if (!html.includes(stateHtml)) {
    throw new Error(`${label} page is missing the non-linked decision state: ${stateHtml}`);
  }
  if (html.includes(`aria-label="Back to KFD home">${escapeHtml(entry.kind)} / ${escapeHtml(entry.status)}</a>`)) {
    throw new Error(`${label} page must not use the decision state as the back link label`);
  }
  if (!html.includes('class="panel doc-content"') || !html.includes('tabindex="-1"')) {
    throw new Error(`${label} markdown content is missing anchored headings`);
  }
}
if (!kfdOneHtml.includes('href="#the-decision-log"') || !kfdThreeHtml.includes('href="#three-commitments"')) {
  throw new Error("KFD decision pages must expose section links in the generated TOC");
}
if (!kfdFourHtml || !kfdFourHtml.includes("Timelines must declare their observer") || !kfdFourHtml.includes('href="#practice-role"')) {
  throw new Error("KFD-4 page must render observer-timeline content and section links");
}
if (!kfdOneHtml.includes("<table>") || !kfdOneHtml.includes("<th>Condition</th>") || !kfdOneHtml.includes("<td><strong>major</strong></td>")) {
  throw new Error("KFD-1 markdown table was not rendered as an HTML table");
}
if (!kfdOneHtml.includes("<th>Date</th>") || !kfdOneHtml.includes("<td>open-minor</td>")) {
  throw new Error("KFD-1 fenced markdown table was not rendered as an HTML table");
}
if (kfdOneHtml.includes("<p>is to content addressing")) {
  throw new Error("KFD-1 wrapped list item was split into a paragraph");
}
NODE

grep -q 'libkungfu.dev' dist/index.html
grep -q 'Open developer and agent substrate hub' dist/index.html
grep -q 'core.libkungfu.dev' dist/core/index.html
grep -q 'buildchain.libkungfu.dev' dist/buildchain/index.html
grep -q 'kfd.libkungfu.dev' dist/kfd/index.html
grep -q 'Fixture source' dist/index.html
grep -q 'pinned release artifacts' dist/index.html
grep -q 'Kungfu Origin Technology Limited' dist/index.html
grep -q '@kungfu-tech/buildchain' dist/buildchain/index.html
grep -q '2.10.2' dist/buildchain/index.html
grep -q 'Bundle facts' dist/buildchain/index.html
grep -q 'Install and Verify' dist/buildchain/index.html
grep -q 'Use Buildchain' dist/buildchain/index.html
grep -q 'Site Fact Source' dist/buildchain/index.html
grep -q 'class="doc-global-nav"' dist/buildchain/index.html
grep -q 'homepage-content-contract' dist/buildchain/index.html
grep -q 'Buildchain Release Passport' dist/buildchain/index.html
grep -q 'CLI command registry' dist/buildchain/index.html
grep -q 'workflow-registry.json' dist/buildchain/index.html
grep -q 'buildchain.release.json' dist/buildchain/index.html
grep -q '@kungfu-tech/kfd' dist/kfd/index.html
grep -q 'KFD — Kung Fu Decisions' dist/kfd/index.html
grep -q 'non-drifting facts' dist/kfd/index.html
grep -q 'KFD-1' dist/kfd/1/index.html
grep -q 'KFD-4' dist/kfd/4/index.html
grep -q 'Timelines must declare their observer' dist/kfd/4/index.html
if grep -q '0.0.0-fixture' dist/buildchain/index.html; then
  echo "error: Buildchain page still contains fixture version" >&2
  exit 1
fi
if grep -q 'Documentation pages\|Explore all Buildchain pages' dist/buildchain/index.html; then
  echo "error: Buildchain homepage should use the sidebar navigation instead of child-page card sections" >&2
  exit 1
fi
grep -q 'docs_url' dist/core/index.html
grep -q 'llms-full.txt' dist/llms.txt

echo "site-libkungfu-dev checks passed"
