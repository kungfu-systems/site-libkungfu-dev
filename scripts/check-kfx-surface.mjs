import crypto from "node:crypto";
import fs from "node:fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function stable(value) {
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueIds(entries, label) {
  const ids = entries.map((entry) => entry.id);
  assert(ids.every(Boolean), `${label} entries must have ids`);
  assert(new Set(ids).size === ids.length, `${label} ids must be unique`);
  return new Set(ids);
}

const requiredFiles = [
  "src/fixtures/kfx-site.json",
  "dist/kfx/index.html",
  "dist/kfx/manifest.json",
  "dist/kfx/llms.txt",
  "dist/kfx/architecture.json",
  "dist/kfx/capability-map.json",
];
for (const path of requiredFiles) {
  assert(fs.existsSync(path), `KFX surface missing required file: ${path}`);
}

const fixture = readJson("src/fixtures/kfx-site.json");
const manifest = readJson("dist/kfx/manifest.json");
const architecture = readJson("dist/kfx/architecture.json");
const capabilityMap = readJson("dist/kfx/capability-map.json");
const siteManifest = readJson("dist/manifest.json");
const html = fs.readFileSync("dist/kfx/index.html", "utf8");
const llms = fs.readFileSync("dist/kfx/llms.txt", "utf8");
const renderer = fs.readFileSync("scripts/render-site.mjs", "utf8");
const packageJson = readJson("package.json");
const surfaceChannel = (process.env.SITE_SURFACE_CHANNEL || process.env.BUILDCHAIN_SURFACE_CHANNEL || "production").trim();
const previewAlias = (process.env.SITE_PREVIEW_ALIAS || process.env.BUILDCHAIN_PREVIEW_ALIAS || "").trim();
const expectedKfxBase = surfaceChannel === "preview" && previewAlias
  ? `https://kfx-${previewAlias}.preview.libkungfu.dev/`
  : surfaceChannel === "staging"
    ? "https://kfx.staging.libkungfu.dev/"
    : "https://kfx.libkungfu.dev/";
const expectedKfxUrl = (pathPart = "") => new URL(pathPart, expectedKfxBase).toString();
const expectedKfxHost = new URL(expectedKfxBase).host;

assert(fixture.schema === "libkungfu.kfx-site-synthesis/v1", "KFX fixture schema drifted");
assert(fixture.status === "site-synthesis", "KFX surface must remain explicit Site synthesis");
assert(fixture.maturity === "alpha-source-projection", "KFX surface maturity boundary drifted");
assert(fixture.headline === "Extend Kungfu without forking Core.", "KFX first-screen proposition drifted");
assert(fixture.adoptionBoundary.includes("no unpublished npm dependency"), "KFX adoption boundary must exclude unpublished npm bytes");
assert(fixture.adoptionBoundary.includes("upstream-generated KFX Site Bundle"), "KFX adoption boundary must name later generated-bundle adoption");
assert(!Object.keys(packageJson.dependencies || {}).some((name) => /kfx/i.test(name)), "KFX Site synthesis must not add an npm KFX dependency");

const sourceIds = uniqueIds(fixture.sources, "KFX source");
const exactRefs = new Set();
for (const source of fixture.sources) {
  assert(source.owner === "kungfu-systems/kungfu", `KFX source owner drifted: ${source.id}`);
  assert(source.repository === "https://github.com/kungfu-systems/kungfu", `KFX source repository drifted: ${source.id}`);
  assert(/^[0-9a-f]{40}$/.test(source.ref), `KFX source ref must be an immutable 40-hex commit: ${source.id}`);
  assert(/^[0-9a-f]{64}$/.test(source.sha256), `KFX source must carry a SHA-256: ${source.id}`);
  assert(source.path && !source.path.startsWith("/") && !source.path.includes(".."), `KFX source path is not confined: ${source.id}`);
  assert(source.maturity && source.role, `KFX source maturity or role missing: ${source.id}`);
  exactRefs.add(source.ref);
  const href = `${source.repository}/blob/${source.ref}/${source.path}`;
  assert(html.includes(href), `KFX human source link missing: ${source.id}`);
  assert(llms.includes(`${href} sha256:${source.sha256}`), `KFX Agent source link or digest missing: ${source.id}`);
}
assert(exactRefs.size === 1, "KFX synthesis sources must resolve against one exact Kungfu commit");
assert(!html.includes("github.com/kungfu-systems/kungfu/blob/main/"), "KFX human surface contains a mutable Kungfu sourceRef");
assert(!llms.includes("github.com/kungfu-systems/kungfu/blob/main/"), "KFX Agent surface contains a mutable Kungfu sourceRef");

const validateSourceRefs = (entry, label) => {
  assert(Array.isArray(entry.sourceRefs) && entry.sourceRefs.length > 0, `${label} must bind sourceRefs`);
  for (const sourceRef of entry.sourceRefs) {
    assert(sourceIds.has(sourceRef), `${label} references unknown source: ${sourceRef}`);
  }
};

for (const path of fixture.readerPaths) validateSourceRefs(path, `reader path ${path.id}`);

const nodeIds = uniqueIds(fixture.architecture.nodes, "KFX architecture node");
const relationshipIds = uniqueIds(fixture.architecture.relationships, "KFX architecture relationship");
for (const node of fixture.architecture.nodes) {
  assert(node.kind && node.maturity && node.claimClass && node.summary, `KFX architecture node is incomplete: ${node.id}`);
  validateSourceRefs(node, `architecture node ${node.id}`);
  assert(html.includes(`data-kfx-node="${node.id}"`), `KFX human architecture missing node: ${node.id}`);
  assert(llms.includes(`- ${node.id} / ${node.label} [`), `KFX Agent architecture missing node: ${node.id}`);
}
for (const relationship of fixture.architecture.relationships) {
  assert(nodeIds.has(relationship.from) && nodeIds.has(relationship.to), `KFX relationship endpoint missing: ${relationship.id}`);
  assert(relationship.label && relationship.maturity, `KFX relationship is incomplete: ${relationship.id}`);
  validateSourceRefs(relationship, `architecture relationship ${relationship.id}`);
  assert(html.includes(`data-kfx-relationship="${relationship.id}"`), `KFX human architecture missing relationship: ${relationship.id}`);
  assert(llms.includes(`- ${relationship.id}: ${relationship.from} ${relationship.label} ${relationship.to}`), `KFX Agent architecture missing relationship: ${relationship.id}`);
}
assert(relationshipIds.size === fixture.architecture.relationships.length, "KFX relationship parity count drifted");

const requiredNodeLabels = [
  "Author / provider",
  "KFX package / Profile Suite",
  "View",
  "Adapter",
  "Service",
  "Action",
  "Assessment",
  "Profile",
  "Core registry + semantic graph",
  "Admission assessment",
  "Capability + Warrant boundary",
  "Transactional lifecycle",
  "Receipt + retained facts",
  "GUI",
  "TUI",
  "CLI",
  "Agent",
  "KFD assessment evidence",
  "Buildchain exact-artifact evidence",
];
const nodeLabels = new Set(fixture.architecture.nodes.map((node) => node.label));
for (const label of requiredNodeLabels) assert(nodeLabels.has(label), `KFX architecture missing required node label: ${label}`);

const categories = fixture.capabilityMap.categories;
assert(categories.map((category) => category.label).join(",") === "Build,Connect,Add,Lifecycle,Trust,Surfaces", "KFX capability categories drifted");
uniqueIds(categories, "KFX capability category");
const capabilityIds = new Set();
for (const category of categories) {
  assert(category.summary && Array.isArray(category.items) && category.items.length > 0, `KFX capability category is incomplete: ${category.id}`);
  for (const item of category.items) {
    assert(!capabilityIds.has(item.id), `KFX capability id is duplicated: ${item.id}`);
    capabilityIds.add(item.id);
    assert(item.label && item.status && item.maturity && item.summary, `KFX capability item is incomplete: ${item.id}`);
    validateSourceRefs(item, `capability ${item.id}`);
    assert(html.includes(`data-kfx-capability="${item.id}"`), `KFX human capability map missing item: ${item.id}`);
    assert(llms.includes(`- ${item.id} / ${item.label} [`), `KFX Agent capability map missing item: ${item.id}`);
  }
}

assert(stable(architecture.nodes) === stable(fixture.architecture.nodes), "KFX machine architecture node parity drifted");
assert(stable(architecture.relationships) === stable(fixture.architecture.relationships), "KFX machine architecture relationship parity drifted");
assert(stable(architecture.nonClaims) === stable(fixture.architecture.nonClaims), "KFX machine architecture non-claim parity drifted");
assert(stable(architecture.sources) === stable(fixture.sources), "KFX machine architecture source parity drifted");
assert(stable(capabilityMap.categories) === stable(fixture.capabilityMap.categories), "KFX machine capability category parity drifted");
assert(stable(capabilityMap.nonClaims) === stable(fixture.capabilityMap.nonClaims), "KFX machine capability non-claim parity drifted");
assert(stable(capabilityMap.sources) === stable(fixture.sources), "KFX machine capability source parity drifted");

assert(manifest.canonicalUrl === expectedKfxBase, "KFX manifest canonical URL drifted");
assert(manifest.machineEntries.manifest === expectedKfxUrl("manifest.json"), "KFX manifest machine URL drifted");
assert(manifest.machineEntries.llms === expectedKfxUrl("llms.txt"), "KFX llms URL drifted");
assert(manifest.machineEntries.architecture === expectedKfxUrl("architecture.json"), "KFX architecture URL drifted");
assert(manifest.machineEntries.capabilityMap === expectedKfxUrl("capability-map.json"), "KFX capability-map URL drifted");
assert(manifest.architecture.nodeCount === nodeIds.size, "KFX manifest architecture node count drifted");
assert(manifest.architecture.relationshipCount === relationshipIds.size, "KFX manifest relationship count drifted");
assert(manifest.capabilityMap.categories.join(",") === "build,connect,add,lifecycle,trust,surfaces", "KFX manifest capability categories drifted");
assert(manifest.capabilityMap.itemCount === capabilityIds.size, "KFX manifest capability item count drifted");

for (const route of ["/kfx/", "/kfx/manifest.json", "/kfx/llms.txt", "/kfx/architecture.json", "/kfx/capability-map.json"]) {
  assert(siteManifest.pages.some((entry) => entry.path === route && entry.host === expectedKfxHost), `root Site manifest missing channel KFX route: ${route}`);
}
assert(siteManifest.upstreamFixtures?.kfx?.sourceRef === [...exactRefs][0], "root Site manifest KFX sourceRef drifted");
assert(siteManifest.machineEntries.some((entry) => entry.path === "/kfx/manifest.json"), "root Site manifest missing KFX machine entry");

assert(html.includes('role="group" aria-label="KFX architecture'), "KFX architecture needs an accessible group label");
assert(html.includes('aria-labelledby="kfx-capabilities-heading"'), "KFX capability map needs an accessible heading relationship");
assert(html.includes("@media (max-width: 640px)"), "KFX surface is missing its responsive layout contract");
assert(html.includes('<link rel="alternate" type="application/json" title="KFX architecture" href="/architecture.json">'), "KFX architecture alternate missing");
assert(html.includes('<link rel="alternate" type="application/json" title="KFX capability map" href="/capability-map.json">'), "KFX capability-map alternate missing");

for (const machineEntry of ["manifest.json", "architecture.json", "capability-map.json"]) {
  assert(html.includes(`href="${machineEntry}"`), `KFX human machine link must be surface-relative: ${machineEntry}`);
  assert(!html.includes(`href="/kfx/${machineEntry}"`), `KFX human machine link would double-prefix on the dedicated host: ${machineEntry}`);
  assert(new URL(machineEntry, "https://staging.libkungfu.dev/kfx/").pathname === `/kfx/${machineEntry}`, `KFX hub route resolution drifted: ${machineEntry}`);
  assert(new URL(machineEntry, expectedKfxBase).pathname === `/${machineEntry}`, `KFX dedicated-host route resolution drifted: ${machineEntry}`);
}

for (const path of ["dist/index.html", "dist/core/index.html", "dist/buildchain/index.html", "dist/kfd/index.html", "dist/papers/index.html", "dist/kfx/index.html"]) {
  const page = fs.readFileSync(path, "utf8");
  for (const label of ["KFD", "Buildchain", "Core", "Extensions", "Papers"]) {
    assert(page.includes(`>${label}</a>`), `${path} global navigation missing ${label}`);
  }
  const positions = ["KFD", "Buildchain", "Core", "Extensions", "Papers"].map((label) => page.indexOf(`>${label}</a>`));
  assert(positions.every((position, index) => index === 0 || position > positions[index - 1]), `${path} global navigation order drifted`);
  assert(page.includes('data-local-href="/kfx/"'), `${path} global navigation missing local KFX route`);
}
assert(html.includes('nav > a:not(:first-child):not(.main-site-link)::before'), "KFX navigation is missing the kungfu.tech-style desktop separators");

assert(renderer.includes('const kfxSite = readFixtureJson("kfx-site.json")'), "KFX renderer must consume the governed fixture");
assert(!renderer.includes(fixture.architecture.summary), "KFX architecture summary must not be duplicated into renderer prose");
assert(!renderer.includes(fixture.capabilityMap.headline), "KFX capability headline must not be duplicated into renderer prose");

const fixtureDigest = crypto.createHash("sha256").update(fs.readFileSync("src/fixtures/kfx-site.json")).digest("hex");
console.log(`KFX surface parity verified: ${nodeIds.size} nodes, ${relationshipIds.size} relationships, ${capabilityIds.size} capabilities, fixture sha256:${fixtureDigest}`);
