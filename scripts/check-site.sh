#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

node scripts/check-infra-outputs.mjs
node scripts/check-dogfood-evidence.mjs

pnpm exec buildchain badges readme --check

if grep -RInE --exclude-dir=core-preview \
  'mailto:|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  README.md docs public src dist 2>/dev/null; then
  echo "error: email address or mailto link found" >&2
  exit 1
fi

node - <<'NODE'
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { loadPublicationPackageSet, readPublicationArtifact } = require("./scripts/publication-packages.cjs");
const renderSiteSource = fs.readFileSync("scripts/render-site.mjs", "utf8");
const webSurfaceWorkflow = fs.readFileSync(".github/workflows/buildchain-web-surface.yml", "utf8");
if (!webSurfaceWorkflow.includes("export DOGFOOD_EVIDENCE_REQUIRED=true")) {
  throw new Error("published site builds must fail closed when the public dogfood snapshot cannot be admitted");
}
for (const projectionContract of [
  'projection === "kungfu-tech"',
  'parentOrigin === "https://kungfu.tech"',
  '"kungfu.dogfood.timeline/v1"',
  '"kungfu.dogfood.timeline.request/v1"',
  '"kungfu.dogfood.snapshot.request/v1"',
  '"kungfu.dogfood.snapshot.response/v1"',
  'event.origin !== parentOrigin || event.source !== window.parent',
]) {
  if (!renderSiteSource.includes(projectionContract)) {
    throw new Error(`dogfood projection bridge missing safety contract: ${projectionContract}`);
  }
}
const requiredBaseFiles = [
  "src/fixtures/site-manifest.json",
  "src/fixtures/libkungfu-runtime-surface.json",
  "src/fixtures/dogfood-evidence.json",
  "scripts/prepare-dogfood-render-input.mjs",
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
  "dist/404.html",
  "dist/architecture/index.html",
  "dist/core/index.html",
  "dist/core/runtime/index.html",
  "dist/core/format/index.html",
  "dist/core/format/manifest.json",
  "dist/core/format/authority.json",
  "dist/core/format/reader-matrix.json",
  "dist/core/format/compatibility.json",
  "dist/core/format/registry.json",
  "dist/core/format/vectors/index.json",
  "dist/core/primitives/index.html",
  "dist/core/abi/index.html",
  "dist/core/sdk/index.html",
  "dist/core/extensions/index.html",
  "dist/core/products/index.html",
  "dist/core/qualification/index.html",
  "dist/core/decisions/index.html",
  "dist/core/horizons/index.html",
  "dist/core/manifest.json",
  "dist/core/site-bundle.json",
  "dist/core/agent-index.json",
  "dist/core/adr-map.json",
  "dist/core/schema/site-bundle.schema.json",
  "dist/core/llms.txt",
  "dist/core/llms-full.txt",
  "dist/buildchain/index.html",
  "dist/buildchain/mechanism/index.html",
  "dist/kfd/index.html",
  "dist/kfd/decisions/index.html",
  "dist/kfd/agent-hub/index.html",
  "dist/agent-hub/index.html",
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
  "dist/papers/archive/index.html",
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
  "dist/agent-supply-chain.json",
  "dist/dogfood/index.html",
  "dist/dogfood-evidence.json",
  "dist/llms.txt",
  "dist/papers/index.html",
  "dist/papers/manifest.json",
  "dist/papers/registry.json",
  "dist/papers/llms.txt",
];

const notFoundPage = fs.readFileSync("dist/404.html", "utf8");
if (!notFoundPage.includes('<meta name="robots" content="noindex">') || !notFoundPage.includes('href="/"')) {
  throw new Error("dist/404.html must be noindex and link to the site root");
}

const site = JSON.parse(fs.readFileSync("src/fixtures/site-manifest.json", "utf8"));
const coreBundle = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/site/dist/site/site-bundle.json", "utf8"));
const coreAgentIndex = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/site/dist/site/agent-index.json", "utf8"));
const coreAdrMap = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/site/dist/site/adr-map.json", "utf8"));
const corePackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/site/package.json", "utf8"));
const coreSiteApi = require("@kungfu-tech/site");
const coreBundleVerification = coreSiteApi.verifyBundle();
const coreFormatManifest = coreSiteApi.loadFormatAuthorityManifest();
const coreFormatRoutes = Object.fromEntries(
  Object.keys(coreBundle.formatAuthority?.routes || {}).map((routeId) => [
    routeId,
    coreSiteApi.loadFormatAuthorityRoute(routeId),
  ]),
);
const coreManifest = JSON.parse(fs.readFileSync("dist/core/manifest.json", "utf8"));
const runtimeSurface = JSON.parse(fs.readFileSync("src/fixtures/libkungfu-runtime-surface.json", "utf8"));
const dogfoodRenderInputPath = ".buildchain/render-inputs/dogfood-evidence.json";
const dogfoodRenderSourcePath = ".buildchain/render-inputs/dogfood-evidence-source.json";
const dogfoodEvidence = JSON.parse(fs.readFileSync(dogfoodRenderInputPath, "utf8"));
const dogfoodEvidenceSource = JSON.parse(fs.readFileSync(dogfoodRenderSourcePath, "utf8"));
const publicationPackageSet = JSON.parse(fs.readFileSync("src/publication-packages.json", "utf8"));
const publicationSource = loadPublicationPackageSet(process.cwd());
const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));
const runtimeProjection = JSON.parse(fs.readFileSync("dist/runtime.json", "utf8"));
const agentSupplyChain = JSON.parse(fs.readFileSync("dist/agent-supply-chain.json", "utf8"));
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
const expectedBuildchainVersion = "3.0.2-alpha.2";
const expectedKfdVersion = kfdPropagationLock?.upstream?.package?.version || "1.0.0-alpha.41";
const expectedCoreSiteVersion = "4.0.0-alpha.1";
const expectedCoreSitePickup = "4.0.0-alpha.1";
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
const kfdStandalonePages = kfdSite.standalonePages || [];
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
  ...kfdStandalonePages.flatMap((entry) => {
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
  const localMatch = pnpmLockText.match(localPattern);
  if (!localMatch) {
    throw new Error(`pnpm-lock.yaml missing ${packageName}@${version}`);
  }
  return {
    version,
    integrity: localMatch[1].trim(),
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
const coreSiteLock = readPnpmLockPackage("@kungfu-tech/site", expectedCoreSiteVersion);
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
  ["@kungfu-tech/site", corePackage],
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
  throw new Error("published dogfood evidence must preserve the admitted render input semantically");
}
if (
  dogfoodEvidenceSource.contract !== "kungfu-site-dogfood-render-input"
  || !["observed-immutable", "retained-fixture"].includes(dogfoodEvidenceSource.selection)
  || dogfoodEvidenceSource.snapshotId !== dogfoodEvidence.snapshotId
  || dogfoodEvidenceSource.observedAt !== dogfoodEvidence.observation.observedAt
  || crypto.createHash("sha256").update(fs.readFileSync(dogfoodRenderInputPath)).digest("hex") !== dogfoodEvidenceSource.sha256
) {
  throw new Error("dogfood render input source contract or digest is invalid");
}
if (crypto.createHash("sha256").update(fs.readFileSync("dist/dogfood-evidence.json")).digest("hex") !== dogfoodEvidenceSource.sha256) {
  throw new Error("published dogfood evidence bytes do not match the admitted immutable snapshot");
}
if (
  manifest.observedEvidence?.snapshotId !== dogfoodEvidenceSource.snapshotId
  || manifest.observedEvidence?.sha256 !== dogfoodEvidenceSource.sha256
  || manifest.observedEvidence?.immutableUrl !== dogfoodEvidenceSource.immutableUrl
) {
  throw new Error("site manifest does not expose the admitted dogfood render input");
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
  "Related first-party interpretation",
  "A Public Week of Agent-Mediated Work",
  "This interpretation is not additional qualification evidence.",
]) {
  if (!dogfoodHtml.includes(requiredText.replaceAll("&", "&amp;"))) {
    throw new Error(`dogfood page missing required evidence text: ${requiredText}`);
  }
}
if (!dogfoodHtml.includes(`href="${site.relatedInterpretations.dogfoodBootstrap.url}"`)) {
  throw new Error("dogfood page missing bounded bootstrap interpretation URL");
}
if (
  manifest.relatedInterpretations.dogfoodBootstrap.relationship !== "bounded-first-party-interpretation" ||
  manifest.relatedInterpretations.dogfoodBootstrap.claimBoundary !== "This interpretation is not additional qualification evidence."
) {
  throw new Error("site manifest must preserve the bootstrap interpretation boundary");
}
for (const historyContract of [
  'id="dogfood-snapshot-select"',
  'id="dogfood-previous"',
  'id="dogfood-next"',
  'id="dogfood-comparison-body"',
  "Append-only observation history",
  "overlapping rolling P30D windows",
  'role="status" aria-live="polite"',
]) {
  if (!dogfoodHtml.includes(historyContract)) {
    throw new Error(`dogfood page missing history interaction contract: ${historyContract}`);
  }
}
for (const runtimeContract of [
  'url.searchParams.set("snapshot", entry.snapshotId)',
  'window.addEventListener("popstate"',
  'throw new Error("snapshot sha256 mismatch")',
  'hero.setAttribute("aria-label"',
  "Unknown snapshot id; showing the latest verified observation.",
  "The requested snapshot failed integrity or schema validation; showing the latest verified observation.",
  "Date.parse(fetched.observation.observedAt) >= Date.parse(embeddedEvidence.observation.observedAt)",
  "The build-embedded snapshot remains a complete no-network projection.",
  "comparePrevious = true",
  "Choose a retained snapshot to compare adjacent observations.",
]) {
  if (!renderSiteSource.includes(runtimeContract)) {
    throw new Error(`dogfood renderer missing history runtime contract: ${runtimeContract}`);
  }
}
const historyWorkflow = fs.readFileSync(".github/workflows/dogfood-evidence-history-backfill.yml", "utf8");
const historyPublisher = fs.readFileSync("scripts/publish-dogfood-history-backfill.mjs", "utf8");
for (const workflowContract of [
  "workflow_dispatch:",
  "fetch-depth: 0",
  "--history-seed-file .buildchain/dogfood-history-backfill/history-seed.json",
  "--execute",
]) {
  if (!historyWorkflow.includes(workflowContract)) {
    throw new Error(`dogfood history workflow missing safety contract: ${workflowContract}`);
  }
}
if (/\bschedule:/.test(historyWorkflow)) {
  throw new Error("the one-time dogfood history backfill must not have a schedule trigger");
}
for (const publisherContract of ["--if-none-match", "verifyRemote(entry)", "read-after-write hash mismatch", "only after every immutable object passes read-after-write verification"]) {
  if (!historyPublisher.includes(publisherContract)) {
    throw new Error(`dogfood history publisher missing append-only safety contract: ${publisherContract}`);
  }
}
if (/\b(list-objects|delete-object|delete-objects)\b/.test(historyPublisher)) {
  throw new Error("dogfood history publisher must not list or delete production objects");
}
if (!/\.dogfood-flow li\s*\{[^}]*margin:\s*0;/.test(renderSiteSource)) {
  throw new Error("dogfood flow cards must reset inherited list margins");
}
for (const requiredPath of ["/dogfood/", "/dogfood-evidence.json"]) {
  if (!manifest.pages.some((page) => page.path === requiredPath && page.source === (dogfoodEvidenceSource.immutableUrl || dogfoodEvidenceSource.source) && page.sha256 === dogfoodEvidenceSource.sha256)) {
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
  agentSupplyChain.contract !== "kungfu-agent-supply-chain-public-narrative/v1"
  || agentSupplyChain.layers?.map((layer) => layer.id).join(",") !== "kfd-3,buildchain,kfd-2,libkungfu,agent-hub-portability"
  || agentSupplyChain.notClaimed?.includes("two independent production Hubs") !== true
  || agentSupplyChain.notClaimed?.includes("external vendor adoption or endorsement") !== true
  || !agentSupplyChain.vendorNextAction?.includes("30-day assessment")
  || agentSupplyChain.layers.some((layer) => !layer.owner || !layer.input || !layer.output)
  || agentSupplyChain.layers.some((layer) => !layer.evidenceCoordinates?.length || !layer.knownLimits?.length)
  || JSON.stringify(runtimeProjection.agentSupplyChain) !== JSON.stringify(agentSupplyChain)
) {
  throw new Error("Agent Supply Chain human and machine contract drifted");
}
const agentSupplyChainHtml = fs.readFileSync("dist/index.html", "utf8");
const agentSupplyChainDetailHtml = fs.readFileSync("dist/architecture/index.html", "utf8");
for (const requiredText of [
  "Five responsibilities. Independent owners. One inspectable path.",
  agentSupplyChain.categoryStatement,
  agentSupplyChain.claimBoundary,
  ...agentSupplyChain.layers.flatMap((layer) => [layer.owner, layer.statement, layer.statusClass]),
]) {
  if (!agentSupplyChainHtml.includes(requiredText)) throw new Error(`hub overview missing ${requiredText}`);
}
for (const requiredText of [
  "Known limit:",
  "Qualified first-party reference adopter",
  "Independent conforming implementation · not yet claimed as adopted",
]) {
  if (!agentSupplyChainDetailHtml.includes(requiredText)) throw new Error(`architecture detail missing ${requiredText}`);
}
if (
  !agentSupplyChainHtml.includes('href="/agent-supply-chain.json"')
  || agentSupplyChainHtml.includes("Known limit:")
) {
  throw new Error("Hub overview must keep the Agent Supply Chain concise and route detail down-level");
}
if (!manifest.pages.some((page) => page.path === "/agent-supply-chain.json")) {
  throw new Error("site manifest missing Agent Supply Chain machine route");
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
  runtimeSurface.architectureSources?.kfd?.commit !== "b7e7773c9c310a6a30f70e83fb8b890d45cd63ba" ||
  runtimeSurface.architectureSources?.kfd?.profile !== "kfd-agent-hub@0.1.0-alpha.1" ||
  runtimeSurface.architectureSources?.kfd?.manifestDigest !== "sha256:dab4e93d2a662092eb51e29171dfc8bd0c400daa99899f074e69608b45cc7a59" ||
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
if (
  coreBundle.contract !== "kungfu.site-bundle/v1"
  || corePackage.name !== "@kungfu-tech/site"
  || corePackage.version !== expectedCoreSiteVersion
  || coreBundle.package?.version !== expectedCoreSiteVersion
) {
  throw new Error("Core product bundle contract mismatch");
}
if (packageJson.dependencies["@kungfu-tech/buildchain"] !== expectedBuildchainVersion) {
  throw new Error(`Buildchain dependency must be pinned to ${expectedBuildchainVersion}`);
}
if (packageJson.dependencies["@kungfu-tech/kfd"] !== expectedKfdVersion) {
  throw new Error(`KFD dependency must be pinned to ${expectedKfdVersion}`);
}
if (packageJson.dependencies["@kungfu-tech/site"] !== expectedCoreSitePickup) {
  throw new Error(`Core site dependency must use the immutable pickup ${expectedCoreSitePickup}`);
}
if (!buildchainLock || buildchainLock.version !== expectedBuildchainVersion) {
  throw new Error(`Buildchain lockfile entry must resolve to ${expectedBuildchainVersion}`);
}
if (!kfdLock || kfdLock.version !== expectedKfdVersion) {
  throw new Error(`KFD lockfile entry must resolve to ${expectedKfdVersion}`);
}
if (!coreSiteLock || coreSiteLock.version !== expectedCoreSiteVersion) {
  throw new Error(`Core site lockfile entry must resolve to ${expectedCoreSiteVersion}`);
}
const expectedPaperPackageNames = [
  "@kungfu-tech/paper-kungfu-product-white-paper",
  "@kungfu-tech/paper-kfd-foundation-real-world-agent-work",
  "@kungfu-tech/paper-observer-declared-timelines",
  "@kungfu-tech/paper-episodes-to-primitives",
  "@kungfu-tech/paper-kfd-machine-life-roadmap",
];
const expectedPaperIds = [
  "kungfu-product-white-paper",
  "kfd-foundation-real-world-agent-work",
  "observer-declared-timelines",
  "episodes-to-primitives",
  "kfd-machine-life-roadmap",
];
if (
  publicationPackageSet.contract !== "libkungfu-dev-publication-package-set" ||
  expectedPaperPackages.map((entry) => entry.name).join(",") !== expectedPaperPackageNames.join(",")
) {
  throw new Error("publication package set must declare the five current paper packages in canonical order");
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
const kfdLoadBearingPage = kfdStandalonePages.find((entry) => entry.id === "load-bearing-dogfood");
if (
  !kfdLoadBearingPage
  || kfdLoadBearingPage.url !== "/under-load"
  || kfdLoadBearingPage.sourcePath !== "docs/load-bearing-dogfood.md"
  || kfdLoadBearingPage.normative !== false
  || kfdLoadBearingPage.rendering?.kind !== "markdown-document"
  || kfdLoadBearingPage.rendering?.tocDepth !== 3
  || JSON.stringify(kfdSite.loadBearingPage) !== JSON.stringify(kfdLoadBearingPage)
) {
  throw new Error("KFD site bundle must expose the governed load-bearing dogfood standalone page");
}
for (const pageEntry of kfdStandalonePages) {
  if (
    !pageEntry.id
    || !pageEntry.title
    || !pageEntry.sourcePath
    || !pageEntry.url?.startsWith("/")
    || !pageEntry.relationship
    || typeof pageEntry.normative !== "boolean"
    || pageEntry.rendering?.kind !== "markdown-document"
    || !pageEntry.markdown
  ) {
    throw new Error(`KFD standalone page contract mismatch: ${pageEntry.id || pageEntry.url || "unknown"}`);
  }
}
if (
  kfdSite.agentHubPage?.id !== "agent-hub"
  || kfdSite.agentHubPage?.url !== "/agent-hub"
  || kfdSite.agentHubPage?.normative !== false
  || kfdSite.agentHubPage?.suite?.fixedVectorCount !== 20
  || JSON.stringify(kfdSite.agentHubPage?.scaffoldLanguages) !== JSON.stringify(["cpp", "node", "python", "rust"])
  || kfdSite.agentHubPage?.commands?.kungfuProduct !== "kungfu agent hub qualify --output-dir <new-directory> [--json]"
  || !kfdSite.agentHubPage?.firstPartyProductProjection?.run
  || !kfdSite.agentHubPage?.firstPartyProductProjection?.verify
  || !kfdSite.agentHubPage?.firstPartyProductProjection?.ownership
  || !kfdSite.agentHubPage?.claimBoundary
  || !Array.isArray(kfdSite.agentHubPage?.sections)
  || kfdSite.agentHubPage.sections.length === 0
) {
  throw new Error("KFD site bundle must expose the fixed Agent Hub product-qualification contract");
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
  ["stable", buildchainContractLock, "v3"],
  ["alpha", buildchainAlphaContractLock, "v3-alpha"],
]) {
  if (
    lock.contract !== "kungfu-buildchain-contract-lock" ||
    lock.buildchain?.ref !== expectedRef ||
    lock.buildchain?.majorLine !== "v3" ||
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
  coreBundle.schemaVersion !== 1
  || coreBundle.surfaces?.map((surface) => surface.id).join(",") !== "overview,format,primitives,runtime,abi,sdk,extensions,products,qualification,decisions,horizons"
  || coreBundle.adoptionLayers?.length !== 6
  || coreBundle.sources?.length !== 27
  || coreBundle.source?.reproducible !== true
  || typeof coreBundle.source?.treeDirty !== "boolean"
  || !/^[0-9a-f]{40}$/.test(coreBundle.source?.revision || "")
  || !/^sha256:[0-9a-f]{64}$/.test(coreBundle.contentRoot || "")
  || !/^sha256:[0-9a-f]{64}$/.test(coreBundle.sourceRoot || "")
  || coreAgentIndex.bundleContentRoot !== coreBundle.contentRoot
  || coreBundle.adrMap?.contentRoot !== sha256File("node_modules/@kungfu-tech/site/dist/site/adr-map.json")
  || coreAdrMap.summary?.records !== coreAdrMap.records?.length
  || JSON.stringify(coreAdrMap.summary) !== JSON.stringify(coreBundle.adrMap?.summary)
  || coreAdrMap.summary?.domains !== coreAdrMap.domains?.length
  || coreBundleVerification.status !== "passing"
  || coreBundleVerification.contentRoot !== coreBundle.contentRoot
  || coreBundleVerification.format?.manifestRoot !== coreBundle.formatAuthority?.pickup?.manifestRoot
  || coreFormatManifest.normative?.root !== coreBundle.formatAuthority?.normativeRoot
  || Object.keys(coreFormatRoutes).join(",") !== "overview,readerContract,versionMatrix,registry,vectors"
) {
  throw new Error("Core package bundle, source roots, or ADR corpus projection drifted");
}
if (
  coreManifest.contract !== "core.libkungfu.dev/site-bundle-consumer/v1"
  || coreManifest.canonicalHost !== expectedSurfaceHost("core")
  || coreManifest.package?.name !== corePackage.name
  || coreManifest.package?.version !== corePackage.version
  || coreManifest.package?.integrity !== coreSiteLock.integrity
  || coreManifest.bundle?.contract !== coreBundle.contract
  || coreManifest.bundle?.contentRoot !== coreBundle.contentRoot
  || coreManifest.bundle?.sourceRoot !== coreBundle.sourceRoot
  || coreManifest.readerContract?.contract !== readerContract.contract
  || coreManifest.readerContract?.path?.id !== "core"
  || JSON.stringify(coreManifest.readerContract?.layers) !== JSON.stringify(readerContract.layers)
  || JSON.stringify(coreManifest.positioning) !== JSON.stringify(coreBundle.positioning)
  || JSON.stringify(coreManifest.adoptionLayers) !== JSON.stringify(coreBundle.adoptionLayers)
  || JSON.stringify(coreManifest.nonClaims) !== JSON.stringify(coreBundle.nonClaims)
  || coreManifest.formatAuthority?.normativeRoot !== coreBundle.formatAuthority?.normativeRoot
  || coreManifest.formatAuthority?.manifest !== expectedSurfaceEndpoint("core", "format/manifest.json")
  || Object.entries(coreBundle.formatAuthority.routes).some(([routeId, descriptor]) => (
    coreManifest.formatAuthority?.routes?.[routeId]?.artifactRoot !== descriptor.artifactRoot
    || coreManifest.formatAuthority?.routes?.[routeId]?.url !== expectedSurfaceEndpoint("core", descriptor.path)
  ))
) {
  throw new Error("Core site manifest drifted from the exact package bundle");
}
for (const [field, file] of [
  ["manifest", "manifest.json"],
  ["bundle", "site-bundle.json"],
  ["agentIndex", "agent-index.json"],
  ["adrMap", "adr-map.json"],
  ["schema", "schema/site-bundle.schema.json"],
  ["formatManifest", "format/manifest.json"],
  ["formatReaderContract", "format/reader-matrix.json"],
  ["formatVersionMatrix", "format/compatibility.json"],
  ["formatRegistry", "format/registry.json"],
  ["formatVectors", "format/vectors/index.json"],
  ["llms", "llms.txt"],
  ["full", "llms-full.txt"],
]) {
  if (coreManifest.machineEntries?.[field] !== expectedSurfaceEndpoint("core", file)) {
    throw new Error(`Core machine entry drifted: ${field}`);
  }
}
for (const [sourceFile, generatedFile] of [
  ["node_modules/@kungfu-tech/site/dist/site/site-bundle.json", "dist/core/site-bundle.json"],
  ["node_modules/@kungfu-tech/site/dist/site/agent-index.json", "dist/core/agent-index.json"],
  ["node_modules/@kungfu-tech/site/dist/site/adr-map.json", "dist/core/adr-map.json"],
  ["node_modules/@kungfu-tech/site/schema/site-bundle.schema.json", "dist/core/schema/site-bundle.schema.json"],
]) {
  if (!fs.readFileSync(sourceFile).equals(fs.readFileSync(generatedFile))) {
    throw new Error(`Core machine artifact must preserve exact package bytes: ${generatedFile}`);
  }
}
function listFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const child = path.join(relative, entry.name);
      return entry.isDirectory() ? listFiles(root, child) : [child];
    })
    .sort();
}
const packageFormatRoot = "node_modules/@kungfu-tech/site/dist/site/format";
for (const relativeFile of listFiles(packageFormatRoot)) {
  const sourceFile = path.join(packageFormatRoot, relativeFile);
  const generatedFile = path.join("dist/core/format", relativeFile);
  if (!fs.existsSync(generatedFile) || !fs.readFileSync(sourceFile).equals(fs.readFileSync(generatedFile))) {
    throw new Error(`Core Spec artifact must preserve exact package bytes: ${generatedFile}`);
  }
}
const coreHtml = fs.readFileSync("dist/core/index.html", "utf8");
const coreDetailHtml = fs.readFileSync("dist/core/runtime/index.html", "utf8");
const coreFormatHtml = fs.readFileSync("dist/core/format/index.html", "utf8");
const coreAdrHtml = fs.readFileSync("dist/core/decisions/index.html", "utf8");
const coreLlms = fs.readFileSync("dist/core/llms.txt", "utf8");
const coreFormatHumanTexts = [
  ".kungfu is a portable, verifiable record of real work.",
  "Keep the work, not just the conversation.",
  "How a fresh agent continues the same work",
  "Not understanding something is different from losing it.",
  "Qualified does not mean stable.",
];
for (const expectedText of coreFormatHumanTexts) {
  if (!coreFormatHtml.includes(escapeHtml(expectedText)) || !coreLlms.includes(expectedText)) {
    throw new Error(`Core format human and agent entries do not share the reader framing: ${expectedText}`);
  }
}
const coreFormatOrientationPosition = coreFormatHtml.indexOf("Keep the work, not just the conversation.");
const coreFormatTechnicalPosition = coreFormatHtml.indexOf('id="format-technical-details"');
if (
  coreFormatOrientationPosition < 0
  || coreFormatTechnicalPosition < 0
  || coreFormatOrientationPosition >= coreFormatTechnicalPosition
  || !coreFormatHtml.includes('<details class="panel core-format-technical" id="format-technical-details">')
  || coreFormatHtml.includes('<details class="panel core-format-technical" id="format-technical-details" open')
  || !renderSiteSource.includes(".core-format-technical:not([open]) > .core-format-technical-body")
) {
  throw new Error("Core format page must explain the human outcome before a closed technical disclosure");
}
const coreReaderPath = readerContract.surfacePaths.find((entry) => entry.id === "core");
if (
  !coreHtml.includes(escapeHtml(coreReaderPath.question))
  || !coreHtml.includes(escapeHtml(coreReaderPath.promise))
  || !coreLlms.includes(coreReaderPath.question)
  || !coreLlms.includes(coreReaderPath.promise)
) {
  throw new Error("Core human and agent entries must share the site-owned reader path");
}
for (const expectedText of [
  coreBundle.positioning.promise,
  coreBundle.positioning.firstReleaseOutcome,
  coreBundle.positioning.status,
  coreBundle.positioning.principle,
  ...coreBundle.adoptionLayers.flatMap((layer) => [layer.label, layer.maturity]),
]) {
  if (!coreHtml.includes(escapeHtml(expectedText)) || !coreLlms.includes(expectedText)) {
    throw new Error(`Core overview and agent entry do not share the product map claim: ${expectedText}`);
  }
}
const coreQualificationHtml = fs.readFileSync("dist/core/qualification/index.html", "utf8");
for (const expectedText of coreBundle.nonClaims) {
  if (!coreQualificationHtml.includes(escapeHtml(expectedText)) || !coreLlms.includes(expectedText)) {
    throw new Error(`Core qualification and agent entries do not share global non-claim: ${expectedText}`);
  }
}
const coreRuntime = coreBundle.surfaces.find((surface) => surface.id === "runtime");
for (const expectedText of [
  coreRuntime.presentation.architecture.writer.label,
  coreRuntime.presentation.architecture.journal.label,
  ...coreRuntime.presentation.architecture.readers.map((reader) => reader.label),
  ...coreRuntime.presentation.frontiers.flatMap((frontier) => [frontier.label, frontier.status]),
  coreRuntime.presentation.semanticBoundary.heading,
  coreRuntime.presentation.semanticBoundary.body,
  ...coreRuntime.presentation.semanticBoundary.invariants,
  ...coreRuntime.presentation.qualificationClaims,
]) {
  if (!coreDetailHtml.includes(escapeHtml(expectedText))) {
    throw new Error(`Core runtime page does not preserve package presentation: ${expectedText}`);
  }
}
for (const surface of coreBundle.surfaces.filter((entry) => !["overview", "runtime", "decisions"].includes(entry.id))) {
  const surfaceHtml = fs.readFileSync(`dist/core/${surface.route.replace(/^\/+|\/+$/g, "")}/index.html`, "utf8");
  for (const expectedText of [
    surface.headline,
    surface.summary,
    ...surface.capabilities,
    ...surface.knownLimits,
    ...surface.sourceIds.flatMap((sourceId) => {
      const source = coreBundle.sources.find((entry) => entry.id === sourceId);
      return [source.path, source.contentRoot];
    }),
  ]) {
    if (!surfaceHtml.includes(escapeHtml(expectedText))) {
      throw new Error(`Core ${surface.id} page does not preserve package fact: ${expectedText}`);
    }
  }
}
for (const expectedText of [
  coreBundle.formatAuthority.pickup.coordinate,
  coreBundle.formatAuthority.formatNamespace,
  coreBundle.formatAuthority.status,
  coreBundle.formatAuthority.normativeRoot,
  coreBundle.formatAuthority.conformance.release,
  coreBundle.formatAuthority.conformance.releaseRoot,
  coreFormatRoutes.overview.value.boundary.definition,
  coreFormatRoutes.readerContract.value.rule,
  coreFormatRoutes.versionMatrix.value.composition_rule,
  coreFormatRoutes.versionMatrix.value.v4_alpha_baseline.latest_release,
  coreFormatRoutes.versionMatrix.value.v4_alpha_baseline.latest_release_root,
  ...coreFormatRoutes.readerContract.value.profiles.flatMap((profile) => [
    profile.id,
    profile.authorityEffect,
    profile.semanticScope,
    profile.unknownOutcome,
    profile.unsupportedRootOutcome,
  ]),
  ...coreFormatRoutes.overview.value.version_axes.flatMap((axis) => [
    axis.id,
    axis.owner,
    axis.changesWhen,
  ]),
  ...coreBundle.formatAuthority.nonClaims,
  ...Object.values(coreBundle.formatAuthority.routes).flatMap((descriptor) => [
    descriptor.path,
    descriptor.artifactRoot,
  ]),
]) {
  if (!coreFormatHtml.includes(escapeHtml(expectedText))) {
    throw new Error(`Core format page does not preserve packaged Spec fact: ${expectedText}`);
  }
}
for (const expectedText of [
  coreBundle.formatAuthority.pickup.coordinate,
  coreBundle.formatAuthority.normativeRoot,
  coreFormatRoutes.readerContract.value.rule,
  coreFormatRoutes.versionMatrix.value.composition_rule,
]) {
  if (!coreLlms.includes(expectedText)) {
    throw new Error(`Core agent entry does not preserve packaged Spec fact: ${expectedText}`);
  }
}
for (const record of coreAdrMap.records) {
  if (!coreAdrHtml.includes(escapeHtml(record.key)) || !coreAdrHtml.includes(escapeHtml(record.title))) {
    throw new Error(`Core ADR navigation is missing ${record.id}`);
  }
}
if (
  !coreDetailHtml.includes('<figure class="core-runtime-map" aria-labelledby="core-runtime-map-title">')
  || !coreDetailHtml.includes('<details class="panel core-source-contract">')
  || !renderSiteSource.includes("@media (prefers-reduced-motion: reduce)")
  || /\bzero[- ]cost\b|\bcrash-proof\b|\balways survives\b|\bproduction-qualified HA\b/i.test(coreDetailHtml)
) {
  throw new Error("Core runtime visual, secondary source contract, reduced-motion path, or claim language drifted");
}
if (
  coreHtml.includes('<figure class="core-runtime-map"')
  || coreHtml.includes("Visibility is not durability.")
  || coreHtml.includes('<details class="panel core-source-contract">')
  || !coreHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("core", "runtime/"))}" data-local-href="/core/runtime/"`)
) {
  throw new Error("Core overview must stay bounded and route complete mechanics to /runtime/");
}
if (renderSiteSource.includes('readFixtureJson("core-runtime-surface.json")') || fs.existsSync("src/fixtures/core-runtime-surface.json")) {
  throw new Error("Core must consume @kungfu-tech/site without retaining the legacy runtime fixture");
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
    if (versionHtml.includes("main-site-link") || versionHtml.includes("Back to the Kungfu main site")) {
      throw new Error(`immutable publication version page changed after the main-site header addition: ${publication.id}@${version.version}`);
    }
    if (versionHtml.includes(".publication-featured {") || versionHtml.includes(".publication-card-featured {")) {
      throw new Error(`immutable publication version page contains mutable papers-homepage styles: ${publication.id}@${version.version}`);
    }
    if (
      versionHtml.includes(".reader-orientation {")
      || versionHtml.includes(".reader-supply-chain {")
      || versionHtml.includes(".page-kicker > * {")
    ) {
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
const papersArchiveHtml = fs.readFileSync("dist/papers/archive/index.html", "utf8");
if (papersArchiveHtml.includes("main-site-link") || papersArchiveHtml.includes("Back to the Kungfu main site")) {
  throw new Error("immutable publication archive index changed after the main-site header addition");
}
if (papersArchiveHtml.includes(".publication-featured {") || papersArchiveHtml.includes(".publication-card-featured {")) {
  throw new Error("immutable publication archive index contains mutable papers-homepage styles");
}
const featuredPaperIds = ["kungfu-product-white-paper", "kfd-machine-life-roadmap"];
const expectedPaperCardOrder = [
  ...featuredPaperIds,
  ...publicationRenderedRegistry.publications
    .map((publication) => publication.id)
    .filter((publicationId) => !featuredPaperIds.includes(publicationId)),
];
let previousPaperCardPosition = -1;
for (const publicationId of expectedPaperCardOrder) {
  const publication = publicationRenderedRegistry.publications.find((entry) => entry.id === publicationId);
  if (!papersIndex.includes(escapeHtml(publication.title))) {
    throw new Error(`papers index missing publication: ${publication.id}`);
  }
  const paperCardPosition = papersIndex.indexOf(`href="${escapeHtml(expectedSurfaceEndpoint("papers", `${publication.id}/`))}"`);
  if (paperCardPosition <= previousPaperCardPosition) {
    throw new Error(`papers index card order drifted at publication: ${publication.id}`);
  }
  if (!papersArchiveHtml.includes(escapeHtml(publication.title))) {
    throw new Error(`papers archive evidence page missing publication: ${publication.id}`);
  }
  previousPaperCardPosition = paperCardPosition;
}
if (
  !papersIndex.includes('class="publication-featured"')
  || !papersIndex.includes('data-featured="present" data-publication-id="kungfu-product-white-paper"')
  || !papersIndex.includes('data-featured="future" data-publication-id="kfd-machine-life-roadmap"')
  || !papersIndex.includes('class="grid three publication-grid publication-secondary-grid"')
) {
  throw new Error("papers index must visually prioritize the White Paper and Machine Life before supporting research");
}
if (papersIndex.includes("Publication Archive Fixture") || !papersIndex.includes("Kungfu Papers")) {
  throw new Error("papers index must be human-first and free of fixture content");
}
if (
  !papersIndex.includes(`href="${escapeHtml(expectedSurfaceEndpoint("papers", "archive/"))}"`)
  || papersIndex.includes("<dt>source</dt>")
  || !papersArchiveHtml.includes("Publication evidence")
  || !papersArchiveHtml.includes("must not delete or overwrite files under a declared immutable version prefix")
  || !publicationManifest.routes.some((route) => route.path === "/archive/" && route.host === expectedSurfaceHost("papers"))
) {
  throw new Error("Papers overview must route publication evidence to the bounded /archive/ page");
}
if (manifest.upstreamPackages.buildchain.version !== expectedBuildchainVersion) {
  throw new Error(`dist manifest does not record Buildchain ${expectedBuildchainVersion}`);
}
const buildchainHomeHtml = fs.readFileSync("dist/buildchain/index.html", "utf8");
const buildchainDetailHtml = fs.readFileSync("dist/buildchain/mechanism/index.html", "utf8");
const kfdDetailHtml = fs.readFileSync("dist/kfd/decisions/index.html", "utf8");
const expectedBuildchainBadgeHost = expectedSurfaceEndpoint("buildchain", "badges/v1/");
if (!buildchainDetailHtml.includes('class="lead badge-strip"')) {
  throw new Error("Buildchain mechanism page must render the README badge block as a badge strip");
}
if (
  !buildchainDetailHtml.includes(`<img src="${escapeHtml(`${expectedBuildchainBadgeHost}kfd-1/passed.svg`)}"`) ||
  !buildchainDetailHtml.includes(`<img src="${escapeHtml(`${expectedBuildchainBadgeHost}buildchain-release-passport/passed.svg`)}"`)
) {
  throw new Error("Buildchain mechanism badges must render as channel-aware image tags");
}
if (buildchainDetailHtml.includes("<!-- buildchain:badges:") || buildchainDetailHtml.includes("[![KFD-1:")) {
  throw new Error("Buildchain mechanism page must not expose raw README badge markdown");
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
const kfdAgentHubPath = `${kfdSite.agentHubPage.url.replace(/\/+$/, "")}/`;
if (
  !manifest.pages.some(
    (page) =>
      page.host === expectedSurfaceHost("kfd")
      && page.path === kfdAgentHubPath
      && page.source.endsWith(`/${kfdSite.agentHubPage.authorityPath}`),
  )
) {
  throw new Error("dist manifest does not record the KFD Agent Hub qualification route");
}
for (const pageEntry of kfdStandalonePages) {
  const pagePath = `${pageEntry.url.replace(/\/+$/, "")}/`;
  if (
    !manifest.pages.some(
      (page) =>
        page.host === expectedSurfaceHost("kfd")
        && page.path === pagePath
        && page.source.endsWith(`/${pageEntry.sourcePath}`),
    )
  ) {
    throw new Error(`dist manifest does not record KFD standalone page: ${pageEntry.id}`);
  }
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
  kfdAgentManifest.humanEntries?.agentHub !== expectedSurfaceEndpoint("kfd", "agent-hub/") ||
  kfdAgentManifest.agentEntries?.manifest !== expectedSurfaceEndpoint("kfd", "manifest.json") ||
  kfdAgentManifest.agentEntries?.llms !== expectedSurfaceEndpoint("kfd", "llms.txt") ||
  kfdAgentManifest.agentEntries?.agentHub !== expectedSurfaceEndpoint("kfd", "agent-hub/")
) {
  throw new Error("KFD agent manifest must expose channel-aware KFD entries");
}
if (
  kfdAgentManifest.agentHub?.path !== kfdAgentHubPath
  || kfdAgentManifest.agentHub?.url !== expectedSurfaceEndpoint("kfd", "agent-hub/")
  || kfdAgentManifest.agentHub?.source !== `@kungfu-tech/kfd@${kfdPackage.version}/${kfdSite.agentHubPage.authorityPath}`
  || kfdAgentManifest.agentHub?.commands?.kungfuProduct !== kfdSite.agentHubPage.commands.kungfuProduct
  || kfdAgentManifest.agentHub?.firstPartyProductProjection?.run !== kfdSite.agentHubPage.firstPartyProductProjection.run
  || kfdAgentManifest.agentHub?.firstPartyProductProjection?.verify !== kfdSite.agentHubPage.firstPartyProductProjection.verify
  || kfdAgentManifest.agentHub?.firstPartyProductProjection?.ownership !== kfdSite.agentHubPage.firstPartyProductProjection.ownership
  || kfdAgentManifest.agentHub?.suite?.fixedVectorCount !== 20
  || JSON.stringify(kfdAgentManifest.agentHub?.scaffoldLanguages) !== JSON.stringify(kfdSite.agentHubPage.scaffoldLanguages)
  || kfdAgentManifest.agentHub?.claimBoundary !== kfdSite.agentHubPage.claimBoundary
  || !kfdAgentManifest.readOrder.includes(expectedSurfaceEndpoint("kfd", "agent-hub/"))
) {
  throw new Error("KFD agent manifest must explain and route the installed Kungfu Agent Hub qualification");
}
if (kfdAgentManifest.standalonePages?.length !== kfdStandalonePages.length) {
  throw new Error("KFD agent manifest standalone page count mismatch");
}
for (const pageEntry of kfdStandalonePages) {
  const pagePath = `${pageEntry.url.replace(/\/+$/, "")}/`;
  const renderedEntry = kfdAgentManifest.standalonePages.find((entry) => entry.id === pageEntry.id);
  if (
    renderedEntry?.path !== pagePath
    || renderedEntry?.url !== expectedSurfaceEndpoint("kfd", pagePath.replace(/^\/+/, ""))
    || renderedEntry?.source !== `@kungfu-tech/kfd@${kfdPackage.version}/${pageEntry.sourcePath}`
    || renderedEntry?.relationship !== pageEntry.relationship
    || renderedEntry?.normative !== pageEntry.normative
    || JSON.stringify(renderedEntry?.rendering) !== JSON.stringify(pageEntry.rendering)
    || !kfdAgentManifest.readOrder.includes(renderedEntry.url)
  ) {
    throw new Error(`KFD agent manifest is missing standalone page facts for ${pageEntry.id}`);
  }
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
const hubDetailHtml = fs.readFileSync("dist/architecture/index.html", "utf8");
const hubLlms = fs.readFileSync("dist/llms.txt", "utf8");
const immutableFoundationPaperHtml = fs.readFileSync(
  "dist/papers/archive/kfd-foundation-real-world-agent-work/v0.1.0-alpha.8/index.html",
  "utf8",
);
if (hubHtml.includes('name="robots"') && hubHtml.includes("noindex")) {
  throw new Error("production artifact must not embed robots noindex metadata");
}
if (!hubHtml.includes(".architecture-visual") || immutableFoundationPaperHtml.includes(".architecture-visual")) {
  throw new Error("embeddable runtime styles must remain homepage-local and must not mutate immutable paper HTML");
}
if (
  immutableFoundationPaperHtml.includes("brand-context")
  || immutableFoundationPaperHtml.includes('property="og:site_name" content="Kungfu UNGFU™"')
  || !immutableFoundationPaperHtml.includes('aria-label="Back to libkungfu.dev home">libkungfu.dev</a>')
) {
  throw new Error("brand rollout must not mutate immutable publication archive HTML");
}
if (hubHtml.includes(">Manifest</a>") || hubHtml.includes(">Agents</a>")) {
  throw new Error("human navigation should not expose machine-only Manifest or Agents links");
}
if (!hubHtml.includes(`<a class="brand" href="${escapeHtml(expectedSurfaceHref("hub"))}" data-local-href="/" aria-label="Kungfu UNGFU™ — Developer Platform; back to libkungfu.dev home"><span>Kungfu UNGFU™</span><span class="brand-context">Developer Platform</span></a>`)) {
  throw new Error("human header brand must expose the shared Kungfu signature, local role, canonical hub, and local fallback");
}
if (
  !hubHtml.includes(`<nav aria-label="Primary"><a href="${escapeHtml(expectedSurfaceHref("core"))}" data-local-href="/core/">Core</a><a href="${escapeHtml(expectedSurfaceHref("buildchain"))}" data-local-href="/buildchain/">Buildchain</a><a href="${escapeHtml(expectedSurfaceHref("kfd"))}" data-local-href="/kfd/">KFD</a><a href="${escapeHtml(expectedSurfaceHref("papers"))}" data-local-href="/papers/">Papers</a><a class="main-site-link" href="${escapeHtml(site.homepage.futureProducts.url)}" aria-label="Back to the Kungfu main site">kungfu.tech <span aria-hidden="true">↗</span></a></nav>`)
) {
  throw new Error("human header navigation must use canonical surface hosts, local fallbacks, and the Kungfu main-site return link");
}
for (const path of ["index.html", "core/index.html", "buildchain/index.html", "kfd/index.html", "papers/index.html"]) {
  const html = fs.readFileSync(`dist/${path}`, "utf8");
  if (!html.includes(`<a class="main-site-link" href="${escapeHtml(site.homepage.futureProducts.url)}" aria-label="Back to the Kungfu main site">kungfu.tech <span aria-hidden="true">↗</span></a>`)) {
    throw new Error(`${path} header must expose the Kungfu main-site return link`);
  }
}
if (hubHtml.includes(">Hub</a>")) {
  throw new Error("human navigation should not expose the abstract Hub label; the brand link owns home navigation");
}
if (!hubHtml.includes("Kungfu UNGFU™ is a trademark of Kungfu Origin Technology Limited.") || !hubHtml.includes("Open developer and agent substrate hub")) {
  throw new Error("human footer must expose the exact trademark notice and substrate boundary");
}
if (
  !hubHtml.includes('<meta name="application-name" content="Kungfu UNGFU™">')
  || !hubHtml.includes('<meta property="og:site_name" content="Kungfu UNGFU™">')
) {
  throw new Error("human metadata must expose the shared Kungfu brand signature");
}
if (
  manifest.brand?.signature !== "Kungfu UNGFU™"
  || manifest.brand?.context !== "Developer Platform"
  || manifest.brand?.productName !== "Kungfu"
  || !manifest.brand?.boundary.includes("not a second product or runtime")
) {
  throw new Error("machine manifest must expose the shared brand identity and product boundary");
}
if (
  !hubLlms.startsWith("# Kungfu UNGFU™ — Developer Platform")
  || !hubLlms.includes("UNGFU is not a second product or runtime")
) {
  throw new Error("agent entrypoint must expose the shared brand identity and product boundary");
}
if (!hubHtml.includes("Public collaboration starts on") || !hubHtml.includes('href="https://github.com/kungfu-systems"')) {
  throw new Error("human footer must route collaboration through GitHub");
}
if (hubHtml.includes("<h3>Agent index</h3>") || hubHtml.includes("<h3>Site manifest</h3>")) {
  throw new Error("human homepage should not render machine-entry cards");
}
const readerOrder = [
  escapeHtml(site.homepage.headline),
  "Five responsibilities. Independent owners. One inspectable path.",
  "The complete architecture now lives one level down.",
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
  !hubHtml.includes("Your Hub stays yours.")
  || !hubHtml.includes(escapeHtml(readerContract.guidedSynthesis.supplyChain.steps[0].summary))
  || !hubHtml.includes('href="/architecture/"')
  || hubHtml.includes(escapeHtml(runtimeSurface.actionWorld.headline))
  || hubHtml.includes(escapeHtml(runtimeSurface.hubNetwork.headline))
  || hubHtml.includes("Start with an Episode")
  || hubHtml.includes("KFD Runtime 100 and restart qualification")
) {
  throw new Error("homepage must preserve the Hub promise while routing detailed architecture one level down");
}
if (
  !hubHtml.includes(escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.run))
  || !hubHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "agent-hub/"))}" data-local-href="/kfd/agent-hub/"`)
  || !hubLlms.includes(kfdSite.agentHubPage.firstPartyProductProjection.run)
  || !hubLlms.includes(kfdSite.agentHubPage.firstPartyProductProjection.verify)
  || !hubLlms.includes(kfdSite.agentHubPage.firstPartyProductProjection.ownership)
  || !hubLlms.includes(kfdSite.agentHubPage.claimBoundary)
  || !hubLlms.includes(expectedSurfaceEndpoint("kfd", "agent-hub/"))
) {
  throw new Error("Hub first entries must expose and explain the installed Kungfu Agent Hub qualification");
}
for (const layer of readerContract.layers) {
  if (!hubDetailHtml.includes(escapeHtml(layer.label)) || !hubLlms.includes(layer.label)) {
    throw new Error(`human and agent entries must share reader layer: ${layer.label}`);
  }
}
for (const claim of rootReaderClaims) {
  if (![hubHtml, hubDetailHtml].some((html) => html.includes(escapeHtml(claim.summary))) || !hubLlms.includes(claim.summary)) {
    throw new Error(`human and agent entries must share reader synthesis: ${claim.summary}`);
  }
}
for (const claim of buildchainReaderClaims) {
  if (!buildchainDetailHtml.includes(escapeHtml(claim.summary)) || !hubLlms.includes(claim.summary)) {
    throw new Error(`Buildchain detail and agent entries must share reader synthesis: ${claim.summary}`);
  }
}
for (const retainedCapability of buildchainSynthesis.ownershipBoundary.retainedByHub) {
  if (!buildchainHomeHtml.includes(escapeHtml(retainedCapability)) || !hubLlms.includes(retainedCapability)) {
    throw new Error(`Buildchain human and agent entries must preserve Hub ownership: ${retainedCapability}`);
  }
}
const buildchainReaderOrder = [
  buildchainSynthesis.heading,
  buildchainSynthesis.trustLoop.heading,
  buildchainSynthesis.hubValue.heading,
  buildchainSynthesis.ecosystemEffect.heading,
  buildchainSynthesis.ownershipBoundary.heading,
  buildchainSite.homepage.title,
];
let previousBuildchainReaderPosition = -1;
for (const marker of buildchainReaderOrder) {
  const position = buildchainDetailHtml.indexOf(escapeHtml(marker), previousBuildchainReaderPosition + 1);
  if (position <= previousBuildchainReaderPosition) {
    throw new Error(`Buildchain reader order drifted at: ${marker}`);
  }
  previousBuildchainReaderPosition = position;
}
if (
  !buildchainHomeHtml.includes('id="buildchain-trust-loop"')
  || !buildchainHomeHtml.includes('data-claim-class="future-picture"')
  || !buildchainHomeHtml.includes('data-claim-class="non-claim"')
  || !buildchainHomeHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("buildchain", "mechanism/"))}" data-local-href="/buildchain/mechanism/"`)
  || buildchainHomeHtml.includes("Install and Verify")
  || buildchainHomeHtml.includes("CLI command registry")
) {
  throw new Error("Buildchain overview must preserve the trust loop and Hub boundary while routing package detail to /mechanism/");
}
for (const source of readerContract.sources) {
  let href;
  let localHref;
  if (source.kind === "git-document") {
    href = `${source.repository}/blob/${source.ref}/${source.path}`;
  } else if (source.package === "@kungfu-tech/kfd") {
    const match = /^decisions\/KFD-(\d+)\.md$/.exec(source.path);
    href = match ? expectedSurfaceEndpoint("kfd", `${match[1]}/`) : undefined;
    localHref = match ? `/${match[1]}/` : undefined;
  } else if (source.package === "@kungfu-tech/buildchain") {
    const match = /^docs\/(.+)\.md$/.exec(source.path);
    href = match ? expectedSurfaceEndpoint("buildchain", `docs/${match[1]}/`) : undefined;
  } else if (source.package === "@kungfu-tech/site") {
    href = expectedSurfaceEndpoint("core", "site-bundle.json");
  }
  if (!href || ![hubDetailHtml, coreHtml, buildchainDetailHtml, kfdDetailHtml].some((html) => (
    html.includes(`href="${escapeHtml(href)}"`)
    || (localHref && html.includes(`href="${escapeHtml(localHref)}"`))
  ))) {
    throw new Error(`human detail surfaces are missing the exact source link: ${source.id}`);
  }
}
for (const [label, html, pathEntry, authorityMarker] of [
  ["Core", coreHtml, readerContract.surfacePaths.find((entry) => entry.id === "core"), coreBundle.positioning.firstReleaseOutcome],
  ["Buildchain", buildchainHomeHtml, readerContract.surfacePaths.find((entry) => entry.id === "buildchain"), buildchainSynthesis.heading],
]) {
  const questionPosition = html.indexOf(escapeHtml(pathEntry.question));
  const authorityPosition = html.indexOf(escapeHtml(authorityMarker), questionPosition + 1);
  if (questionPosition < 0 || authorityPosition <= questionPosition || !html.includes(`data-reader-surface="${escapeHtml(pathEntry.id)}"`)) {
    throw new Error(`${label} must present the site-owned reader question before upstream authority`);
  }
}
if (
  !hubDetailHtml.includes(escapeHtml(runtimeSurface.actionWorld.headline)) ||
  !hubDetailHtml.includes(escapeHtml(runtimeSurface.hubNetwork.headline)) ||
  !hubDetailHtml.includes("KFD responsibility boundary") ||
  !hubDetailHtml.includes("Delivery") ||
  !hubDetailHtml.includes("Admission") ||
  !hubDetailHtml.includes("Occurrence") ||
  !hubDetailHtml.includes("Completion") ||
  !hubDetailHtml.includes("Authentication") ||
  !hubDetailHtml.includes("Authority") ||
  !hubDetailHtml.includes("Start with an Episode") ||
  !hubDetailHtml.includes("No public registry install is claimed yet") ||
  !hubDetailHtml.includes("KFD Runtime 100 and restart qualification") ||
  !hubDetailHtml.includes("reference-adopter") ||
  !hubDetailHtml.includes(">Principles</p>") ||
  !hubDetailHtml.includes(">First load-bearing layer</p>") ||
  !hubDetailHtml.includes(">Runtime substrate proof</p>") ||
  !hubDetailHtml.includes(">Kungfu Tech</a>") ||
  !hubDetailHtml.includes('href="https://kungfu.tech"')
) {
  throw new Error("architecture detail must retain the complete embeddable runtime and release-trust chain");
}
for (const source of [runtimeSurface.architectureSources.kungfu, runtimeSurface.architectureSources.kfd]) {
  for (const document of source.documents) {
    const href = `${source.repository}/blob/${source.commit}/${document.path}`;
    if (!hubDetailHtml.includes(`href="${escapeHtml(href)}"`)) {
      throw new Error(`architecture detail must link its exact semantic source: ${document.path}`);
    }
  }
}
for (const quickstart of runtimeSurface.quickstarts) {
  const sourceHref = `${runtimeSurface.source.repository}/blob/${runtimeSurface.source.sourceCommit}/${quickstart.sourcePath}`;
  if (!hubDetailHtml.includes(`<pre><code>${escapeHtml(quickstart.command)}</code></pre>`) || !hubDetailHtml.includes(`href="${escapeHtml(sourceHref)}"`)) {
    throw new Error(`architecture quickstart must bind ${quickstart.language} to the exact reviewed source`);
  }
}
if (
  !hubDetailHtml.includes(`href="${escapeHtml(runtimeSurface.source.pullRequest)}"`) ||
  !hubDetailHtml.includes('href="/runtime.json"') ||
  hubDetailHtml.includes("npm install @kungfu-tech/opencode-kungfu")
) {
  throw new Error("architecture detail must expose exact source and machine facts without inventing a public package install");
}
if (hubHtml.includes("Open product generation substrate")) {
  throw new Error("homepage should not render a page-kicker eyebrow because it has no parent page");
}
if (/<a\b[^>]*\shref="\/(?:kfd|buildchain|core)\/"/.test(hubDetailHtml)) {
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
  if (!hubDetailHtml.includes(titleLink) || !hubDetailHtml.includes(actionLink)) {
    throw new Error(`architecture mechanism card must link to ${href}`);
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
  if (!hubDetailHtml.includes(hotspot)) {
    throw new Error(`architecture substrate map is missing hotspot: ${hotspot}`);
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
  ["Core", fs.readFileSync("dist/core/index.html", "utf8"), "Complete Kungfu product map"],
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
const visibleWordCount = (html) => html
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(?:[a-z]+|#\d+);/gi, " ")
  .trim()
  .split(/\s+/)
  .filter(Boolean).length;
for (const [label, html, maximum] of [
  ["Hub", hubHtml, 650],
  ["Core", coreHtml, 350],
  ["Buildchain", buildchainHomeHtml, 550],
  ["KFD", kfdHomeHtml, 400],
  ["Papers", papersIndex, 350],
]) {
  const count = visibleWordCount(html);
  if (count > maximum) {
    throw new Error(`${label} overview exceeds its progressive-disclosure budget: ${count} > ${maximum} words`);
  }
}
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
if (
  !kfdHomeHtml.includes(`href="${escapeHtml(kfdAgentHubPath)}"`)
  || !kfdHomeHtml.includes(escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.run))
  || !kfdHomeHtml.includes(escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.verify))
  || !kfdLlms.includes(kfdSite.agentHubPage.firstPartyProductProjection.run)
  || !kfdLlms.includes(kfdSite.agentHubPage.firstPartyProductProjection.verify)
  || !kfdLlms.includes(kfdSite.agentHubPage.firstPartyProductProjection.ownership)
  || !kfdLlms.includes(kfdSite.agentHubPage.claimBoundary)
  || !kfdLlms.includes(expectedSurfaceEndpoint("kfd", "agent-hub/"))
) {
  throw new Error("KFD first entries must expose and explain the installed Kungfu Agent Hub qualification");
}
for (const sectionId of kfdSite.homepage.displayPlan.support) {
  const section = kfdSite.homepage.sections.find((entry) => entry.id === sectionId);
  if (!section) {
    throw new Error(`KFD displayPlan references missing homepage section: ${sectionId}`);
  }
  if (!kfdDetailHtml.includes(`data-kfd-section="${escapeHtml(sectionId)}"`) || !kfdDetailHtml.includes(`<h2>${escapeHtml(section.title)}</h2>`)) {
    throw new Error(`KFD decisions page did not render support section: ${sectionId}`);
  }
}
if (
  !kfdDetailHtml.includes("Agent Quickstart")
  || !kfdDetailHtml.includes("Decision metadata")
  || kfdHomeHtml.includes("Agent Quickstart")
  || kfdHomeHtml.includes("Decision metadata")
  || kfdHomeHtml.includes("Current decisions")
  || !kfdHomeHtml.includes(`href="${escapeHtml(expectedSurfaceEndpoint("kfd", "decisions/"))}" data-local-href="/kfd/decisions/"`)
) {
  throw new Error("KFD overview must route complete standards and metadata to /decisions/");
}
if (
  !kfdHomeHtml.includes('class="hero-answer" style="max-width: 820px; color: var(--fg); font-size: 18px; line-height: 1.5;"')
  || !kfdHomeHtml.includes('class="hero-claim-boundary" style="max-width: 820px; font-size: 14px; line-height: 1.55;"')
) {
  throw new Error("KFD future picture must retain its scoped hero typography");
}
if (
  kfdDetailHtml.includes("<p>### Why KFD-4 is the first derived operator</p>")
  || !kfdDetailHtml.includes('<h3 id="why-kfd-4-is-the-first-derived-operator"')
  || !kfdDetailHtml.includes('<div class="stack doc-content" style="margin-top: 18px;">')
  || !kfdDetailHtml.includes('<pre><code class="language-text">KFD-1 makes timelines evidentiary.')
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
if (kfdHomeHtml.includes('href="docs/') || kfdDetailHtml.includes('href="docs/')) {
  throw new Error("KFD package-relative docs links must be rewritten away from site-local missing paths");
}
const kfdAgentHubCanonicalHtml = fs.readFileSync("dist/kfd/agent-hub/index.html", "utf8");
const kfdAgentHubAliasHtml = fs.readFileSync("dist/agent-hub/index.html", "utf8");
if (kfdAgentHubAliasHtml !== kfdAgentHubCanonicalHtml) {
  throw new Error("KFD Agent Hub subdomain route alias drifted: dist/agent-hub/index.html");
}
const agentHubHeadings = kfdSite.agentHubPage.sections.map((section) => section.title);
if (
  agentHubHeadings.some((heading) => !kfdAgentHubCanonicalHtml.includes(`>${escapeHtml(heading)}</h3>`))
  || !kfdAgentHubCanonicalHtml.includes('aria-label="Agent Hub qualification sections"')
  || !kfdAgentHubCanonicalHtml.includes(`<a href="${escapeHtml(kfdAgentHubPath)}" aria-current="page">Agent Hub qualification</a>`)
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.run))
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.verify))
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.firstPartyProductProjection.ownership))
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.claimBoundary))
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.authorityPath))
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.profile))
  || !kfdAgentHubCanonicalHtml.includes(escapeHtml(kfdSite.agentHubPage.suite.id))
) {
  throw new Error("KFD Agent Hub page is missing bundle-owned commands, explanation, boundaries, navigation, or metadata");
}
const kfdFoundationPath = `${kfdSite.foundationPage.url.replace(/\/+$/, "")}/`;
const kfdFoundationCanonicalHtml = fs.readFileSync("dist/kfd/foundation/index.html", "utf8");
const kfdFoundationAliasHtml = fs.readFileSync("dist/foundation/index.html", "utf8");
if (kfdFoundationAliasHtml !== kfdFoundationCanonicalHtml) {
  throw new Error("KFD foundation subdomain route alias drifted: dist/foundation/index.html");
}
if (!kfdDetailHtml.includes(`href="${escapeHtml(kfdFoundationPath)}"`)) {
  throw new Error(`KFD decisions page is missing the bundle-owned foundation route: ${kfdFoundationPath}`);
}
if (kfdDetailHtml.includes("https://github.com/kungfu-systems/kfd/blob/main/docs/foundation-model.md")) {
  throw new Error("KFD decisions page must route the foundation model to the rendered site page, not GitHub");
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
for (const pageEntry of kfdStandalonePages) {
  const output = pageEntry.url.replace(/^\/+|\/+$/g, "");
  const pagePath = `/${output}/`;
  const canonicalHtml = fs.readFileSync(`dist/kfd/${output}/index.html`, "utf8");
  const aliasHtml = fs.readFileSync(`dist/${output}/index.html`, "utf8");
  const headings = [...pageEntry.markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
  if (canonicalHtml !== aliasHtml) {
    throw new Error(`KFD standalone subdomain route alias drifted: ${pageEntry.id}`);
  }
  if (
    headings.length === 0
    || headings.some((heading) => !canonicalHtml.includes(`>${escapeHtml(heading)}</h`))
    || !canonicalHtml.includes(`aria-label="${escapeHtml(pageEntry.title)} sections"`)
    || !canonicalHtml.includes(`<a href="${escapeHtml(pagePath)}" aria-current="page">${escapeHtml(pageEntry.rendering.navigationLabel || pageEntry.title)}</a>`)
    || !canonicalHtml.includes(escapeHtml(pageEntry.sourcePath))
    || !canonicalHtml.includes(`<code>${escapeHtml(String(pageEntry.normative))}</code>`)
    || !kfdAgentManifest.readOrder.includes(expectedSurfaceEndpoint("kfd", output + "/"))
  ) {
    throw new Error(`KFD standalone page is missing bundle-owned content, navigation, metadata, or read order: ${pageEntry.id}`);
  }
}
const kfdFormalModelPath = `${kfdSite.formalPage.url.replace(/\/+$/, "")}/`;
const kfdFormalModelCanonicalHtml = fs.readFileSync("dist/kfd/formal/index.html", "utf8");
if (fs.readFileSync("dist/formal/index.html", "utf8") !== kfdFormalModelCanonicalHtml) {
  throw new Error("KFD formal model subdomain route alias drifted: dist/formal/index.html");
}
if (
  !kfdDetailHtml.includes(`href="${escapeHtml(kfdFormalModelPath)}"`)
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
  !kfdDetailHtml.includes(`href="${escapeHtml(kfdTerminologyPath)}"`)
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
if (!kfdDetailHtml.includes(`href="${escapeHtml(kfdCasesPath)}"`)) {
  throw new Error(`KFD decisions page is missing the bundle-owned cases route: ${kfdCasesPath}`);
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
  !kfdDetailHtml.includes(`href="${escapeHtml(kfdCandidateIndexPath)}"`)
  || kfdDetailHtml.includes("https://github.com/kungfu-systems/kfd/blob/main/drafts/action-state-separation.md")
) {
  throw new Error("KFD decisions page must route candidates to rendered site pages");
}
const currentDecisionsPosition = kfdDetailHtml.indexOf('id="current-decisions"');
const currentCandidatesPosition = kfdDetailHtml.indexOf('data-kfd-section="current-candidates"');
if (
  currentDecisionsPosition < 0
  || currentCandidatesPosition < currentDecisionsPosition
  || !kfdDetailHtml.slice(currentDecisionsPosition, currentCandidatesPosition).includes(
    '<p class="eyebrow">numbered authority</p>',
  )
  || !kfdDetailHtml.slice(currentCandidatesPosition).includes(
    '<p class="eyebrow">non-normative</p>',
  )
) {
  throw new Error("KFD decisions page must place non-normative candidates after numbered authority");
}
const decisionMetadataPosition = kfdDetailHtml.indexOf('data-kfd-section="decision-metadata"');
const decisionMetadataEnd = kfdDetailHtml.indexOf("</section>", decisionMetadataPosition);
const decisionMetadataHtml = kfdDetailHtml.slice(decisionMetadataPosition, decisionMetadataEnd);
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
    || !formalCanonicalHtml.includes('href="/drafts/registry.json"')
  ) {
    throw new Error(`KFD formal candidate page is missing declared facts or navigation: ${formalCandidate.id}`);
  }
  if (/href="(?:\.\.?\/|[^":/#]+\.md(?:#|"))/.test(formalCanonicalHtml)) {
    throw new Error(`KFD formal candidate page has unresolved package markdown links: ${formalCandidate.id}`);
  }
}
if (!kfdDetailHtml.includes("Adoption boundary")) {
  throw new Error("KFD decisions page must render the adoption boundary");
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
    if (!kfdDetailHtml.includes(expectedLink)) {
      throw new Error(`KFD decisions page is missing current decision navigation: ${expectedLink}`);
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
  if (!kfdDetailHtml.includes(href)) {
    throw new Error(`KFD decisions page is missing decision link: ${href}`);
  }
  const titleLink = `<h3><a href="/${number}/">${escapeHtml(layer.layer)}</a></h3>`;
  if (!kfdDetailHtml.includes(titleLink)) {
    throw new Error(`KFD foundation triad title is missing link: ${titleLink}`);
  }
  const decisionLink = `<dd><p><a href="/${number}/">${escapeHtml(layer.decision)}</a></p></dd>`;
  if (!kfdDetailHtml.includes(decisionLink)) {
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
grep -q 'Keep the work when the chat ends.' dist/core/index.html
grep -q 'Six independently bounded product layers' dist/core/index.html
grep -q 'Append-only mmap Episode journal' dist/core/runtime/index.html
grep -q 'Storage is the bus' dist/core/runtime/index.html
grep -q 'Visibility is not durability.' dist/core/runtime/index.html
grep -q 'Pinned product bundle' dist/core/runtime/index.html
grep -q 'core.libkungfu.dev/site-bundle-consumer/v1' dist/core/manifest.json
grep -q 'Keep the work when the chat ends.' dist/core/llms.txt
grep -q '.kungfu is a portable, verifiable record of real work.' dist/core/format/index.html
grep -q 'How a fresh agent continues the same work' dist/core/format/index.html
grep -q 'For implementers and auditors' dist/core/format/index.html
grep -q 'An exact pre-release portable authority bundle' dist/core/format/index.html
grep -q '@kungfu-tech/spec@4.0.0-alpha.1' dist/core/format/index.html
grep -q 'Required-reader behavior' dist/core/format/index.html
grep -q 'Fact, Episode and Action Geometry' dist/core/primitives/index.html
grep -q 'One public bootstrap' dist/core/abi/index.html
grep -q 'Browse the complete decision corpus' dist/core/decisions/index.html
grep -q 'buildchain.libkungfu.dev' dist/buildchain/index.html
grep -q 'kfd.libkungfu.dev' dist/kfd/index.html
grep -q 'Projection source' dist/architecture/index.html
grep -q 'pinned release artifacts' dist/architecture/index.html
grep -q 'Kungfu Origin Technology Limited' dist/index.html
grep -q '@kungfu-tech/buildchain' dist/buildchain/mechanism/index.html
grep -q '3.0.2-alpha.2' dist/buildchain/mechanism/index.html
grep -q 'grid-auto-rows: 1fr;' dist/index.html
grep -q 'Bundle facts' dist/buildchain/mechanism/index.html
grep -q 'Install and Verify' dist/buildchain/mechanism/index.html
grep -q 'Use Buildchain' dist/buildchain/mechanism/index.html
grep -q 'Site Fact Source' dist/buildchain/mechanism/index.html
grep -q 'class="doc-global-nav"' dist/buildchain/mechanism/index.html
grep -q 'homepage-content-contract' dist/buildchain/mechanism/index.html
grep -q 'Buildchain Release Passport' dist/buildchain/mechanism/index.html
grep -q 'CLI command registry' dist/buildchain/mechanism/index.html
grep -q 'workflow-registry.json' dist/buildchain/mechanism/index.html
grep -q 'buildchain.release.json' dist/buildchain/mechanism/index.html
grep -q '@kungfu-tech/kfd' dist/kfd/manifest.json
grep -q 'KFD — Kung Fu Decisions' dist/kfd/index.html
grep -q 'non-drifting facts' dist/kfd/decisions/index.html
grep -q 'KFD-1' dist/kfd/1/index.html
grep -q 'KFD-4' dist/kfd/4/index.html
if grep -q '0.0.0-fixture' dist/buildchain/mechanism/index.html; then
  echo "error: Buildchain page still contains fixture version" >&2
  exit 1
fi
if grep -q 'Documentation pages\|Explore all Buildchain pages' dist/buildchain/mechanism/index.html; then
  echo "error: Buildchain mechanism page should use the sidebar navigation instead of child-page card sections" >&2
  exit 1
fi
grep -q 'docs_url' dist/core/runtime/index.html
grep -q 'llms-full.txt' dist/llms.txt

echo "site-libkungfu-dev checks passed"
