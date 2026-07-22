#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

node scripts/check-infra-outputs.mjs
node scripts/check-dogfood-evidence.mjs

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
  "src/fixtures/core-runtime-surface.json",
  "src/fixtures/libkungfu-runtime-surface.json",
  "src/fixtures/dogfood-evidence.json",
  "docs/versioning.md",
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
  "dist/core/manifest.json",
  "dist/core/llms.txt",
  "dist/core/llms-full.txt",
  "dist/buildchain/index.html",
  "dist/kfd/index.html",
  "dist/kfd/foundation/index.html",
  "dist/foundation/index.html",
  "dist/kfd/formal/index.html",
  "dist/formal/index.html",
  "dist/kfd/terminology/index.html",
  "dist/terminology/index.html",
  "dist/kfd/terminology.json",
  "dist/terminology.json",
  "dist/kfd/schemas/kfd-terminology.schema.json",
  "dist/schemas/kfd-terminology.schema.json",
  "dist/kfd/cases/index.html",
  "dist/cases/index.html",
  "dist/kfd/manifest.json",
  "dist/kfd/registry.json",
  "dist/kfd/standards.json",
  "dist/kfd/llms.txt",
  "dist/core/assets/favicon.svg",
  "dist/buildchain/assets/favicon.svg",
  "dist/kfd/assets/favicon.svg",
  "dist/papers/assets/favicon.svg",
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
  "dist/runtime.json",
  "dist/dogfood/index.html",
  "dist/dogfood-evidence.json",
  "dist/llms.txt",
  "dist/papers/index.html",
  "dist/papers/manifest.json",
  "dist/papers/registry.json",
  "dist/papers/llms.txt",
];

const site = JSON.parse(fs.readFileSync("src/fixtures/site-manifest.json", "utf8"));
const core = JSON.parse(fs.readFileSync("src/fixtures/core-runtime-surface.json", "utf8"));
const coreManifest = JSON.parse(fs.readFileSync("dist/core/manifest.json", "utf8"));
const runtimeSurface = JSON.parse(fs.readFileSync("src/fixtures/libkungfu-runtime-surface.json", "utf8"));
const dogfoodEvidence = JSON.parse(fs.readFileSync("src/fixtures/dogfood-evidence.json", "utf8"));
const publicationPackageSet = JSON.parse(fs.readFileSync("src/publication-packages.json", "utf8"));
const publicationSource = loadPublicationPackageSet(process.cwd());
const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));
const runtimeProjection = JSON.parse(fs.readFileSync("dist/runtime.json", "utf8"));
const dogfoodProjection = JSON.parse(fs.readFileSync("dist/dogfood-evidence.json", "utf8"));
const publicationManifest = JSON.parse(fs.readFileSync("dist/papers/manifest.json", "utf8"));
const publicationRenderedRegistry = JSON.parse(fs.readFileSync("dist/papers/registry.json", "utf8"));
const badgeEndpointRegistry = JSON.parse(fs.readFileSync("dist/badges/v1/badge-endpoint-registry.json", "utf8"));
const kfdAgentManifest = JSON.parse(fs.readFileSync("dist/kfd/manifest.json", "utf8"));
const kfdRenderedRegistry = JSON.parse(fs.readFileSync("dist/kfd/registry.json", "utf8"));
const kfdRenderedCandidateRegistry = JSON.parse(fs.readFileSync("dist/kfd/drafts/registry.json", "utf8"));
const kfdRenderedCaseRegistry = JSON.parse(fs.readFileSync("dist/kfd/cases/registry.json", "utf8"));
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
const kfdSourceRef = kfdPropagationLock?.upstream?.sourceSha
  || kfdPropagationLock?.upstream?.tag
  || "main";
const buildchainPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/package.json", "utf8"));
const buildchainSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/dist/site/buildchain-site.json", "utf8"));
const kfdPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/package.json", "utf8"));
const kfdSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/site/kfd-site.json", "utf8"));
const kfdRegistry = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/registry.json", "utf8"));
const kfdCandidateRegistry = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/drafts/registry.json", "utf8"));
const kfdCaseRegistry = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/cases/registry.json", "utf8"));
const kfdStandards = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/standards.json", "utf8"));
const kfdTerminology = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/terminology.json", "utf8"));
const kfdTerminologySchema = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/schemas/kfd-terminology.schema.json", "utf8"));
const expectedBuildchainVersion = "2.14.13";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.40";
const expectedPaperPackages = publicationPackageSet.packages;
const kfdUsagePages = kfdSite.decisionPages?.usagePages?.pages || [];
const kfdUsagePageByDecisionNumber = new Map(kfdUsagePages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const kfdFormalPages = kfdSite.decisionPages?.formalPages?.pages || [];
const kfdFormalPageByDecisionNumber = new Map(kfdFormalPages.map((pageEntry) => [String(pageEntry.decisionNumber), pageEntry]));
const kfdCandidatePages = kfdSite.candidatePages?.pages || [];
const kfdCandidateFormalPages = kfdSite.candidatePages?.formalPages?.pages || [];
const kfdCandidateFormalPageByCandidateId = new Map(
  kfdCandidateFormalPages.map((pageEntry) => [pageEntry.candidateId, pageEntry]),
);
const requiredFiles = [
  ...requiredBaseFiles,
  "dist/kfd/drafts/index.html",
  "dist/drafts/index.html",
  "dist/kfd/drafts/registry.json",
  "dist/drafts/registry.json",
  "dist/kfd/cases/registry.json",
  "dist/cases/registry.json",
  ...kfdCandidatePages.flatMap((entry) => [
    `dist/kfd/drafts/${entry.id}/index.html`,
    `dist/drafts/${entry.id}/index.html`,
  ]),
  ...kfdCandidateFormalPages.flatMap((entry) => {
    const output = entry.url.replace(/^\/+|\/+$/g, "");
    return [
      `dist/kfd/${output}/index.html`,
      `dist/${output}/index.html`,
    ];
  }),
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
const rootFavicon = fs.readFileSync("dist/assets/favicon.svg", "utf8");
for (const surface of ["core", "buildchain", "kfd", "papers"]) {
  if (fs.readFileSync(`dist/${surface}/assets/favicon.svg`, "utf8") !== rootFavicon) {
    throw new Error(`${surface} favicon must match the shared site asset`);
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
const versioningPolicy = fs.readFileSync("docs/versioning.md", "utf8");
if (
  !versioningPolicy.includes("libkungfu-dev-reader-contract/v1")
  || !versioningPolicy.includes("| 2026-07-22 | open-minor | `site-manifest/v1` |")
  || !versioningPolicy.includes("while preserving all existing routes, upstream content, and claim boundaries")
) {
  throw new Error("KFD-1 version review must register the additive reader-contract impact");
}
const readerContract = site.readerContract;
if (
  readerContract?.contract !== "libkungfu-dev-reader-contract/v1"
  || readerContract.owner !== "site-libkungfu-dev"
  || readerContract.layers?.map((entry) => entry.id).join(",") !== "first-screen,guided-synthesis,upstream-authority,machine-evidence"
  || readerContract.surfacePaths?.map((entry) => entry.id).join(",") !== "hub,core,kfd,buildchain"
  || !readerContract.surfaceSynthesis?.buildchain
) {
  throw new Error("site reader contract is missing its stable owner, four layers, primary surface paths, or Buildchain synthesis");
}
if (
  site.sourceBoundary.siteRole !== "reader contract, guided synthesis, visual composition, routing, and rendering"
  || !site.sourceBoundary.rule.includes("Every technical or release claim must bind")
  || !site.sourceBoundary.rule.includes("remain upstream-owned")
) {
  throw new Error("site source boundary must separate reader-contract ownership from upstream fact authority");
}
const readerClaimClassIds = new Set(readerContract.claimClasses.map((entry) => entry.id));
const expectedReaderClaimClasses = [
  "site-synthesis",
  "upstream-fact",
  "reference-implementation",
  "future-picture",
  "non-claim",
];
for (const claimClass of expectedReaderClaimClasses) {
  if (!readerClaimClassIds.has(claimClass)) {
    throw new Error(`reader contract missing claim class: ${claimClass}`);
  }
}
const readerSourceById = new Map(readerContract.sources.map((entry) => [entry.id, entry]));
if (readerSourceById.size !== readerContract.sources.length) {
  throw new Error("reader contract source ids must be unique");
}
const packageAuthority = new Map([
  ["@kungfu-tech/kfd", kfdPackage],
  ["@kungfu-tech/buildchain", buildchainPackage],
]);
const architectureAuthority = [
  runtimeSurface.architectureSources.kungfu,
  runtimeSurface.architectureSources.kfd,
];
for (const source of readerContract.sources) {
  if (!source.id || !source.owner || !source.path || !/^[0-9a-f]{64}$/.test(source.sha256 || "")) {
    throw new Error(`reader contract source is incomplete: ${source.id || "unknown"}`);
  }
  if (source.kind === "package-document") {
    const authorityPackage = packageAuthority.get(source.package);
    const packagePath = `node_modules/${source.package}/${source.path}`;
    if (!authorityPackage || authorityPackage.version !== source.version || !fs.existsSync(packagePath)) {
      throw new Error(`reader contract package source is not pinned to an installed authority: ${source.id}`);
    }
    if (sha256File(packagePath) !== `sha256:${source.sha256}`) {
      throw new Error(`reader contract package source digest drifted: ${source.id}`);
    }
    continue;
  }
  if (source.kind === "git-document") {
    const authority = architectureAuthority.find((entry) => (
      entry.repository === source.repository
      && entry.commit === source.ref
      && entry.documents.some((document) => document.path === source.path && document.sha256 === source.sha256)
    ));
    if (!authority) {
      throw new Error(`reader contract git source is not bound by the runtime architecture fixture: ${source.id}`);
    }
    continue;
  }
  throw new Error(`reader contract source kind is unsupported: ${source.kind}`);
}
const rootReaderClaims = [
  ...readerContract.guidedSynthesis.conceptualChain,
  ...readerContract.guidedSynthesis.supplyChain.steps,
  {
    ...readerContract.guidedSynthesis.hubConsequence,
    summary: readerContract.guidedSynthesis.hubConsequence.summary,
  },
  {
    claimClass: readerContract.guidedSynthesis.supplyChain.claimClass,
    sourceRefs: readerContract.guidedSynthesis.supplyChain.sourceRefs,
    summary: readerContract.guidedSynthesis.supplyChain.nonClaim,
  },
];
const buildchainSynthesis = readerContract.surfaceSynthesis.buildchain;
const buildchainReaderClaims = [
  {
    ...buildchainSynthesis,
    summary: buildchainSynthesis.lead,
  },
  buildchainSynthesis.trustLoop,
  ...buildchainSynthesis.trustLoop.steps,
  buildchainSynthesis.hubValue,
  ...buildchainSynthesis.hubValue.outcomes,
  buildchainSynthesis.ecosystemEffect,
  ...buildchainSynthesis.ecosystemEffect.steps,
  {
    claimClass: buildchainSynthesis.ecosystemEffect.nonClaimClass,
    sourceRefs: buildchainSynthesis.ecosystemEffect.nonClaimSourceRefs,
    summary: buildchainSynthesis.ecosystemEffect.nonClaim,
  },
  buildchainSynthesis.ownershipBoundary,
];
const readerClaims = [...rootReaderClaims, ...buildchainReaderClaims];
for (const claim of readerClaims) {
  if (!readerClaimClassIds.has(claim.claimClass) || !Array.isArray(claim.sourceRefs) || claim.sourceRefs.length === 0) {
    throw new Error(`reader synthesis claim is missing a class or source: ${claim.summary}`);
  }
  for (const sourceRef of claim.sourceRefs) {
    if (!readerSourceById.has(sourceRef)) {
      throw new Error(`reader synthesis claim references an unknown source: ${sourceRef}`);
    }
  }
  if (claim.summary && renderSiteSource.includes(claim.summary)) {
    throw new Error(`reader synthesis must come from the governed fixture, not renderer prose: ${claim.summary}`);
  }
}
for (const entry of [site.homepage, ...readerContract.surfacePaths]) {
  if (!readerClaimClassIds.has(entry.claimClass) || !Array.isArray(entry.sourceRefs) || entry.sourceRefs.length === 0) {
    throw new Error(`reader framing is missing a claim class or source: ${entry.headline || entry.id}`);
  }
  for (const sourceRef of entry.sourceRefs) {
    if (!readerSourceById.has(sourceRef)) {
      throw new Error(`reader framing references an unknown source: ${sourceRef}`);
    }
  }
}
if (JSON.stringify(dogfoodProjection) !== JSON.stringify(dogfoodEvidence)) {
  throw new Error("published dogfood evidence must preserve the fixture bytes semantically");
}
const dogfoodHtml = fs.readFileSync("dist/dogfood/index.html", "utf8");
for (const requiredText of [
  dogfoodEvidence.headline,
  dogfoodEvidence.metrics.mergedPublicPullRequests.value.toLocaleString("en-US"),
  "A merged pull request is a work item, not a feature count.",
  "A GitHub author account is not an Agent actor identity.",
  "A reviewed-by search match is not automatically an approval",
  "Three actors continued one exact Project Cut without a human relay",
  "The Hub architecture explanation was built, reviewed, settled, and released through the same loop",
]) {
  if (!dogfoodHtml.includes(requiredText.replaceAll("&", "&amp;"))) {
    throw new Error(`dogfood page missing required evidence text: ${requiredText}`);
  }
}
if (!/\.dogfood-flow li\s*\{[^}]*margin:\s*0;/.test(renderSiteSource)) {
  throw new Error("dogfood flow cards must reset inherited list margins");
}
for (const requiredPath of ["/dogfood/", "/dogfood-evidence.json"]) {
  if (!manifest.pages.some((page) => page.path === requiredPath && page.source === "src/fixtures/dogfood-evidence.json")) {
    throw new Error(`site manifest missing dogfood route: ${requiredPath}`);
  }
}
if (
  runtimeSurface.contract !== "libkungfu-embeddable-runtime-surface/v1" ||
  runtimeSurface.status !== "reference-candidate" ||
  runtimeSurface.claimLevel !== "reference-adopter"
) {
  throw new Error("embeddable runtime projection contract or claim boundary mismatch");
}
if (
  runtimeSurface.source.sourceCommit !== "7eeb5bd1b45492f4da27eaacbe63eddfd6245176" ||
  runtimeSurface.source.mainlineCommit !== "462a6c16e0608e0cbf71d8d304ddd3192e79ffc3" ||
  runtimeSurface.source.projectCutRoot !== "sha256:2c555ff848de196df32dd5ae416d2055d7a470dbc98706b3d9bbb2f8e4bc29c5" ||
  runtimeSurface.qualification.suiteRoot !== "sha256:1e996b8c43b0b3e38630ccd58acf8a714cbc24b339d3794318347faab9057e5f"
) {
  throw new Error("embeddable runtime projection drifted from reviewed source, Cut, or KFD suite roots");
}
if (
  runtimeSurface.packages.length !== 2 ||
  runtimeSurface.packages.some((entry) => entry.installCommand !== null || !entry.availability.includes("source")) ||
  runtimeSurface.quickstarts.map((entry) => entry.language).join(",") !== "Node,Python,C"
) {
  throw new Error("source-only package availability or C/Node/Python quickstart projection drifted");
}
if (
  runtimeSurface.architectureSources?.kungfu?.commit !== "1f3893fae1a7a666d8abe736cd9563128f48549b" ||
  runtimeSurface.architectureSources?.kfd?.commit !== "35915676330696f888c73c154f431c99f37c19ec" ||
  runtimeSurface.architectureSources?.kfd?.profile !== "kfd-agent-hub@0.1.0-alpha.1" ||
  runtimeSurface.architectureSources?.kfd?.manifestDigest !== "sha256:649ec7531d4c879846b8207a94e21844d573f0c07a422b9fa3f921bfa65d05a3" ||
  runtimeSurface.actionWorld?.steps?.length !== 7 ||
  runtimeSurface.actionWorld?.foundation?.length !== 3 ||
  runtimeSurface.hubNetwork?.hubs?.length !== 2 ||
  runtimeSurface.hubNetwork?.exchange?.length !== 4 ||
  runtimeSurface.invariants?.map((entry) => `${entry.left}!=${entry.right}`).join(",") !== "Delivery!=Admission,Occurrence!=Completion,Authentication!=Authority" ||
  !/\.action-step\s*\{[^}]*margin:\s*0;/.test(renderSiteSource)
) {
  throw new Error("architecture projection drifted from its exact Kungfu/KFD sources, card alignment, or visual contract");
}
if (
  !runtimeSurface.architectureSources.projectionRule.includes("reader framing")
  || !runtimeSurface.architectureSources.projectionRule.includes("Kungfu owns Fact-Episode-Action runtime semantics")
  || !runtimeSurface.architectureSources.projectionRule.includes("KFD owns cross-Hub protocol semantics")
) {
  throw new Error("runtime projection rule must separate site reader ownership from Kungfu and KFD semantic authority");
}
if (core.contract !== "libkungfu-core-runtime-surface-fixture") {
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
const expectedPaperPackageNames = [
  "@kungfu-tech/paper-kungfu-product-white-paper",
  "@kungfu-tech/paper-kfd-foundation-real-world-agent-work",
  "@kungfu-tech/paper-observer-declared-timelines",
  "@kungfu-tech/paper-episodes-to-primitives",
];
const expectedPaperIds = [
  "kungfu-product-white-paper",
  "kfd-foundation-real-world-agent-work",
  "observer-declared-timelines",
  "episodes-to-primitives",
];
if (
  publicationPackageSet.contract !== "libkungfu-dev-publication-package-set" ||
  expectedPaperPackages.map((entry) => entry.name).join(",") !== expectedPaperPackageNames.join(",")
) {
  throw new Error("publication package set must declare the four current paper packages in canonical order");
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
if (
  kfdSite.candidatePages?.formalPages?.relationship !== "formal-candidate-child-of-candidate"
  || kfdSite.candidatePages?.formalPages?.normative !== false
  || !Array.isArray(kfdCandidateFormalPages)
  || kfdCandidateFormalPages.length === 0
) {
  throw new Error("KFD site bundle must expose governed non-normative formal candidate pages");
}
for (const formalPage of kfdCandidateFormalPages) {
  const parent = kfdCandidatePages.find((candidate) => candidate.id === formalPage.candidateId);
  const registryEntry = kfdCandidateRegistry.candidates?.find((candidate) => candidate.id === formalPage.candidateId);
  if (
    !parent
    || formalPage.parentPath !== parent.sourcePath
    || formalPage.parentUrl !== parent.url
    || formalPage.relationship !== kfdSite.candidatePages.formalPages.relationship
    || formalPage.normative !== false
    || registryEntry?.formalReference?.path !== formalPage.sourcePath
    || registryEntry?.formalReference?.version !== formalPage.formalCandidateVersion
    || registryEntry?.formalReference?.status !== formalPage.formalCandidateStatus
    || registryEntry?.formalReference?.authorityPath !== formalPage.authorityPath
  ) {
    throw new Error(`KFD formal candidate contract mismatch: ${formalPage.id}`);
  }
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
for (const [name, generatedManifest] of [
  ["dist/manifest.json", manifest],
  ["dist/core/manifest.json", coreManifest],
  ["dist/kfd/manifest.json", kfdAgentManifest],
]) {
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
if (manifest.sourceBoundary.truthOwner !== "upstream-evidence-and-manifests") {
  throw new Error("dist manifest source boundary drifted");
}
if (JSON.stringify(manifest.readerContract) !== JSON.stringify(readerContract)) {
  throw new Error("dist manifest must preserve the complete site-owned reader contract");
}
if (
  runtimeProjection.contract !== runtimeSurface.contract ||
  runtimeProjection.canonicalHost !== expectedSurfaceHost("hub") ||
  runtimeProjection.machineEntry !== expectedSurfaceEndpoint("hub", "runtime.json") ||
  runtimeProjection.source?.sourceCommit !== runtimeSurface.source.sourceCommit ||
  runtimeProjection.sourceBoundary?.siteRole !== site.sourceBoundary.siteRole ||
  runtimeProjection.readerContract?.contract !== readerContract.contract ||
  JSON.stringify(runtimeProjection.readerContract?.guidedSynthesis) !== JSON.stringify(readerContract.guidedSynthesis)
) {
  throw new Error("generated runtime projection drifted from its pinned fixture or channel");
}
if (
  !manifest.pages.some((entry) => (
    entry.host === expectedSurfaceHost("hub") &&
    entry.path === "/runtime.json" &&
    entry.source === "src/fixtures/libkungfu-runtime-surface.json"
  )) ||
  manifest.upstreamFixtures.runtime?.sourceCommit !== runtimeSurface.source.sourceCommit ||
  manifest.upstreamFixtures.runtime?.projectCutRoot !== runtimeSurface.source.projectCutRoot ||
  manifest.upstreamFixtures.runtime?.suiteRoot !== runtimeSurface.qualification.suiteRoot
) {
  throw new Error("dist manifest does not bind the exact embeddable runtime projection");
}
if (
  core.contract !== "libkungfu-core-runtime-surface-fixture"
  || core.status !== "evidence-linked-fixture"
  || !/^[0-9a-f]{40}$/.test(core.sourceRef)
  || core.sourceContract?.status !== "fixture"
) {
  throw new Error("Core runtime fixture must preserve its evidence-linked and secondary source-contract boundaries");
}
if (
  coreManifest.contract !== "libkungfu-core-runtime-surface"
  || coreManifest.canonicalHost !== expectedSurfaceHost("core")
  || coreManifest.source?.path !== "src/fixtures/core-runtime-surface.json"
  || coreManifest.source?.ref !== core.sourceRef
  || coreManifest.readerContract?.contract !== readerContract.contract
  || coreManifest.readerContract?.path?.id !== "core"
  || JSON.stringify(coreManifest.readerContract?.layers) !== JSON.stringify(readerContract.layers)
  || JSON.stringify(coreManifest.homepage) !== JSON.stringify(core.homepage)
  || JSON.stringify(coreManifest.architecture) !== JSON.stringify(core.architecture)
  || JSON.stringify(coreManifest.outcomes) !== JSON.stringify(core.outcomes)
  || JSON.stringify(coreManifest.frontiers) !== JSON.stringify(core.frontiers)
  || JSON.stringify(coreManifest.qualificationBoundary) !== JSON.stringify(core.qualificationBoundary)
) {
  throw new Error("Core human and machine runtime surface facts drifted");
}
for (const [field, file] of [
  ["manifest", "manifest.json"],
  ["llms", "llms.txt"],
  ["full", "llms-full.txt"],
]) {
  if (coreManifest.machineEntries?.[field] !== expectedSurfaceEndpoint("core", file)) {
    throw new Error(`Core machine entry drifted: ${field}`);
  }
}
for (const evidence of core.evidence || []) {
  if (
    !evidence.sourcePath
    || !evidence.sourceUrl?.startsWith(`${core.sourceRepository}/blob/${core.sourceRef}/`)
    || !evidence.sourceUrl.endsWith(evidence.sourcePath)
  ) {
    throw new Error(`Core evidence is not pinned to the declared source ref: ${evidence.id}`);
  }
}
const coreHtml = fs.readFileSync("dist/core/index.html", "utf8");
const coreLlms = fs.readFileSync("dist/core/llms.txt", "utf8");
const coreReaderPath = readerContract.surfacePaths.find((entry) => entry.id === "core");
if (!coreLlms.includes(coreReaderPath.question) || !coreLlms.includes(coreReaderPath.promise)) {
  throw new Error("Core human and agent entries must share the site-owned reader path");
}
for (const expectedText of [
  core.homepage.headline,
  core.homepage.lead,
  core.homepage.claimBoundary,
  core.architecture.writer.label,
  core.architecture.journal.label,
  ...core.architecture.readers.map((reader) => reader.label),
  ...core.outcomes.flatMap((outcome) => [outcome.title, outcome.summary]),
  ...core.frontiers.flatMap((frontier) => [frontier.label, frontier.status]),
  core.semanticBoundary.heading,
  core.semanticBoundary.body,
  ...core.semanticBoundary.invariants,
  ...core.qualificationBoundary.claims,
]) {
  if (!coreHtml.includes(escapeHtml(expectedText)) || !coreLlms.includes(expectedText)) {
    throw new Error(`Core human and agent entries do not share the runtime mechanism: ${expectedText}`);
  }
}
if (
  !coreHtml.includes('<figure class="core-runtime-map" aria-labelledby="core-runtime-map-title">')
  || !coreHtml.includes('<details class="panel core-source-contract">')
  || !renderSiteSource.includes("@media (prefers-reduced-motion: reduce)")
  || /\bzero[- ]cost\b|\bcrash-proof\b|\balways survives\b|\bproduction-qualified HA\b/i.test(coreHtml)
) {
  throw new Error("Core runtime visual, secondary source contract, reduced-motion path, or claim language drifted");
}
if (publicationSource.kind !== "paper-packages" || publicationSource.registry.contract !== "kungfu-buildchain-publication-release-registry") {
  throw new Error("publication package aggregation contract mismatch");
}
if (publicationRenderedRegistry.contract !== publicationSource.registry.contract) {
  throw new Error("rendered publication registry contract mismatch");
}
if (
  publicationRenderedRegistry.publications.map((entry) => entry.id).join(",") !== expectedPaperIds.join(",")
  || publicationManifest.publications.map((entry) => entry.id).join(",") !== expectedPaperIds.join(",")
) {
  throw new Error("rendered publication registry and manifest must preserve the canonical paper order");
}
if (publicationRenderedRegistry.publications?.length !== expectedPaperPackages.length || publicationRenderedRegistry.publications.some((entry) => entry.id === "publication-archive-fixture")) {
  throw new Error("rendered publication registry must expose every declared real paper and no fixture publication");
}
if (publicationManifest.contract !== "libkungfu-dev-publication-archive-surface") {
  throw new Error("publication archive manifest contract mismatch");
}
if (
  publicationManifest.canonicalHost !== expectedSurfaceHost("papers") ||
  publicationManifest.source?.kind !== "paper-packages" ||
  publicationManifest.source?.registryContract !== publicationSource.registry.contract ||
  publicationManifest.source?.packages?.length !== expectedPaperPackages.length ||
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
  manifest.upstreamPackages.papers?.packages?.length !== expectedPaperPackages.length ||
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
    if (versionHtml.includes(".hero-answer {") || versionHtml.includes(".hero-claim-boundary {")) {
      throw new Error(`immutable publication version page contains KFD-only hero styles: ${publication.id}@${version.version}`);
    }
    if (versionHtml.includes("--core-blue:") || versionHtml.includes(".core-runtime-map {")) {
      throw new Error(`immutable publication version page contains Core-only runtime styles: ${publication.id}@${version.version}`);
    }
    if (versionHtml.includes(".reader-orientation {") || versionHtml.includes(".reader-supply-chain {")) {
      throw new Error(`immutable publication version page contains site reader-contract styles: ${publication.id}@${version.version}`);
    }
    for (const href of ["/manifest.json", "/llms.txt", "/llms-full.txt"]) {
      if (!versionHtml.includes(`href="${href}"`)) {
        throw new Error(`immutable publication version page changed its legacy machine entry: ${publication.id}@${version.version} ${href}`);
      }
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
let previousPaperCardPosition = -1;
for (const publication of publicationRenderedRegistry.publications) {
  if (!papersIndex.includes(escapeHtml(publication.title))) {
    throw new Error(`papers index missing publication: ${publication.id}`);
  }
  const paperCardPosition = papersIndex.indexOf(`href="${escapeHtml(expectedSurfaceEndpoint("papers", `${publication.id}/`))}"`);
  if (paperCardPosition <= previousPaperCardPosition) {
    throw new Error(`papers index card order drifted at publication: ${publication.id}`);
  }
  previousPaperCardPosition = paperCardPosition;
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
if (
  !manifest.pages.some(
    (page) =>
      page.host === expectedSurfaceHost("kfd")
      && page.path === "/cases/registry.json"
      && page.source.endsWith("/cases/registry.json"),
  )
) {
  throw new Error("dist manifest does not record the KFD case registry");
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
for (const formalCandidate of kfdCandidateFormalPages) {
  if (
    !manifest.pages.some(
      (page) =>
        page.host === expectedSurfaceHost("kfd")
        && page.path === formalCandidate.url
        && page.source.endsWith(`/${formalCandidate.sourcePath}`),
    )
  ) {
    throw new Error(`dist manifest does not record KFD formal candidate: ${formalCandidate.id}`);
  }
}
if (kfdAgentManifest.contract !== "kfd-agent-surface") {
  throw new Error("KFD agent manifest contract mismatch");
}
if (kfdAgentManifest.sourceBoundary?.siteRole !== site.sourceBoundary.siteRole) {
  throw new Error("KFD agent manifest must distinguish site reader ownership from KFD fact authority");
}
if (
  kfdAgentManifest.readerContract?.contract !== readerContract.contract
  || kfdAgentManifest.readerContract?.path?.id !== "kfd"
  || JSON.stringify(kfdAgentManifest.readerContract?.layers) !== JSON.stringify(readerContract.layers)
) {
  throw new Error("KFD agent manifest must preserve the site-owned reader path and four layers");
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
  || kfdAgentManifest.agentEntries?.caseRegistry !== expectedSurfaceEndpoint("kfd", "cases/registry.json")
  || kfdAgentManifest.candidates?.normative !== false
  || kfdAgentManifest.candidates?.entries?.length !== kfdCandidatePages.length
) {
  throw new Error("KFD agent manifest candidate surface mismatch");
}
if (
  kfdAgentManifest.cases?.registry !== expectedSurfaceEndpoint("kfd", "cases/registry.json")
  || kfdAgentManifest.cases?.registryContract !== kfdCaseRegistry.contract
  || !kfdAgentManifest.readOrder.includes(expectedSurfaceEndpoint("kfd", "cases/registry.json"))
) {
  throw new Error("KFD agent manifest case registry mismatch");
}
for (const candidate of kfdAgentManifest.candidates.entries) {
  const formalCandidate = kfdCandidateFormalPageByCandidateId.get(candidate.id);
  if (
    candidate.relationship !== kfdSite.candidatePages.relationship
    || candidate.normative !== false
    || !candidate.claimBoundary
    || !kfdAgentManifest.readOrder.includes(candidate.url)
  ) {
    throw new Error(`KFD agent manifest is missing candidate facts for ${candidate.id}`);
  }
  if (
    formalCandidate
    && (
      candidate.formal?.path !== formalCandidate.url
      || candidate.formal?.source !== `@kungfu-tech/kfd@${kfdPackage.version}/${formalCandidate.sourcePath}`
      || candidate.formal?.relationship !== formalCandidate.relationship
      || candidate.formal?.normative !== false
      || candidate.formal?.formalCandidateVersion !== formalCandidate.formalCandidateVersion
      || candidate.formal?.formalCandidateStatus !== formalCandidate.formalCandidateStatus
      || candidate.formal?.authorityPath !== formalCandidate.authorityPath
      || !kfdAgentManifest.readOrder.includes(candidate.formal?.url)
    )
  ) {
    throw new Error(`KFD agent manifest is missing formal candidate facts for ${candidate.id}`);
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
if (
  kfdRenderedCaseRegistry.contract !== kfdCaseRegistry.contract
  || JSON.stringify(kfdRenderedCaseRegistry) !== JSON.stringify(kfdCaseRegistry)
  || JSON.stringify(kfdRenderedCaseRegistry) !== JSON.stringify(
    JSON.parse(fs.readFileSync("dist/cases/registry.json", "utf8")),
  )
) {
  throw new Error("rendered KFD case registry contract mismatch");
}
if (kfdRenderedStandards.contract !== kfdStandards.contract) {
  throw new Error("rendered KFD standards contract mismatch");
}
const hubHtml = fs.readFileSync("dist/index.html", "utf8");
const hubLlms = fs.readFileSync("dist/llms.txt", "utf8");
const immutableFoundationPaperHtml = fs.readFileSync(
  "dist/papers/archive/kfd-foundation-real-world-agent-work/v0.1.0-alpha.7/index.html",
  "utf8",
);
if (hubHtml.includes('name="robots"') && hubHtml.includes("noindex")) {
  throw new Error("production artifact must not embed robots noindex metadata");
}
if (!hubHtml.includes(".architecture-visual") || immutableFoundationPaperHtml.includes(".architecture-visual")) {
  throw new Error("embeddable runtime styles must remain homepage-local and must not mutate immutable paper HTML");
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
const readerOrder = [
  escapeHtml(site.homepage.headline),
  escapeHtml(readerContract.guidedSynthesis.heading),
  escapeHtml(runtimeSurface.actionWorld.headline),
  escapeHtml(runtimeSurface.hubNetwork.headline),
  "The protocol removes shared-infrastructure assumptions.",
];
let previousReaderPosition = -1;
for (const marker of readerOrder) {
  const position = hubHtml.indexOf(marker);
  if (position <= previousReaderPosition) {
    throw new Error(`homepage reader order drifted at: ${marker}`);
  }
  previousReaderPosition = position;
}
if (
  hubHtml.indexOf('class="runtime-status"') < hubHtml.indexOf(escapeHtml(runtimeSurface.actionWorld.headline))
  || !hubHtml.includes("Your Hub stays yours.")
  || !hubHtml.includes(escapeHtml(readerContract.guidedSynthesis.supplyChain.steps[0].summary))
) {
  throw new Error("homepage first screen must keep runtime status down-level and preserve the Hub ownership promise");
}
for (const layer of readerContract.layers) {
  if (!hubHtml.includes(escapeHtml(layer.label)) || !hubLlms.includes(layer.label)) {
    throw new Error(`human and agent entries must share reader layer: ${layer.label}`);
  }
}
for (const claim of rootReaderClaims) {
  if (!hubHtml.includes(escapeHtml(claim.summary)) || !hubLlms.includes(claim.summary)) {
    throw new Error(`human and agent entries must share reader synthesis: ${claim.summary}`);
  }
}
for (const claim of buildchainReaderClaims) {
  if (!buildchainHomeHtml.includes(escapeHtml(claim.summary)) || !hubLlms.includes(claim.summary)) {
    throw new Error(`Buildchain human and agent entries must share reader synthesis: ${claim.summary}`);
  }
}
for (const retainedCapability of buildchainSynthesis.ownershipBoundary.retainedByHub) {
  if (!buildchainHomeHtml.includes(escapeHtml(retainedCapability)) || !hubLlms.includes(retainedCapability)) {
    throw new Error(`Buildchain human and agent entries must preserve Hub ownership: ${retainedCapability}`);
  }
}
const buildchainReaderOrder = [
  readerContract.surfacePaths.find((entry) => entry.id === "buildchain").question,
  buildchainSynthesis.heading,
  buildchainSynthesis.trustLoop.heading,
  buildchainSynthesis.hubValue.heading,
  buildchainSynthesis.ecosystemEffect.heading,
  buildchainSynthesis.ownershipBoundary.heading,
  buildchainSite.homepage.title,
];
let previousBuildchainReaderPosition = -1;
for (const marker of buildchainReaderOrder) {
  const position = buildchainHomeHtml.indexOf(escapeHtml(marker), previousBuildchainReaderPosition + 1);
  if (position <= previousBuildchainReaderPosition) {
    throw new Error(`Buildchain reader order drifted at: ${marker}`);
  }
  previousBuildchainReaderPosition = position;
}
if (
  !buildchainHomeHtml.includes('id="buildchain-trust-loop"')
  || !buildchainHomeHtml.includes('data-claim-class="future-picture"')
  || !buildchainHomeHtml.includes('data-claim-class="non-claim"')
  || buildchainHomeHtml.indexOf("Install and Verify") < buildchainHomeHtml.indexOf(buildchainSynthesis.ownershipBoundary.heading)
) {
  throw new Error("Buildchain must show its trust loop, future boundary, and Hub ownership before package-owned install detail");
}
for (const source of readerContract.sources) {
  let href;
  if (source.kind === "git-document") {
    href = `${source.repository}/blob/${source.ref}/${source.path}`;
  } else if (source.package === "@kungfu-tech/kfd") {
    const match = /^decisions\/KFD-(\d+)\.md$/.exec(source.path);
    href = match ? expectedSurfaceEndpoint("kfd", `${match[1]}/`) : undefined;
  } else if (source.package === "@kungfu-tech/buildchain") {
    const match = /^docs\/(.+)\.md$/.exec(source.path);
    href = match ? expectedSurfaceEndpoint("buildchain", `docs/${match[1]}/`) : undefined;
  }
  if (!href || !hubHtml.includes(`href="${escapeHtml(href)}"`)) {
    throw new Error(`homepage reader synthesis is missing its exact source link: ${source.id}`);
  }
}
for (const [label, html, pathEntry, authorityMarker] of [
  ["Core", coreHtml, readerContract.surfacePaths.find((entry) => entry.id === "core"), core.homepage.headline],
  ["Buildchain", buildchainHomeHtml, readerContract.surfacePaths.find((entry) => entry.id === "buildchain"), buildchainSite.homepage.title],
]) {
  const questionPosition = html.indexOf(escapeHtml(pathEntry.question));
  const authorityPosition = html.indexOf(escapeHtml(authorityMarker), questionPosition + 1);
  if (questionPosition < 0 || authorityPosition <= questionPosition || !html.includes(`data-reader-surface="${escapeHtml(pathEntry.id)}"`)) {
    throw new Error(`${label} must present the site-owned reader question before upstream authority`);
  }
}
if (
  !hubHtml.includes(escapeHtml(runtimeSurface.headline)) ||
  !hubHtml.includes(escapeHtml(runtimeSurface.actionWorld.headline)) ||
  !hubHtml.includes(escapeHtml(runtimeSurface.hubNetwork.headline)) ||
  !hubHtml.includes("KFD responsibility boundary") ||
  !hubHtml.includes("Delivery") ||
  !hubHtml.includes("Admission") ||
  !hubHtml.includes("Occurrence") ||
  !hubHtml.includes("Completion") ||
  !hubHtml.includes("Authentication") ||
  !hubHtml.includes("Authority") ||
  !hubHtml.includes("Start with an Episode") ||
  !hubHtml.includes("No public registry install is claimed yet") ||
  !hubHtml.includes("KFD Runtime 100 and restart qualification") ||
  !hubHtml.includes("reference-adopter") ||
  !hubHtml.includes(">Principles</p>") ||
  !hubHtml.includes(">First load-bearing layer</p>") ||
  !hubHtml.includes(">Runtime substrate proof</p>") ||
  !hubHtml.includes(">Kungfu Tech</a>") ||
  !hubHtml.includes('href="https://kungfu.tech"')
) {
  throw new Error("human homepage must lead with the embeddable runtime path and retain its release-trust chain");
}
for (const source of [runtimeSurface.architectureSources.kungfu, runtimeSurface.architectureSources.kfd]) {
  for (const document of source.documents) {
    const href = `${source.repository}/blob/${source.commit}/${document.path}`;
    if (!hubHtml.includes(`href="${escapeHtml(href)}"`)) {
      throw new Error(`homepage architecture must link its exact semantic source: ${document.path}`);
    }
  }
}
for (const quickstart of runtimeSurface.quickstarts) {
  const sourceHref = `${runtimeSurface.source.repository}/blob/${runtimeSurface.source.sourceCommit}/${quickstart.sourcePath}`;
  if (!hubHtml.includes(`<pre><code>${escapeHtml(quickstart.command)}</code></pre>`) || !hubHtml.includes(`href="${escapeHtml(sourceHref)}"`)) {
    throw new Error(`homepage quickstart must bind ${quickstart.language} to the exact reviewed source`);
  }
}
if (
  !hubHtml.includes(`href="${escapeHtml(runtimeSurface.source.pullRequest)}"`) ||
  !hubHtml.includes('href="/runtime.json"') ||
  hubHtml.includes("npm install @kungfu-tech/opencode-kungfu")
) {
  throw new Error("homepage must expose exact source and machine facts without inventing a public package install");
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
for (const [label, html, manifestHref, llmsHref, fullIndexHref] of [
  ["Hub", hubHtml, "/manifest.json", "/llms.txt", "/llms-full.txt"],
  ["Core", fs.readFileSync("dist/core/index.html", "utf8"), "/manifest.json", "/llms.txt", "/llms-full.txt"],
  ["Buildchain", buildchainHomeHtml, expectedSurfaceEndpoint("hub", "manifest.json"), expectedSurfaceEndpoint("hub", "llms.txt"), expectedSurfaceEndpoint("hub", "llms-full.txt")],
  ["KFD", fs.readFileSync("dist/kfd/index.html", "utf8"), "/manifest.json", "/llms.txt", expectedSurfaceEndpoint("hub", "llms-full.txt")],
  ["Papers", papersIndex, "/manifest.json", "/llms.txt", expectedSurfaceEndpoint("hub", "llms-full.txt")],
]) {
  for (const href of [manifestHref, llmsHref, fullIndexHref]) {
    if (!html.includes(`href="${escapeHtml(href)}"`)) {
      throw new Error(`${label} page must expose the owned machine entry: ${href}`);
    }
  }
}
for (const [label, html, state] of [
  ["Core", fs.readFileSync("dist/core/index.html", "utf8"), "Runtime substrate"],
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
const kfdLlms = fs.readFileSync("dist/kfd/llms.txt", "utf8");
const kfdReaderPath = readerContract.surfacePaths.find((entry) => entry.id === "kfd");
const kfdQuestionPosition = kfdHomeHtml.indexOf(escapeHtml(kfdReaderPath.question));
const kfdAuthorityPosition = kfdHomeHtml.indexOf(escapeHtml(kfdSite.homepage.title), kfdQuestionPosition + 1);
if (
  kfdQuestionPosition < 0
  || kfdAuthorityPosition <= kfdQuestionPosition
  || !kfdHomeHtml.includes('data-reader-surface="kfd"')
  || !kfdLlms.includes(kfdReaderPath.question)
  || !kfdLlms.includes(kfdReaderPath.promise)
) {
  throw new Error("KFD must present the site-owned reader question before bundle-owned authority in human and agent entries");
}
const kfdFuturePicture = kfdSite.homepage.futurePicture || {};
const kfdFutureQuestion = kfdFuturePicture.question
  || kfdFuturePicture.pastToFuture
  || kfdSite.homepage.lead;
if (kfdHomeHtml.includes('name="robots"') && kfdHomeHtml.includes("noindex")) {
  throw new Error("KFD production artifact must not embed robots noindex metadata");
}
if (
  !kfdHomeHtml.includes('data-kfd-future-picture="question"')
  || !kfdHomeHtml.includes(escapeHtml(kfdFutureQuestion.replace(/\*\*/g, "").slice(0, 24)))
) {
  throw new Error("KFD homepage must render the bundle-owned core question");
}
for (const [field, compatibilityField, marker] of [
  ["engineeringAnswer", "kungfuPath", "engineering-answer"],
  ["claimBoundary", undefined, "claim-boundary"],
]) {
  const value = kfdFuturePicture[field] || (compatibilityField ? kfdFuturePicture[compatibilityField] : undefined);
  if (value && (
    !kfdHomeHtml.includes(`data-kfd-future-picture="${marker}"`)
    || !kfdHomeHtml.includes(escapeHtml(value))
  )) {
    throw new Error(`KFD homepage must render homepage.futurePicture.${field}`);
  }
}
if (kfdHomeHtml.includes('data-kfd-section="future-picture"')) {
  throw new Error("KFD homepage must not duplicate the future-picture section below the hero");
}
for (const sourceField of ["futurePicture.engineeringAnswer", "futurePicture.claimBoundary"]) {
  if (!renderSiteSource.includes(sourceField)) {
    throw new Error(`KFD renderer must explicitly consume ${sourceField}`);
  }
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
if (
  !kfdHomeHtml.includes('class="hero-answer" style="max-width: 820px; color: var(--fg); font-size: 18px; line-height: 1.5;"')
  || !kfdHomeHtml.includes('class="hero-claim-boundary" style="max-width: 820px; font-size: 14px; line-height: 1.55;"')
) {
  throw new Error("KFD future picture must retain its scoped hero typography");
}
if (
  kfdHomeHtml.includes("<p>### Why KFD-4 is the first derived operator</p>")
  || !kfdHomeHtml.includes('<h3 id="why-kfd-4-is-the-first-derived-operator"')
  || !kfdHomeHtml.includes('<div class="stack doc-content" style="margin-top: 18px;">')
  || !kfdHomeHtml.includes('<pre><code class="language-text">KFD-1 makes timelines evidentiary.')
) {
  throw new Error("KFD foundation explanation must render bundle block Markdown with document code-block styling");
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
const kfdFormalModelPath = `${kfdSite.formalPage.url.replace(/\/+$/, "")}/`;
const kfdFormalModelCanonicalHtml = fs.readFileSync("dist/kfd/formal/index.html", "utf8");
if (fs.readFileSync("dist/formal/index.html", "utf8") !== kfdFormalModelCanonicalHtml) {
  throw new Error("KFD formal model subdomain route alias drifted: dist/formal/index.html");
}
if (
  !kfdHomeHtml.includes(`href="${escapeHtml(kfdFormalModelPath)}"`)
  || !kfdFormalModelCanonicalHtml.includes('aria-label="Formal model sections"')
  || !kfdFormalModelCanonicalHtml.includes(`<a href="${escapeHtml(kfdFormalModelPath)}" aria-current="page">Formal model</a>`)
  || !kfdFormalModelCanonicalHtml.includes(escapeHtml(kfdSite.formalPage.sourcePath))
) {
  throw new Error("KFD formal model page is missing bundle-owned content, navigation, or metadata");
}
const kfdTerminologyPath = `${kfdSite.terminologyPage.url.replace(/\/+$/, "")}/`;
const kfdTerminologyCanonicalHtml = fs.readFileSync("dist/kfd/terminology/index.html", "utf8");
if (fs.readFileSync("dist/terminology/index.html", "utf8") !== kfdTerminologyCanonicalHtml) {
  throw new Error("KFD terminology subdomain route alias drifted: dist/terminology/index.html");
}
if (
  !kfdHomeHtml.includes(`href="${escapeHtml(kfdTerminologyPath)}"`)
  || !kfdTerminologyCanonicalHtml.includes('aria-label="Terminology sections"')
  || !kfdTerminologyCanonicalHtml.includes(`<a href="${escapeHtml(kfdTerminologyPath)}" aria-current="page">Terminology</a>`)
  || !kfdTerminologyCanonicalHtml.includes('href="/terminology.json"')
  || !kfdTerminologyCanonicalHtml.includes(escapeHtml(kfdSite.terminologyPage.sourcePath))
) {
  throw new Error("KFD terminology page is missing bundle-owned content, navigation, contract link, or metadata");
}
for (const [renderedPath, expected] of [
  ["dist/kfd/terminology.json", kfdTerminology],
  ["dist/terminology.json", kfdTerminology],
  ["dist/kfd/schemas/kfd-terminology.schema.json", kfdTerminologySchema],
  ["dist/schemas/kfd-terminology.schema.json", kfdTerminologySchema],
]) {
  if (JSON.stringify(JSON.parse(fs.readFileSync(renderedPath, "utf8"))) !== JSON.stringify(expected)) {
    throw new Error(`KFD terminology machine artifact drifted: ${renderedPath}`);
  }
}
if (
  kfdAgentManifest.formalModel?.path !== kfdFormalModelPath
  || kfdAgentManifest.terminology?.path !== kfdTerminologyPath
  || kfdAgentManifest.agentEntries?.terminology !== expectedSurfaceEndpoint("kfd", "terminology.json")
  || kfdAgentManifest.agentEntries?.terminologySchema !== expectedSurfaceEndpoint("kfd", "schemas/kfd-terminology.schema.json")
  || !kfdAgentManifest.readOrder.includes(expectedSurfaceEndpoint("kfd", kfdFormalModelPath.replace(/^\/+/, "")))
  || !kfdAgentManifest.readOrder.includes(expectedSurfaceEndpoint("kfd", kfdTerminologyPath.replace(/^\/+/, "")))
) {
  throw new Error("KFD agent manifest is missing formal model or terminology surfaces");
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
  !kfdCasesCanonicalHtml.includes("<table>") ||
  !kfdCasesCanonicalHtml.includes('href="../cases/registry.json"')
) {
  throw new Error("KFD cases page is missing navigation, registry, or rendered tables");
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
const currentDecisionsPosition = kfdHomeHtml.indexOf('id="current-decisions"');
const currentCandidatesPosition = kfdHomeHtml.indexOf('data-kfd-section="current-candidates"');
if (
  currentDecisionsPosition < 0
  || currentCandidatesPosition < currentDecisionsPosition
  || !kfdHomeHtml.slice(currentDecisionsPosition, currentCandidatesPosition).includes(
    '<p class="eyebrow">numbered authority</p>',
  )
  || !kfdHomeHtml.slice(currentCandidatesPosition).includes(
    '<p class="eyebrow">non-normative</p>',
  )
) {
  throw new Error("KFD homepage must place non-normative candidates after numbered authority");
}
const decisionMetadataPosition = kfdHomeHtml.indexOf('data-kfd-section="decision-metadata"');
const decisionMetadataEnd = kfdHomeHtml.indexOf("</section>", decisionMetadataPosition);
const decisionMetadataHtml = kfdHomeHtml.slice(decisionMetadataPosition, decisionMetadataEnd);
for (const expectedLink of [
  'href="https://github.com/kungfu-systems/kfd"',
  'href="#current-decisions"',
  'href="/registry.json"',
  'href="/standards.json"',
  'href="/drafts/registry.json"',
  'href="/cases/registry.json"',
  'href="/"',
]) {
  if (!decisionMetadataHtml.includes(expectedLink)) {
    throw new Error(`KFD decision metadata is missing clickable reference: ${expectedLink}`);
  }
}
if (
  !kfdCandidateIndexCanonicalHtml.includes('aria-label="Candidate index sections"')
  || !kfdCandidateIndexCanonicalHtml.includes(`<a href="${escapeHtml(kfdCandidateIndexPath)}" aria-current="page">Candidates</a>`)
  || !kfdCandidateIndexCanonicalHtml.includes(`href="${escapeHtml(kfdCandidateIndexPath)}registry.json"`)
  || !kfdCandidateIndexCanonicalHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "drafts/registry.json"))}"`)
) {
  throw new Error("KFD candidate index is missing navigation or its machine registry link");
}
const candidateNavPosition = kfdCandidateIndexCanonicalHtml.indexOf(
  `<a href="${escapeHtml(kfdCandidateIndexPath)}" aria-current="page">Candidates</a>`,
);
for (const entry of kfdRegistry.entries) {
  const stableNavPosition = kfdCandidateIndexCanonicalHtml.indexOf(
    `<a href="/${escapeHtml(String(entry.number))}/">${escapeHtml(entry.id)}</a>`,
  );
  if (stableNavPosition < 0 || stableNavPosition > candidateNavPosition) {
    throw new Error(`KFD navigation must place stable ${entry.id} before Candidates`);
  }
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
  const formalCandidate = kfdCandidateFormalPageByCandidateId.get(candidate.id);
  if (
    formalCandidate
    && !candidateCanonicalHtml.includes(
      `<a class="toc-related-link" href="${escapeHtml(formalCandidate.url)}">Formal candidate</a>`,
    )
  ) {
    throw new Error(`KFD candidate page is missing its formal child navigation: ${candidate.id}`);
  }
}
for (const formalCandidate of kfdCandidateFormalPages) {
  const parent = kfdCandidatePages.find((candidate) => candidate.id === formalCandidate.candidateId);
  const output = formalCandidate.url.replace(/^\/+|\/+$/g, "");
  const formalCanonicalHtml = fs.readFileSync(`dist/kfd/${output}/index.html`, "utf8");
  const formalAliasHtml = fs.readFileSync(`dist/${output}/index.html`, "utf8");
  if (formalAliasHtml !== formalCanonicalHtml) {
    throw new Error(`KFD formal candidate alias drifted: ${formalCandidate.id}`);
  }
  if (
    !formalCanonicalHtml.includes('aria-label="Formal candidate sections"')
    || !formalCanonicalHtml.includes(
      `<span class="page-kicker-state">formal candidate / ${escapeHtml(formalCandidate.formalCandidateStatus)}</span>`,
    )
    || !formalCanonicalHtml.includes(
      `<a href="${escapeHtml(parent.url)}" aria-label="Back to ${escapeHtml(parent.title)}">`,
    )
    || !formalCanonicalHtml.includes(
      `<a class="doc-nav-child" href="${escapeHtml(parent.url)}">${escapeHtml(parent.title)}</a>`,
    )
    || !formalCanonicalHtml.includes(
      `<a class="doc-nav-child" style="margin-left: 28px;" href="${escapeHtml(formalCandidate.url)}" aria-current="page">Formal candidate</a>`,
    )
    || !formalCanonicalHtml.includes(escapeHtml(formalCandidate.relationship))
    || !formalCanonicalHtml.includes(escapeHtml(formalCandidate.sourcePath))
    || !formalCanonicalHtml.includes(escapeHtml(formalCandidate.authorityPath))
    || !formalCanonicalHtml.includes(`<code>${escapeHtml(String(formalCandidate.normative))}</code>`)
    || !formalCanonicalHtml.includes(`<code>${escapeHtml(String(formalCandidate.formalCandidateVersion))}</code>`)
    || !formalCanonicalHtml.includes(`href="${escapeHtml(parent.url)}"`)
    || !formalCanonicalHtml.includes('href="/7/formal/"')
    || !formalCanonicalHtml.includes('href="/drafts/registry.json"')
  ) {
    throw new Error(`KFD formal candidate page is missing declared facts or navigation: ${formalCandidate.id}`);
  }
  if (/href="(?:\.\.?\/|[^":/#]+\.md(?:#|"))/.test(formalCanonicalHtml)) {
    throw new Error(`KFD formal candidate page has unresolved package markdown links: ${formalCandidate.id}`);
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
for (const layer of kfdSite.homepage.foundation.layers) {
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
  const stableUrlLink = `<a href="/${escapeHtml(entry.number)}/"><code>${escapeHtml(entry.url)}</code></a>`;
  const sourcePathLink = `<a href="https://github.com/kungfu-systems/kfd/blob/${escapeHtml(encodeURIComponent(kfdSourceRef))}/${escapeHtml(entry.path)}"><code>${escapeHtml(entry.path)}</code></a>`;
  if (!html.includes(stableUrlLink) || !html.includes(sourcePathLink)) {
    throw new Error(`${label} decision metadata links are incomplete`);
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
      || !formalHtml.includes(`href="${escapeHtml(kfdFormalModelPath)}"`)
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
grep -q 'Record once. Observe live. Recover from evidence.' dist/core/index.html
grep -q 'Append-only mmap Episode journal' dist/core/index.html
grep -q 'Storage is the bus' dist/core/index.html
grep -q 'Visibility is not durability.' dist/core/index.html
grep -q 'Spec and source contract' dist/core/index.html
grep -q 'libkungfu-core-runtime-surface' dist/core/manifest.json
grep -q 'Record once. Observe live. Recover from evidence.' dist/core/llms.txt
grep -q 'buildchain.libkungfu.dev' dist/buildchain/index.html
grep -q 'kfd.libkungfu.dev' dist/kfd/index.html
grep -q 'Projection source' dist/index.html
grep -q 'pinned release artifacts' dist/index.html
grep -q 'Kungfu Origin Technology Limited' dist/index.html
grep -q '@kungfu-tech/buildchain' dist/buildchain/index.html
grep -q '2.14.13' dist/buildchain/index.html
grep -q 'grid-auto-rows: 1fr;' dist/index.html
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
