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
  "src/fixtures/skills-site.json",
  "dist/skills/index.html",
  "dist/skills/manifest.json",
  "dist/skills/llms.txt",
  "dist/skills/architecture.json",
  "dist/skills/capability-map.json",
];
for (const path of requiredFiles) {
  assert(fs.existsSync(path), `Skills surface missing required file: ${path}`);
}

const fixture = readJson("src/fixtures/skills-site.json");
const manifest = readJson("dist/skills/manifest.json");
const architecture = readJson("dist/skills/architecture.json");
const capabilityMap = readJson("dist/skills/capability-map.json");
const siteManifest = readJson("dist/manifest.json");
const html = fs.readFileSync("dist/skills/index.html", "utf8");
const llms = fs.readFileSync("dist/skills/llms.txt", "utf8");
const renderer = fs.readFileSync("scripts/render-site.mjs", "utf8");
const packageJson = readJson("package.json");
const surfaceChannel = (process.env.SITE_SURFACE_CHANNEL || process.env.BUILDCHAIN_SURFACE_CHANNEL || "production").trim();
const previewAlias = (process.env.SITE_PREVIEW_ALIAS || process.env.BUILDCHAIN_PREVIEW_ALIAS || "").trim();
const expectedSkillsBase = surfaceChannel === "preview" && previewAlias
  ? `https://${previewAlias}.preview.libkungfu.dev/skills/`
  : surfaceChannel === "staging"
    ? "https://staging.libkungfu.dev/skills/"
    : "https://libkungfu.dev/skills/";
const expectedSkillsUrl = (pathPart = "") => new URL(pathPart, expectedSkillsBase).toString();
const expectedSkillsHost = new URL(expectedSkillsBase).host;

assert(fixture.schema === "libkungfu.skills-site-synthesis/v1", "Skills fixture schema drifted");
assert(fixture.status === "site-synthesis", "Skills surface must remain explicit Site synthesis");
assert(fixture.maturity === "protected-source-alpha-preview", "Skills maturity boundary drifted");
assert(fixture.headline.includes("without turning instructions into authority"), "Skills first-screen proposition drifted");
assert(fixture.previewBoundary.includes("does not publish or activate"), "Skills preview boundary must deny runtime publication");
assert(fixture.futureBoundary.includes("not present-tense product or release claims"), "Skills future boundary is not explicit");
assert(fixture.nonClaims.some((claim) => claim.includes("does not install, enable, select, load, invoke, qualify, certify, publish, or distribute")), "Skills non-claims must exclude runtime and release actions");
assert(fixture.nonClaims.some((claim) => claim.includes("marketplace discovery")), "Skills non-claims must retain protected-source known limits");
assert(!Object.keys(packageJson.dependencies || {}).some((name) => /skill/i.test(name)), "Skills Site synthesis must not add a Skill npm dependency");

const sourceIds = uniqueIds(fixture.sources, "Skills source");
const exactRefs = new Set();
for (const source of fixture.sources) {
  assert(source.owner === "kungfu-systems/kungfu", `Skills source owner drifted: ${source.id}`);
  assert(source.repository === "https://github.com/kungfu-systems/kungfu", `Skills source repository drifted: ${source.id}`);
  assert(/^[0-9a-f]{40}$/.test(source.ref), `Skills source ref must be immutable: ${source.id}`);
  assert(/^[0-9a-f]{64}$/.test(source.sha256), `Skills source must carry a SHA-256: ${source.id}`);
  assert(source.path && !source.path.startsWith("/") && !source.path.includes(".."), `Skills source path is not confined: ${source.id}`);
  assert(source.maturity && source.role, `Skills source maturity or role missing: ${source.id}`);
  exactRefs.add(source.ref);
  const href = `${source.repository}/blob/${source.ref}/${source.path}`;
  assert(html.includes(href), `Skills human source link missing: ${source.id}`);
  assert(llms.includes(`${href} sha256:${source.sha256}`), `Skills Agent source link or digest missing: ${source.id}`);
}
assert(exactRefs.size === 1, "Skills synthesis sources must resolve against one exact Kungfu commit");
assert(!html.includes("github.com/kungfu-systems/kungfu/blob/main/"), "Skills human surface contains a mutable source ref");
assert(!llms.includes("github.com/kungfu-systems/kungfu/blob/main/"), "Skills Agent surface contains a mutable source ref");

const validateSourceRefs = (entry, label) => {
  assert(Array.isArray(entry.sourceRefs) && entry.sourceRefs.length > 0, `${label} must bind sourceRefs`);
  for (const sourceRef of entry.sourceRefs) {
    assert(sourceIds.has(sourceRef), `${label} references unknown source: ${sourceRef}`);
  }
};

for (const path of fixture.readerPaths) validateSourceRefs(path, `reader path ${path.id}`);

const currentFactIds = uniqueIds(fixture.currentFacts, "Skills current fact");
for (const fact of fixture.currentFacts) {
  assert(fact.claimClass === "upstream-fact", `Skills current fact must remain upstream-owned: ${fact.id}`);
  assert(fact.maturity && fact.summary, `Skills current fact is incomplete: ${fact.id}`);
  validateSourceRefs(fact, `current fact ${fact.id}`);
  assert(html.includes(`data-skills-current-fact="${fact.id}"`), `Skills human current fact missing: ${fact.id}`);
  assert(llms.includes(`- ${fact.id} / ${fact.label} [`), `Skills Agent current fact missing: ${fact.id}`);
}
assert(stable(manifest.currentFacts) === stable(fixture.currentFacts), "Skills manifest current-fact parity drifted");
assert(manifest.currentFacts.length === currentFactIds.size, "Skills current-fact count drifted");

const guidanceIds = uniqueIds(fixture.agentGuidance, "Skills Agent guidance");
for (const guidance of fixture.agentGuidance) {
  assert(["suggest", "create", "avoid"].includes(guidance.decision), `Skills guidance decision is unsupported: ${guidance.id}`);
  assert(["site-synthesis", "non-claim"].includes(guidance.claimClass), `Skills guidance claim class drifted: ${guidance.id}`);
  validateSourceRefs(guidance, `Agent guidance ${guidance.id}`);
  assert(html.includes(`data-skills-guidance="${guidance.id}"`), `Skills human Agent guidance missing: ${guidance.id}`);
  assert(llms.includes(`- ${guidance.id} / ${guidance.label} [`), `Skills Agent guidance missing: ${guidance.id}`);
}
assert(stable(manifest.agentGuidance) === stable(fixture.agentGuidance), "Skills manifest Agent-guidance parity drifted");
assert(manifest.agentGuidance.length === guidanceIds.size, "Skills Agent-guidance count drifted");

const nodeIds = uniqueIds(fixture.architecture.nodes, "Skills architecture node");
const relationshipIds = uniqueIds(fixture.architecture.relationships, "Skills architecture relationship");
for (const node of fixture.architecture.nodes) {
  assert(node.kind && node.horizon && node.claimClass && node.maturity && node.summary, `Skills architecture node is incomplete: ${node.id}`);
  validateSourceRefs(node, `architecture node ${node.id}`);
  assert(html.includes(`data-skills-node="${node.id}"`), `Skills human architecture missing node: ${node.id}`);
  assert(llms.includes(`- ${node.id} / ${node.label} [`), `Skills Agent architecture missing node: ${node.id}`);
  if (node.horizon === "future-picture") {
    assert(node.claimClass === "future-picture" && node.maturity === "future-picture-only", `Skills future node is not visibly bounded: ${node.id}`);
  } else {
    assert(node.claimClass !== "future-picture", `Skills current lane contains a future claim: ${node.id}`);
  }
}
for (const relationship of fixture.architecture.relationships) {
  assert(nodeIds.has(relationship.from) && nodeIds.has(relationship.to), `Skills relationship endpoint missing: ${relationship.id}`);
  assert(relationship.label && relationship.horizon && relationship.claimClass, `Skills relationship is incomplete: ${relationship.id}`);
  validateSourceRefs(relationship, `architecture relationship ${relationship.id}`);
  assert(html.includes(`data-skills-relationship="${relationship.id}"`), `Skills human architecture missing relationship: ${relationship.id}`);
  assert(llms.includes(`- ${relationship.id}: ${relationship.from} ${relationship.label} ${relationship.to}`), `Skills Agent architecture missing relationship: ${relationship.id}`);
}
assert(stable(architecture.nodes) === stable(fixture.architecture.nodes), "Skills machine architecture node parity drifted");
assert(stable(architecture.relationships) === stable(fixture.architecture.relationships), "Skills machine architecture relationship parity drifted");
assert(stable(architecture.sources) === stable(fixture.sources), "Skills machine architecture source parity drifted");
assert(manifest.architecture.nodeCount === nodeIds.size, "Skills manifest architecture node count drifted");
assert(manifest.architecture.relationshipCount === relationshipIds.size, "Skills manifest architecture relationship count drifted");
assert(manifest.architecture.futureNodeCount > 0 && manifest.architecture.currentNodeCount > 0, "Skills manifest must retain current and future architecture lanes");

const categories = fixture.capabilityMap.categories;
assert(categories.map((category) => category.label).join(",") === "Understand,Suggest,Author,Govern,Future picture", "Skills capability categories drifted");
uniqueIds(categories, "Skills capability category");
const capabilityIds = new Set();
for (const category of categories) {
  assert(category.summary && Array.isArray(category.items) && category.items.length > 0, `Skills capability category is incomplete: ${category.id}`);
  for (const item of category.items) {
    assert(!capabilityIds.has(item.id), `Skills capability id is duplicated: ${item.id}`);
    capabilityIds.add(item.id);
    assert(item.label && item.status && item.maturity && item.claimClass && item.summary, `Skills capability item is incomplete: ${item.id}`);
    validateSourceRefs(item, `capability ${item.id}`);
    assert(html.includes(`data-skills-capability="${item.id}"`), `Skills human capability map missing item: ${item.id}`);
    assert(llms.includes(`- ${item.id} / ${item.label} [`), `Skills Agent capability map missing item: ${item.id}`);
  }
}
assert(stable(capabilityMap.categories) === stable(fixture.capabilityMap.categories), "Skills machine capability parity drifted");
assert(stable(capabilityMap.sources) === stable(fixture.sources), "Skills machine capability source parity drifted");
assert(manifest.capabilityMap.categories.join(",") === "understand,suggest,author,govern,future", "Skills manifest capability categories drifted");
assert(manifest.capabilityMap.itemCount === capabilityIds.size, "Skills manifest capability item count drifted");

assert(manifest.canonicalUrl === expectedSkillsBase, "Skills manifest canonical URL drifted");
assert(manifest.machineEntries.manifest === expectedSkillsUrl("manifest.json"), "Skills manifest machine URL drifted");
assert(manifest.machineEntries.llms === expectedSkillsUrl("llms.txt"), "Skills llms URL drifted");
assert(manifest.machineEntries.architecture === expectedSkillsUrl("architecture.json"), "Skills architecture URL drifted");
assert(manifest.machineEntries.capabilityMap === expectedSkillsUrl("capability-map.json"), "Skills capability-map URL drifted");

for (const route of ["/skills/", "/skills/manifest.json", "/skills/llms.txt", "/skills/architecture.json", "/skills/capability-map.json"]) {
  assert(siteManifest.pages.some((entry) => entry.path === route && entry.host === expectedSkillsHost), `root Site manifest missing Skills route: ${route}`);
}
assert(siteManifest.upstreamFixtures?.skills?.sourceRef === [...exactRefs][0], "root Site manifest Skills sourceRef drifted");
for (const route of ["/skills/manifest.json", "/skills/llms.txt", "/skills/architecture.json", "/skills/capability-map.json"]) {
  assert(siteManifest.machineEntries.some((entry) => entry.path === route), `root Site manifest missing Skills machine entry: ${route}`);
}

assert(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), "Skills first screen is missing its viewport contract");
assert(html.includes("@media (max-width: 640px)"), "Skills surface is missing its responsive layout contract");
assert(html.includes('role="group" aria-label="Skills architecture with current protected-source and future-picture lanes"'), "Skills architecture needs an accessible group label");
assert(html.includes('aria-labelledby="skills-agent-guidance-heading"'), "Skills guidance needs an accessible heading relationship");
assert(html.includes('aria-labelledby="skills-capabilities-heading"'), "Skills capability map needs an accessible heading relationship");
assert(html.includes('<link rel="alternate" type="application/json" title="Skills architecture" href="architecture.json">'), "Skills architecture alternate missing");
assert(html.includes('<link rel="alternate" type="application/json" title="Skills capability map" href="capability-map.json">'), "Skills capability-map alternate missing");

const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf("</section>", html.indexOf('<section class="hero">')));
for (const marker of [fixture.headline, fixture.lead, fixture.proposition, "Should an Agent suggest one?", "Compare current and future", "Inspect machine facts"]) {
  assert(hero.includes(marker), `Skills first screen missing marker: ${marker}`);
}
for (const machineEntry of ["manifest.json", "architecture.json", "capability-map.json"]) {
  assert(html.includes(`href="${machineEntry}"`), `Skills human machine link must be route-relative: ${machineEntry}`);
  assert(!html.includes(`href="/skills/${machineEntry}"`), `Skills human machine link must not hard-code its hub prefix: ${machineEntry}`);
  assert(new URL(machineEntry, expectedSkillsBase).pathname === `/skills/${machineEntry}`, `Skills route resolution drifted: ${machineEntry}`);
}

for (const path of ["dist/index.html", "dist/skills/index.html", "dist/kfx/index.html", "dist/core/index.html", "dist/buildchain/index.html", "dist/kfd/index.html", "dist/papers/index.html"]) {
  const page = fs.readFileSync(path, "utf8");
  for (const label of ["KFD", "Buildchain", "Core", "Extensions", "Skills", "Papers"]) {
    assert(page.includes(`>${label}</a>`), `${path} global navigation missing ${label}`);
  }
  const positions = ["KFD", "Buildchain", "Core", "Extensions", "Skills", "Papers"].map((label) => page.indexOf(`>${label}</a>`));
  assert(positions.every((position, index) => index === 0 || position > positions[index - 1]), `${path} global navigation order drifted`);
  assert(page.includes('data-local-href="/skills/"'), `${path} global navigation missing local Skills route`);
}

assert(renderer.includes('const skillsSite = readFixtureJson("skills-site.json")'), "Skills renderer must consume the governed fixture");
assert(!renderer.includes(fixture.architecture.summary), "Skills architecture summary must not be duplicated into renderer prose");
assert(!renderer.includes(fixture.capabilityMap.headline), "Skills capability headline must not be duplicated into renderer prose");

const fixtureDigest = crypto.createHash("sha256").update(fs.readFileSync("src/fixtures/skills-site.json")).digest("hex");
console.log(`Skills surface parity verified: ${currentFactIds.size} current facts, ${guidanceIds.size} guidance rules, ${nodeIds.size} nodes, ${relationshipIds.size} relationships, ${capabilityIds.size} capability items, fixture sha256:${fixtureDigest}`);
