import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative).toString("utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const sourceCatalog = read("src/fixtures/installer-catalog.json");
const friendlyCatalog = read("dist/install/v1/catalog.json");
const friendlyInstaller = read("dist/install.sh");
const publication = json("dist/install/v1/manifest.json");
const siteManifest = json("dist/manifest.json");

assert.deepEqual(friendlyCatalog, sourceCatalog);
assert.equal(sha256(friendlyCatalog), publication.catalog.sha256);
assert.equal(friendlyCatalog.length, publication.catalog.size);
assert.equal(sha256(friendlyInstaller), publication.installer.sha256);
assert.equal(friendlyInstaller.length, publication.installer.size);

const catalogImmutablePath = `dist${new URL(publication.catalog.immutableUrl).pathname}`;
const installerImmutablePath = `dist${new URL(publication.installer.immutableUrl).pathname}`;
assert.deepEqual(read(catalogImmutablePath), friendlyCatalog);
assert.deepEqual(read(installerImmutablePath), friendlyInstaller);

assert.deepEqual(publication.products.map((entry) => entry.id), [
  "kfd",
  "buildchain",
  "kungfu",
  "agent-hub-demo",
]);
assert.ok(publication.products.find((entry) => entry.id === "buildchain").versions.includes("3.0.6"));
assert.ok(publication.products.find((entry) => entry.id === "kfd").versions.includes("1.0.0-alpha.63"));

for (const route of [
  "/install.sh",
  "/install/v1/manifest.json",
  "/install/v1/catalog.json",
  new URL(publication.catalog.immutableUrl).pathname,
  new URL(publication.installer.immutableUrl).pathname,
]) {
  assert.ok(
    siteManifest.pages.some((entry) => entry.path === route && entry.host === siteManifest.canonicalHost),
    `root manifest missing ${route} on ${siteManifest.canonicalHost}`,
  );
}
for (const route of ["/install/v1/manifest.json", "/install/v1/catalog.json"]) {
  assert.ok(siteManifest.machineEntries.some((entry) => entry.path === route), `machine entries missing ${route}`);
}
assert.deepEqual(siteManifest.installerPublication, publication);

const shell = friendlyInstaller.toString("utf8");
for (const contract of [
  "catalog_sha256='",
  "ownership-conflict",
  "archive-unsafe",
  "homebrew-prefix",
  "--rollback",
  "PATH was not modified",
  "signed upstream installer",
]) {
  assert.ok(shell.includes(contract), `installer safety contract missing: ${contract}`);
}
for (const forbidden of ["sudo ", ".bashrc", ".zshrc", "brew install", "kungfu.tech/install.sh'"]) {
  assert.equal(shell.includes(forbidden), false, `installer contains forbidden mutation or mutable delegation: ${forbidden}`);
}

process.stdout.write(`check-installer-surface: ${publication.installer.sha256} ${publication.catalog.sha256}\n`);
