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
const crypto = require("crypto");
const { loadPublicationPackageSet, readPublicationArtifact } = require("./scripts/publication-packages.cjs");
const renderSiteSource = fs.readFileSync("scripts/render-site.mjs", "utf8");
const requiredBaseFiles = [
  "src/fixtures/site-manifest.json",
  "src/fixtures/core-spec-manifest.json",
  "src/publication-packages.json",
  "scripts/publication-packages.cjs",
  "src/fixtures/buildchain-badge-endpoint-registry.json",
  "src/fixtures/badges/v1/kfd-1/passed.json",
  "src/fixtures/badges/v1/kfd-2/passed.json",
  "src/fixtures/badges/v1/kfd-3/passed.json",
  "src/fixtures/badges/v1/buildchain-release-passport/passed.json",
  ".buildchain/buildchain.toml",
  ".buildchain/contract-lock.json",
  "pnpm-lock.yaml",
  "dist/index.html",
  "dist/core/index.html",
  "dist/buildchain/index.html",
  "dist/kfd/index.html",
  "dist/kfd/foundation/index.html",
  "dist/foundation/index.html",
  "dist/kfd/cases/index.html",
  "dist/cases/index.html",
  "dist/kfd/manifest.json",
  "dist/kfd/registry.json",
  "dist/kfd/standards.json",
  "dist/kfd/llms.txt",
  "dist/badges/v1/badge-endpoint-registry.json",
  "dist/badges/v1/kfd-1/passed.svg",
  "dist/badges/v1/kfd-2/passed.svg",
  "dist/badges/v1/kfd-3/passed.svg",
  "dist/badges/v1/buildchain-release-passport/passed.svg",
  "dist/buildchain/badges/v1/badge-endpoint-registry.json",
  "dist/buildchain/badges/v1/kfd-1/passed.svg",
  "dist/buildchain/badges/v1/kfd-2/passed.svg",
  "dist/buildchain/badges/v1/kfd-3/passed.svg",
  "dist/buildchain/badges/v1/buildchain-release-passport/passed.svg",
  "dist/badges/v1/kfd-1/passed.json",
  "dist/badges/v1/kfd-2/passed.json",
  "dist/badges/v1/kfd-3/passed.json",
  "dist/badges/v1/buildchain-release-passport/passed.json",
  "dist/manifest.json",
  "dist/llms.txt",
  "dist/papers/index.html",
  "dist/papers/manifest.json",
  "dist/papers/registry.json",
  "dist/papers/llms.txt",
];

const site = JSON.parse(fs.readFileSync("src/fixtures/site-manifest.json", "utf8"));
const core = JSON.parse(fs.readFileSync("src/fixtures/core-spec-manifest.json", "utf8"));
const publicationPackageSet = JSON.parse(fs.readFileSync("src/publication-packages.json", "utf8"));
const publicationSource = loadPublicationPackageSet(process.cwd());
const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));
const publicationManifest = JSON.parse(fs.readFileSync("dist/papers/manifest.json", "utf8"));
const publicationRenderedRegistry = JSON.parse(fs.readFileSync("dist/papers/registry.json", "utf8"));
const badgeEndpointRegistry = JSON.parse(fs.readFileSync("dist/badges/v1/badge-endpoint-registry.json", "utf8"));
const kfdAgentManifest = JSON.parse(fs.readFileSync("dist/kfd/manifest.json", "utf8"));
const kfdRenderedRegistry = JSON.parse(fs.readFileSync("dist/kfd/registry.json", "utf8"));
const kfdRenderedCandidateRegistry = JSON.parse(fs.readFileSync("dist/kfd/drafts/registry.json", "utf8"));
const kfdRenderedStandards = JSON.parse(fs.readFileSync("dist/kfd/standards.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const buildchainContractLock = JSON.parse(fs.readFileSync(".buildchain/contract-lock.json", "utf8"));
const buildchainAlphaContractLock = JSON.parse(fs.readFileSync(".buildchain/alpha-contract-lock.json", "utf8"));
const pnpmLockText = fs.readFileSync("pnpm-lock.yaml", "utf8");
const kfdPropagationLockPath = fs.existsSync(".buildchain/upstreams/kfd.release.json")
  ? ".buildchain/upstreams/kfd.release.json"
  : "buildchain.upstreams/kfd.release.json";
const kfdPropagationLock = fs.existsSync(kfdPropagationLockPath)
  ? JSON.parse(fs.readFileSync(kfdPropagationLockPath, "utf8"))
  : undefined;
const buildchainPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/package.json", "utf8"));
const buildchainSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/dist/site/buildchain-site.json", "utf8"));
const kfdPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/package.json", "utf8"));
const kfdSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/site/kfd-site.json", "utf8"));
const kfdRegistry = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/registry.json", "utf8"));
const kfdCandidateRegistry = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/drafts/registry.json", "utf8"));
const kfdStandards = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/standards.json", "utf8"));
const expectedBuildchainVersion = "2.11.13";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.31";
const expectedPaperPackages = publicationPackageSet.packages;
const kfdUsagePages = kfdSite.decisionPages?.usagePages?.pages || [];
const kfdUsagePageByDecisionNumber = new Map(kfdUsagePages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const kfdFormalPages = kfdSite.decisionPages?.formalPages?.pages || [];
const kfdFormalPageByDecisionNumber = new Map(kfdFormalPages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const kfdCandidatePages = kfdSite.candidatePages?.pages || [];
const requiredFiles = [
  ...requiredBaseFiles,
  "dist/kfd/drafts/index.html",
  "dist/drafts/index.html",
  "dist/kfd/drafts/registry.json",
  "dist/drafts/registry.json",
  ...kfdCandidatePages.flatMap((entry) => [
    `dist/kfd/drafts/${entry.id}/index.html`,
    `dist/drafts/${entry.id}/index.html`,
  ]),
  ...kfdRegistry.entries.flatMap((entry) => [
    `dist/kfd/${entry.number}/index.html`,
    `dist/${entry.number}/index.html`,
    `dist/kfd/${entry.number}/usage/index.html`,
    `dist/${entry.number}/usage/index.html`,
    `dist/kfd/${entry.number}/formal/index.html`,
    `dist/${entry.number}/formal/index.html`,
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

function sha256File(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

function expectedSurfaceHref(id) {
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

function expectedSurfaceHost(id) {
  return new URL(expectedSurfaceHref(id)).host;
}

function expectedSurfaceEndpoint(id, pathPart = "") {
  return new URL(pathPart, expectedSurfaceHref(id)).toString();
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
  const buildchainJsonPath = `dist/buildchain/badges/v1/${badge}/${state}.json`;
  const buildchainSvgPath = `dist/buildchain/badges/v1/${badge}/${state}.svg`;
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`missing Buildchain badge JSON endpoint: ${jsonPath}`);
  }
  if (!fs.existsSync(svgPath)) {
    throw new Error(`missing Buildchain badge SVG endpoint: ${svgPath}`);
  }
  if (!fs.existsSync(buildchainJsonPath)) {
    throw new Error(`missing Buildchain host badge JSON endpoint: ${buildchainJsonPath}`);
  }
  if (!fs.existsSync(buildchainSvgPath)) {
    throw new Error(`missing Buildchain host badge SVG endpoint: ${buildchainSvgPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const svg = fs.readFileSync(svgPath, "utf8");
  const buildchainPayload = fs.readFileSync(buildchainJsonPath, "utf8");
  const buildchainSvg = fs.readFileSync(buildchainSvgPath, "utf8");
  if (buildchainPayload !== fs.readFileSync(jsonPath, "utf8") || buildchainSvg !== svg) {
    throw new Error(`Buildchain host badge mirror drifted for ${badge}/${state}`);
  }
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
const paperLocks = expectedPaperPackages.map((entry) => ({
  ...entry,
  lock: readPnpmLockPackage(entry.name, entry.version),
  installed: JSON.parse(fs.readFileSync(`node_modules/${entry.name}/package.json`, "utf8")),
}));

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
if (publicationPackageSet.contract !== "libkungfu-dev-publication-package-set" || expectedPaperPackages.length !== 3) {
  throw new Error("publication package set must declare the three paper packages");
}
for (const entry of paperLocks) {
  if (packageJson.dependencies[entry.name] !== entry.version) {
    throw new Error(`paper dependency must be pinned to ${entry.name}@${entry.version}`);
  }
  if (entry.lock.version !== entry.version || entry.installed.name !== entry.name || entry.installed.version !== entry.version) {
    throw new Error(`paper package identity or lock mismatch: ${entry.name}@${entry.version}`);
  }
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
if (!Array.isArray(kfdUsagePages) || kfdUsagePages.length !== kfdRegistry.entries.length) {
  throw new Error("KFD site bundle must expose one usage page for each decision entry");
}
if (!Array.isArray(kfdFormalPages) || kfdFormalPages.length !== kfdRegistry.entries.length) {
  throw new Error("KFD site bundle must expose one formal reference page for each decision entry");
}
if (
  kfdSite.candidatePages?.source !== "drafts/registry.json"
  || kfdSite.candidatePages?.normative !== false
  || !Array.isArray(kfdCandidatePages)
  || kfdCandidatePages.length === 0
) {
  throw new Error("KFD site bundle must expose governed non-normative candidate pages");
}
for (const legacyBuildchainPath of ["buildchain.toml", "buildchain.contract-lock.json"]) {
  if (fs.existsSync(legacyBuildchainPath)) {
    throw new Error(`${legacyBuildchainPath} must not be kept at repository root; use .buildchain/ instead`);
  }
}

for (const [channel, lock, expectedRef] of [
  ["stable", buildchainContractLock, "v2"],
  ["alpha", buildchainAlphaContractLock, "v2-alpha"],
]) {
  if (
    lock.contract !== "kungfu-buildchain-contract-lock" ||
    lock.buildchain?.ref !== expectedRef ||
    lock.buildchain?.majorLine !== "v2" ||
    lock.buildchain?.compatibilityPolicy !== "major-compatible" ||
    !lock.buildchain?.resolvedSha ||
    !lock.buildchain?.contractDigest ||
    !lock.buildchain?.compatibilityDigest
  ) {
    throw new Error(`.buildchain ${channel} contract lock must record the accepted floating Buildchain ${expectedRef} contract`);
  }
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
if (publicationSource.kind !== "paper-packages" || publicationSource.registry.contract !== "kungfu-buildchain-publication-release-registry") {
  throw new Error("publication package aggregation contract mismatch");
}
if (publicationRenderedRegistry.contract !== publicationSource.registry.contract) {
  throw new Error("rendered publication registry contract mismatch");
}
if (publicationRenderedRegistry.publications?.length !== 3 || publicationRenderedRegistry.publications.some((entry) => entry.id === "publication-archive-fixture")) {
  throw new Error("rendered publication registry must expose the three real papers and no fixture publication");
}
if (publicationManifest.contract !== "libkungfu-dev-publication-archive-surface") {
  throw new Error("publication archive manifest contract mismatch");
}
if (
  publicationManifest.canonicalHost !== expectedSurfaceHost("papers") ||
  publicationManifest.source?.kind !== "paper-packages" ||
  publicationManifest.source?.registryContract !== publicationSource.registry.contract ||
  publicationManifest.source?.packages?.length !== 3 ||
  publicationManifest.source.packages.some((entry) => !entry.lockIntegrity) ||
  publicationManifest.archivePolicy?.deploymentBoundary !== "append-only immutable version prefixes"
) {
  throw new Error("publication archive manifest must expose channel-aware host, paper package sources, and append-only deployment boundary");
}
if (manifest.upstreamPackages.buildchain.publicationRegistry !== undefined) {
  throw new Error("paper publication facts must not be attributed to the Buildchain package");
}
if (
  manifest.upstreamPackages.papers?.contract !== publicationSource.registry.contract ||
  manifest.upstreamPackages.papers?.sourceKind !== "paper-packages" ||
  manifest.upstreamPackages.papers?.packages?.length !== 3 ||
  manifest.upstreamPackages.papers.packages.some((entry) => !entry.lockIntegrity)
) {
  throw new Error("dist manifest does not record the real paper package source boundary");
}
if (manifest.upstreamPackages.papers?.immutableArtifactCount < 12) {
  throw new Error("dist manifest does not record immutable publication artifacts");
}
for (const publication of publicationRenderedRegistry.publications || []) {
  const renderedPublication = publicationManifest.publications.find((entry) => entry.id === publication.id);
  if (!renderedPublication) {
    throw new Error(`publication manifest missing publication: ${publication.id}`);
  }
  if (!renderedPublication.latest?.url || !renderedPublication.latest.url.startsWith(expectedSurfaceHref("papers"))) {
    throw new Error(`publication ${publication.id} latest URL must be channel-aware`);
  }
  for (const version of publication.versions || []) {
    if (!version.immutable || !version.immutablePath || !version.immutablePath.includes(`/v${version.version}/`)) {
      throw new Error(`publication version must declare immutable semantic path: ${publication.id}@${version.version}`);
    }
    const renderedVersion = renderedPublication.versions.find((entry) => entry.version === version.version);
    if (!renderedVersion || renderedVersion.immutablePath !== version.immutablePath || !renderedVersion.immutableUrl.startsWith(expectedSurfaceHref("papers"))) {
      throw new Error(`publication manifest missing immutable version route: ${publication.id}@${version.version}`);
    }
    const versionIndex = `dist/papers${version.immutablePath}index.html`;
    if (!fs.existsSync(versionIndex)) {
      throw new Error(`missing immutable publication version index: ${versionIndex}`);
    }
    const versionHtml = fs.readFileSync(versionIndex, "utf8");
    if (!versionHtml.includes("Immutable archive prefix") || !versionHtml.includes(escapeHtml(version.immutablePath))) {
      throw new Error(`publication version page does not expose immutable archive prefix: ${publication.id}@${version.version}`);
    }
    const expectedArtifacts = [
      ...version.artifacts,
      { ...version.manifest, kind: "manifest" },
      { ...version.source.bundle, kind: "source" },
      { ...version.passport, kind: "passport" },
    ];
    for (const artifact of expectedArtifacts) {
      const artifactPath = `dist/papers${version.immutablePath}${artifact.path}`;
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`declared immutable publication artifact disappeared: ${artifactPath}`);
      }
      const digest = sha256File(artifactPath);
      if (digest !== artifact.sha256) {
        throw new Error(`immutable publication artifact digest drifted: ${artifactPath}`);
      }
      if (!fs.readFileSync(artifactPath).equals(readPublicationArtifact(artifact))) {
        throw new Error(`immutable publication artifact does not match its npm package source: ${artifactPath}`);
      }
      const manifestArtifact = renderedVersion.artifacts.find((entry) => entry.path === artifact.path);
      if (!manifestArtifact || manifestArtifact.sha256 !== artifact.sha256 || !manifestArtifact.url.startsWith(expectedSurfaceHref("papers"))) {
        throw new Error(`publication manifest missing immutable artifact facts: ${publication.id}@${version.version}/${artifact.path}`);
      }
      if (!manifest.pages.some((page) => page.host === expectedSurfaceHost("papers") && page.path === `${version.immutablePath}${artifact.path}` && page.immutable === true && page.sha256 === artifact.sha256)) {
        throw new Error(`dist manifest missing immutable artifact route: ${publication.id}@${version.version}/${artifact.path}`);
      }
    }
  }
  const publicationPage = fs.readFileSync(`dist/papers/${publication.id}/index.html`, "utf8");
  if (!publicationPage.includes(escapeHtml(publication.title)) || !publicationPage.includes("Read PDF") || !publicationPage.includes("Versions and evidence")) {
    throw new Error(`publication page is missing human reader entrypoints: ${publication.id}`);
  }
}
const papersIndex = fs.readFileSync("dist/papers/index.html", "utf8");
for (const publication of publicationRenderedRegistry.publications) {
  if (!papersIndex.includes(escapeHtml(publication.title))) {
    throw new Error(`papers index missing publication: ${publication.id}`);
  }
}
if (papersIndex.includes("Publication Archive Fixture") || !papersIndex.includes("Kungfu Papers")) {
  throw new Error("papers index must be human-first and free of fixture content");
}
if (manifest.upstreamPackages.buildchain.version !== expectedBuildchainVersion) {
  throw new Error(`dist manifest does not record Buildchain ${expectedBuildchainVersion}`);
}
const buildchainHomeHtml = fs.readFileSync("dist/buildchain/index.html", "utf8");
const expectedBuildchainBadgeHost = expectedSurfaceEndpoint("buildchain", "badges/v1/");
if (!buildchainHomeHtml.includes('class="lead badge-strip"')) {
  throw new Error("Buildchain homepage must render the README badge block as a badge strip");
}
if (
  !buildchainHomeHtml.includes(`<img src="${escapeHtml(`${expectedBuildchainBadgeHost}kfd-1/passed.svg`)}"`) ||
  !buildchainHomeHtml.includes(`<img src="${escapeHtml(`${expectedBuildchainBadgeHost}buildchain-release-passport/passed.svg`)}"`)
) {
  throw new Error("Buildchain homepage badges must render as channel-aware image tags");
}
if (buildchainHomeHtml.includes("<!-- buildchain:badges:") || buildchainHomeHtml.includes("[![KFD-1:")) {
  throw new Error("Buildchain homepage must not expose raw README badge markdown");
}
const expectedBadgeStates = ["passed", "aligned", "declared", "planned", "draft", "downgraded", "failed", "missing"];
const expectedBadgeIds = [
  ...kfdRegistry.entries.map((entry) => `kfd-${entry.number}`),
  "buildchain-release-passport",
];
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
for (const entry of kfdRegistry.entries) {
  const badgePath = `/badges/v1/kfd-${entry.number}/passed.svg`;
  if (!manifest.upstreamPackages.buildchain.badgeEndpoints?.routes?.some((route) => (
    route.host === expectedSurfaceHost("buildchain") &&
    route.path === badgePath &&
    route.deployedPaths?.includes(`/buildchain${badgePath}`)
  ))) {
    throw new Error(`dist manifest does not record the hosted KFD badge SVG route: ${badgePath}`);
  }
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
  if (!manifest.pages.some((page) => page.host === expectedSurfaceHost("buildchain") && page.path === canonicalPath)) {
    throw new Error(`dist manifest does not record Buildchain channel path: ${expectedSurfaceHost("buildchain")}${canonicalPath}`);
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
if (manifest.canonicalHost !== expectedSurfaceHost("hub")) {
  throw new Error(`dist manifest canonicalHost must match channel hub host: ${expectedSurfaceHost("hub")}`);
}
if (!manifest.pages.some((page) => page.host === expectedSurfaceHost("kfd") && page.path === "/")) {
  throw new Error(`dist manifest does not record KFD channel root: ${expectedSurfaceHost("kfd")}`);
}
for (const entry of kfdRegistry.entries) {
  const path = `/${entry.number}/`;
  if (!manifest.pages.some((page) => page.host === expectedSurfaceHost("kfd") && page.path === path)) {
    throw new Error(`dist manifest does not record KFD channel path: ${expectedSurfaceHost("kfd")}${path}`);
  }
  const usagePath = `/${entry.number}/usage/`;
  if (!manifest.pages.some((page) => page.host === expectedSurfaceHost("kfd") && page.path === usagePath)) {
    throw new Error(`dist manifest does not record KFD usage path: ${expectedSurfaceHost("kfd")}${usagePath}`);
  }
  const formalPath = `/${entry.number}/formal/`;
  if (!manifest.pages.some((page) => page.host === expectedSurfaceHost("kfd") && page.path === formalPath)) {
    throw new Error(`dist manifest does not record KFD formal reference path: ${expectedSurfaceHost("kfd")}${formalPath}`);
  }
}
if (
  !manifest.pages.some(
    (page) =>
      page.host === expectedSurfaceHost("kfd")
      && page.path === kfdSite.candidatePages.indexUrl
      && page.source.endsWith(`/${kfdSite.kfdCandidates.indexSource}`),
  )
) {
  throw new Error("dist manifest does not record the KFD candidate index");
}
for (const candidate of kfdCandidatePages) {
  if (
    !manifest.pages.some(
      (page) =>
        page.host === expectedSurfaceHost("kfd")
        && page.path === candidate.url
        && page.source.endsWith(`/${candidate.sourcePath}`),
    )
  ) {
    throw new Error(`dist manifest does not record KFD candidate: ${candidate.id}`);
  }
}
if (kfdAgentManifest.contract !== "kfd-agent-surface") {
  throw new Error("KFD agent manifest contract mismatch");
}
if (
  kfdAgentManifest.canonicalHost !== expectedSurfaceHost("kfd") ||
  kfdAgentManifest.humanEntry !== expectedSurfaceHref("kfd") ||
  kfdAgentManifest.agentEntries?.manifest !== expectedSurfaceEndpoint("kfd", "manifest.json") ||
  kfdAgentManifest.agentEntries?.llms !== expectedSurfaceEndpoint("kfd", "llms.txt")
) {
  throw new Error("KFD agent manifest must expose channel-aware KFD entries");
}
if (!Array.isArray(kfdAgentManifest.decisions) || kfdAgentManifest.decisions.length !== kfdRegistry.entries.length) {
  throw new Error("KFD agent manifest decision list mismatch");
}
if (
  kfdAgentManifest.agentEntries?.candidateRegistry !== expectedSurfaceEndpoint("kfd", "drafts/registry.json")
  || kfdAgentManifest.candidates?.normative !== false
  || kfdAgentManifest.candidates?.entries?.length !== kfdCandidatePages.length
) {
  throw new Error("KFD agent manifest candidate surface mismatch");
}
for (const candidate of kfdAgentManifest.candidates.entries) {
  if (
    candidate.relationship !== kfdSite.candidatePages.relationship
    || candidate.normative !== false
    || !candidate.claimBoundary
    || !kfdAgentManifest.readOrder.includes(candidate.url)
  ) {
    throw new Error(`KFD agent manifest is missing candidate facts for ${candidate.id}`);
  }
}
for (const entry of kfdAgentManifest.decisions) {
  if (!entry.usage?.url || !entry.usage?.source || !kfdAgentManifest.readOrder.includes(entry.usage.url)) {
    throw new Error(`KFD agent manifest is missing usage entry for ${entry.id}`);
  }
  if (
    !entry.formal?.url
    || !entry.formal?.source
    || entry.formal?.relationship !== "formal-reference-child-of-decision"
    || entry.formal?.normative !== false
    || !entry.formal?.sha256
    || !kfdAgentManifest.readOrder.includes(entry.formal.url)
  ) {
    throw new Error(`KFD agent manifest is missing formal reference entry for ${entry.id}`);
  }
}
if (kfdRenderedRegistry.contract !== kfdRegistry.contract) {
  throw new Error("rendered KFD registry contract mismatch");
}
if (
  kfdRenderedCandidateRegistry.contract !== "kfd-candidate-registry"
  || JSON.stringify(kfdRenderedCandidateRegistry) !== JSON.stringify(kfdCandidateRegistry)
) {
  throw new Error("rendered KFD candidate registry contract mismatch");
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
if (!hubHtml.includes(`<a class="brand" href="${escapeHtml(expectedSurfaceHref("hub"))}" data-local-href="/" aria-label="Back to libkungfu.dev home">libkungfu.dev</a>`)) {
  throw new Error("human header brand must link to the canonical hub and expose a local fallback");
}
if (
  !hubHtml.includes(`<nav aria-label="Primary"><a href="${escapeHtml(expectedSurfaceHref("core"))}" data-local-href="/core/">Core</a><a href="${escapeHtml(expectedSurfaceHref("buildchain"))}" data-local-href="/buildchain/">Buildchain</a><a href="${escapeHtml(expectedSurfaceHref("kfd"))}" data-local-href="/kfd/">KFD</a><a href="${escapeHtml(expectedSurfaceHref("papers"))}" data-local-href="/papers/">Papers</a></nav>`)
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
  throw new Error("homepage cross-surface links must use channel surface hosts; local paths are only allowed as data-local-href fallbacks");
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
  const href = expectedSurfaceHref(surfaceId);
  const titleLink = `<h3><a href="${escapeHtml(href)}" data-local-href="${escapeHtml(surfacePaths[surfaceId])}">${escapeHtml(surface.label)}</a></h3>`;
  const actionLink = `<a class="card-action" href="${escapeHtml(href)}" data-local-href="${escapeHtml(surfacePaths[surfaceId])}">${escapeHtml(actionLabel)}</a>`;
  if (!hubHtml.includes(titleLink) || !hubHtml.includes(actionLink)) {
    throw new Error(`homepage mechanism card must link to ${href}`);
  }
}
for (const [className, href, label] of [
  ["kfd", expectedSurfaceHref("kfd"), "Open KFD"],
  ["buildchain", expectedSurfaceHref("buildchain"), "Open Buildchain"],
  ["core", expectedSurfaceHref("core"), "Open Core"],
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
  if (!html.includes(`<p class="eyebrow page-kicker"><a href="${escapeHtml(expectedSurfaceHref("hub"))}" data-local-href="/" aria-label="Back to libkungfu.dev home">Back to libkungfu.dev</a>`)) {
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
  !kfdHomeHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "manifest.json"))}"`) ||
  !kfdHomeHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "llms.txt"))}"`) ||
  !kfdHomeHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "drafts/registry.json"))}"`)
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
if (!rendererContract) {
  throw new Error("KFD site bundle must expose the homepage renderer contract");
}
if (kfdHomeHtml.includes("<h2>Machine facts</h2>") || kfdHomeHtml.includes(`<dd><code>${escapeHtml(rendererContract.id)}</code></dd>`)) {
  throw new Error("KFD homepage must not render machine facts or the renderer contract as human content");
}
if (kfdHomeHtml.includes(`data-kfd-section="${escapeHtml(rendererContract.id)}"`)) {
  throw new Error("KFD renderer contract must not render as ordinary homepage content");
}
if (kfdHomeHtml.includes('href="docs/')) {
  throw new Error("KFD package-relative docs links must be rewritten away from site-local missing paths");
}
const kfdFoundationPath = `${kfdSite.foundationPage.url.replace(/\/+$/, "")}/`;
const kfdFoundationCanonicalHtml = fs.readFileSync("dist/kfd/foundation/index.html", "utf8");
const kfdFoundationAliasHtml = fs.readFileSync("dist/foundation/index.html", "utf8");
if (kfdFoundationAliasHtml !== kfdFoundationCanonicalHtml) {
  throw new Error("KFD foundation subdomain route alias drifted: dist/foundation/index.html");
}
if (!kfdHomeHtml.includes(`href="${escapeHtml(kfdFoundationPath)}"`)) {
  throw new Error(`KFD homepage is missing the bundle-owned foundation route: ${kfdFoundationPath}`);
}
if (kfdHomeHtml.includes("https://github.com/kungfu-systems/kfd/blob/main/docs/foundation-model.md")) {
  throw new Error("KFD homepage must route the foundation model to the rendered site page, not GitHub");
}
const foundationHeadings = [...kfdSite.foundationPage.markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
if (
  foundationHeadings.length < 4 ||
  foundationHeadings.some((heading) => !kfdFoundationCanonicalHtml.includes(`>${escapeHtml(heading)}</h`))
) {
  throw new Error("KFD foundation page is missing bundle-owned foundation content");
}
if (
  !kfdFoundationCanonicalHtml.includes('class="doc-toc"') ||
  !kfdFoundationCanonicalHtml.includes('aria-label="Foundation sections"') ||
  !kfdFoundationCanonicalHtml.includes(`<a href="${escapeHtml(kfdFoundationPath)}" aria-current="page">Foundation model</a>`)
) {
  throw new Error("KFD foundation page is missing section or global navigation");
}
if (!kfdFoundationCanonicalHtml.includes("<table>") || !kfdFoundationCanonicalHtml.includes("<th>Layer</th>")) {
  throw new Error("KFD foundation markdown table was not rendered as an HTML table");
}
if (
  !kfdFoundationCanonicalHtml.includes(escapeHtml(kfdSite.foundationPage.sourcePath)) ||
  !kfdFoundationCanonicalHtml.includes(`<code>${escapeHtml(String(kfdSite.foundationPage.normative))}</code>`)
) {
  throw new Error("KFD foundation page is missing source or authority metadata");
}
const kfdCasesPath = `${kfdSite.casesPage.url.replace(/\/+$/, "")}/`;
const kfdCasesCanonicalHtml = fs.readFileSync("dist/kfd/cases/index.html", "utf8");
const kfdCasesAliasHtml = fs.readFileSync("dist/cases/index.html", "utf8");
if (kfdCasesAliasHtml !== kfdCasesCanonicalHtml) {
  throw new Error("KFD cases subdomain route alias drifted: dist/cases/index.html");
}
if (!kfdHomeHtml.includes(`href="${escapeHtml(kfdCasesPath)}"`)) {
  throw new Error(`KFD homepage is missing the bundle-owned cases route: ${kfdCasesPath}`);
}
const casesHeadings = [...kfdSite.casesPage.markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
if (
  casesHeadings.length < 4 ||
  casesHeadings.some((heading) => !kfdCasesCanonicalHtml.includes(`>${escapeHtml(heading)}</h`))
) {
  throw new Error("KFD cases page is missing bundle-owned historical content");
}
if (
  !kfdCasesCanonicalHtml.includes('aria-label="Case sections"') ||
  !kfdCasesCanonicalHtml.includes(`<a href="${escapeHtml(kfdCasesPath)}" aria-current="page">Historical cases</a>`) ||
  !kfdCasesCanonicalHtml.includes("<table>")
) {
  throw new Error("KFD cases page is missing navigation or rendered tables");
}
if (
  !kfdCasesCanonicalHtml.includes(escapeHtml(kfdSite.casesPage.sourcePath)) ||
  !kfdCasesCanonicalHtml.includes(`<code>${escapeHtml(String(kfdSite.casesPage.normative))}</code>`)
) {
  throw new Error("KFD cases page is missing source or authority metadata");
}
if (
  !kfdAgentManifest.readOrder.includes(expectedSurfaceEndpoint("kfd", kfdCasesPath.replace(/^\/+/, ""))) ||
  kfdAgentManifest.cases?.path !== kfdCasesPath
) {
  throw new Error("KFD agent manifest is missing the bundle-owned cases page");
}
const kfdCandidateIndexPath = `${kfdSite.candidatePages.indexUrl.replace(/\/+$/, "")}/`;
const kfdCandidateIndexCanonicalHtml = fs.readFileSync("dist/kfd/drafts/index.html", "utf8");
const kfdCandidateIndexAliasHtml = fs.readFileSync("dist/drafts/index.html", "utf8");
if (kfdCandidateIndexAliasHtml !== kfdCandidateIndexCanonicalHtml) {
  throw new Error("KFD candidate index alias drifted: dist/drafts/index.html");
}
if (
  !kfdHomeHtml.includes(`href="${escapeHtml(kfdCandidateIndexPath)}"`)
  || kfdHomeHtml.includes("https://github.com/kungfu-systems/kfd/blob/main/drafts/action-state-separation.md")
) {
  throw new Error("KFD homepage must route candidates to rendered site pages");
}
if (
  !kfdCandidateIndexCanonicalHtml.includes('aria-label="Candidate index sections"')
  || !kfdCandidateIndexCanonicalHtml.includes(`<a href="${escapeHtml(kfdCandidateIndexPath)}" aria-current="page">Candidates</a>`)
  || !kfdCandidateIndexCanonicalHtml.includes(`href="${escapeHtml(kfdCandidateIndexPath)}registry.json"`)
  || !kfdCandidateIndexCanonicalHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "drafts/registry.json"))}"`)
) {
  throw new Error("KFD candidate index is missing navigation or its machine registry link");
}
for (const candidate of kfdCandidatePages) {
  const candidateCanonicalHtml = fs.readFileSync(`dist/kfd/drafts/${candidate.id}/index.html`, "utf8");
  const candidateAliasHtml = fs.readFileSync(`dist/drafts/${candidate.id}/index.html`, "utf8");
  if (candidateAliasHtml !== candidateCanonicalHtml) {
    throw new Error(`KFD candidate alias drifted: ${candidate.id}`);
  }
  if (
    !candidateCanonicalHtml.includes('aria-label="Candidate sections"')
    || !candidateCanonicalHtml.includes(`<span class="page-kicker-state">candidate / ${escapeHtml(candidate.status)}</span>`)
    || !candidateCanonicalHtml.includes(`<a class="doc-nav-child" href="${escapeHtml(candidate.url)}" aria-current="page">${escapeHtml(candidate.title)}</a>`)
    || !candidateCanonicalHtml.includes(escapeHtml(candidate.claimBoundary))
    || !candidateCanonicalHtml.includes(escapeHtml(candidate.sourcePath))
    || !candidateCanonicalHtml.includes(`<code>${escapeHtml(String(kfdSite.candidatePages.normative))}</code>`)
    || !candidateCanonicalHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "drafts/registry.json"))}"`)
  ) {
    throw new Error(`KFD candidate page is missing declared facts: ${candidate.id}`);
  }
  if (/href="(?:\.\.?\/|[^":/#]+\.md(?:#|"))/.test(candidateCanonicalHtml)) {
    throw new Error(`KFD candidate page has unresolved package markdown links: ${candidate.id}`);
  }
}
if (!kfdHomeHtml.includes("Adoption boundary")) {
  throw new Error("KFD homepage must render the adoption boundary");
}
for (const entry of kfdRegistry.entries) {
  const number = String(entry.number);
  const expectedLinks = [
    `<h3><a href="/${escapeHtml(number)}/">${escapeHtml(entry.id)}</a></h3>`,
    `<a class="card-action" href="/${escapeHtml(number)}/">Read ${escapeHtml(entry.id)}</a>`,
  ];
  const usagePage = kfdUsagePageByDecisionNumber.get(number);
  if (usagePage?.sourceExists) {
    expectedLinks.push(`<a class="card-action secondary" href="/${escapeHtml(number)}/usage/">Usage notes</a>`);
  }
  for (const expectedLink of expectedLinks) {
    if (!kfdHomeHtml.includes(expectedLink)) {
      throw new Error(`KFD homepage is missing current decision navigation: ${expectedLink}`);
    }
  }
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
for (const entry of kfdRegistry.entries) {
  const number = String(entry.number);
  const canonicalHtml = fs.readFileSync(`dist/kfd/${number}/index.html`, "utf8");
  const subdomainAliasHtml = fs.readFileSync(`dist/${number}/index.html`, "utf8");
  if (subdomainAliasHtml !== canonicalHtml) {
    throw new Error(`KFD subdomain route alias drifted: dist/${number}/index.html`);
  }
  const usageCanonicalHtml = fs.readFileSync(`dist/kfd/${number}/usage/index.html`, "utf8");
  const usageAliasHtml = fs.readFileSync(`dist/${number}/usage/index.html`, "utf8");
  if (usageAliasHtml !== usageCanonicalHtml) {
    throw new Error(`KFD usage route alias drifted: dist/${number}/usage/index.html`);
  }
  const formalCanonicalHtml = fs.readFileSync(`dist/kfd/${number}/formal/index.html`, "utf8");
  const formalAliasHtml = fs.readFileSync(`dist/${number}/formal/index.html`, "utf8");
  if (formalAliasHtml !== formalCanonicalHtml) {
    throw new Error(`KFD formal reference route alias drifted: dist/${number}/formal/index.html`);
  }
}
for (const entry of kfdRegistry.entries) {
  const html = kfdDecisionHtmlByNumber.get(String(entry.number));
  const label = entry.id;
  const usagePage = kfdUsagePageByDecisionNumber.get(String(entry.number));
  const formalPage = kfdFormalPageByDecisionNumber.get(String(entry.number));
  if (!html.includes('class="doc-toc"') || !html.includes('aria-label="Decision sections"')) {
    throw new Error(`${label} page is missing the decision section navigation`);
  }
  if (
    !html.includes('class="doc-global-nav" aria-label="Kung Fu Decisions"') ||
    !html.includes(`<a href="${escapeHtml(expectedSurfaceHref("kfd"))}" data-local-href="/kfd/">Overview</a>`)
  ) {
    throw new Error(`${label} page is missing the KFD cross-decision navigation`);
  }
  const currentDecisionLink = `<a href="/${escapeHtml(entry.number)}/" aria-current="page">${escapeHtml(entry.id)}</a>`;
  if (!html.includes(currentDecisionLink)) {
    throw new Error(`${label} page is missing the current KFD marker in cross-decision navigation`);
  }
  if (!html.includes(`<p class="eyebrow page-kicker"><a href="${escapeHtml(expectedSurfaceHref("kfd"))}" data-local-href="/kfd/" aria-label="Back to KFD home">Back to KFD home</a>`)) {
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
  const decisionMarkdown = fs.readFileSync(`node_modules/@kungfu-tech/kfd/${entry.path}`, "utf8");
  const decisionHeadings = [...decisionMarkdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
  if (
    decisionHeadings.length < 2 ||
    decisionHeadings.some((heading) => !html.includes(`>${escapeHtml(heading)}</h`))
  ) {
    throw new Error(`${label} page is missing bundle-owned decision content`);
  }
  if (usagePage?.sourceExists && html.includes(`<a class="doc-nav-child" href="/${escapeHtml(entry.number)}/usage/">Usage</a>`)) {
    throw new Error(`${label} decision page must not show the usage child link outside the usage page context`);
  }
  if (formalPage?.sourceExists && html.includes(`<a class="doc-nav-child" href="/${escapeHtml(entry.number)}/formal/">Formal reference</a>`)) {
    throw new Error(`${label} decision page must not show the formal child link outside the formal page context`);
  }
  if (usagePage?.sourceExists) {
    const expectedUsageTocLink = `<a class="toc-related-link" href="/${escapeHtml(entry.number)}/usage/">${escapeHtml(usagePage.title || "Usage")}</a>`;
    if (!html.includes(expectedUsageTocLink)) {
      throw new Error(`${label} decision page is missing its usage link in the decision sections navigation`);
    }
    const usageHtml = fs.readFileSync(`dist/kfd/${entry.number}/usage/index.html`, "utf8");
    if (!usageHtml.includes('aria-label="Usage sections"') || !usageHtml.includes("<h2>Usage sections</h2>") || !usageHtml.includes("Usage metadata")) {
      throw new Error(`${label} usage page is missing usage navigation or metadata`);
    }
    if (!usageHtml.includes(`<span class="page-kicker-state">usage / ${escapeHtml(entry.id)}</span>`)) {
      throw new Error(`${label} usage page is missing usage state`);
    }
    if (!usageHtml.includes(`<a href="/${escapeHtml(entry.number)}/" aria-label="Back to ${escapeHtml(entry.id)}">Back to ${escapeHtml(entry.id)}</a>`)) {
      throw new Error(`${label} usage page is missing parent decision back link`);
    }
    if (!usageHtml.includes(`<a class="doc-nav-child" href="/${escapeHtml(entry.number)}/usage/" aria-current="page">Usage</a>`)) {
      throw new Error(`${label} usage page is missing current usage marker`);
    }
    for (const otherEntry of kfdRegistry.entries) {
      if (String(otherEntry.number) === String(entry.number)) continue;
      const otherUsageLink = `<a class="doc-nav-child" href="/${escapeHtml(otherEntry.number)}/usage/">Usage</a>`;
      if (usageHtml.includes(otherUsageLink)) {
        throw new Error(`${label} usage page must not expand usage child links for other KFD entries`);
      }
    }
    if (!usageHtml.includes(escapeHtml(usagePage.sourcePath || usagePage.path))) {
      throw new Error(`${label} usage page does not expose its KFD package source path`);
    }
  }
  if (formalPage?.sourceExists) {
    const expectedFormalTocLink = `<a class="toc-related-link" href="/${escapeHtml(entry.number)}/formal/">${escapeHtml(formalPage.title || "Formal reference")}</a>`;
    if (!html.includes(expectedFormalTocLink)) {
      throw new Error(`${label} decision page is missing its formal reference link in the decision sections navigation`);
    }
    const formalHtml = fs.readFileSync(`dist/kfd/${entry.number}/formal/index.html`, "utf8");
    if (
      !formalHtml.includes('aria-label="Formal reference sections"')
      || !formalHtml.includes("<h2>Formal reference sections</h2>")
      || !formalHtml.includes("Formal reference metadata")
    ) {
      throw new Error(`${label} formal reference page is missing formal navigation or metadata`);
    }
    if (!formalHtml.includes(`<span class="page-kicker-state">formal reference / ${escapeHtml(entry.id)}</span>`)) {
      throw new Error(`${label} formal reference page is missing formal state`);
    }
    if (!formalHtml.includes(`<a href="/${escapeHtml(entry.number)}/" aria-label="Back to ${escapeHtml(entry.id)}">Back to ${escapeHtml(entry.id)}</a>`)) {
      throw new Error(`${label} formal reference page is missing parent decision back link`);
    }
    if (!formalHtml.includes(`<a class="doc-nav-child" href="/${escapeHtml(entry.number)}/formal/" aria-current="page">Formal reference</a>`)) {
      throw new Error(`${label} formal reference page is missing current formal marker`);
    }
    if (
      !formalHtml.includes(`<a href="/${escapeHtml(entry.number)}/">Authoritative decision</a>`)
      || !formalHtml.includes(`<a href="/${escapeHtml(entry.number)}/usage/">Usage</a>`)
      || !formalHtml.includes('href="https://github.com/kungfu-systems/kfd/blob/main/docs/formal-model.md"')
      || /href="(?:\.\.?\/|[^":/#]+\.md(?:#|"))/.test(formalHtml)
    ) {
      throw new Error(`${label} formal reference page has unresolved package markdown links`);
    }
    for (const otherEntry of kfdRegistry.entries) {
      if (String(otherEntry.number) === String(entry.number)) continue;
      const otherFormalLink = `<a class="doc-nav-child" href="/${escapeHtml(otherEntry.number)}/formal/">Formal reference</a>`;
      if (formalHtml.includes(otherFormalLink)) {
        throw new Error(`${label} formal reference page must not expand formal child links for other KFD entries`);
      }
    }
    for (const expectedValue of [
      formalPage.sourcePath || formalPage.path,
      formalPage.relationship,
      formalPage.formalModelStatus,
      formalPage.authorityPath,
    ]) {
      if (!formalHtml.includes(escapeHtml(expectedValue))) {
        throw new Error(`${label} formal reference page is missing bundle metadata: ${expectedValue}`);
      }
    }
    if (!formalHtml.includes(`<code>${escapeHtml(String(formalPage.normative))}</code>`)) {
      throw new Error(`${label} formal reference page is missing normative metadata`);
    }
  }
}
if (
  !kfdOneHtml.includes("<table>")
  || !kfdOneHtml.includes("<th>Condition</th>")
  || !kfdOneHtml.includes("<th>Compatibility impact</th>")
  || !kfdOneHtml.includes("<th>Release verdict</th>")
  || !kfdOneHtml.includes("<td>major</td>")
) {
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
grep -q '2.11.13' dist/buildchain/index.html
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
grep -q '@kungfu-tech/kfd' dist/kfd/manifest.json
grep -q 'KFD — Kung Fu Decisions' dist/kfd/index.html
grep -q 'non-drifting facts' dist/kfd/index.html
grep -q 'KFD-1' dist/kfd/1/index.html
grep -q 'KFD-4' dist/kfd/4/index.html
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
