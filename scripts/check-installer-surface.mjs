import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative).toString("utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const sourceCatalog = read("src/install/installer-catalog.json");
const friendlyCatalog = read("dist/install/v1/catalog.json");
const friendlyInstaller = read("dist/install.sh");
const publication = json("dist/install/v1/manifest.json");
const siteManifest = json("dist/manifest.json");
const installPage = read("dist/install/index.html").toString("utf8");
const hubPage = read("dist/index.html").toString("utf8");
const kfdPage = read("dist/kfd/index.html").toString("utf8");
const buildchainPage = read("dist/buildchain/index.html").toString("utf8");

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
  "/install/",
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
assert.equal(JSON.parse(sourceCatalog).refresh.mode, "explicit-exact-release");
assert.equal(JSON.parse(sourceCatalog).refresh.source, "github-release");
assert.equal(JSON.parse(sourceCatalog).refresh.movingSelectorsAllowed, false);

for (const product of publication.products) {
  assert.ok(installPage.includes(`id="${product.id}"`), `install page missing ${product.id} card`);
  assert.ok(
    installPage.includes(`https://libkungfu.dev/install.sh | sh -s -- ${product.id}`),
    `install page missing ${product.id} copy command`,
  );
}
assert.equal(installPage.includes("curl --fail --proto"), false, "install page must use the main-site minimal curl style");
for (const productId of ["kfd", "buildchain", "kungfu"]) {
  assert.ok(
    installPage.includes(`brew install kungfu-systems/tap/${productId}`),
    `install page missing ${productId} Homebrew route`,
  );
}
assert.ok(installPage.includes("Homebrew owns package-manager installation, upgrades, and removal"));
assert.ok(installPage.includes("is the canonical public entry"));
assert.ok(installPage.includes("one reviewed Site catalog projects exact product-owned GitHub Releases"));
assert.ok(installPage.includes("--version 3.0.6"), "install page missing historical Buildchain example");
assert.ok(installPage.includes("--rollback"), "install page missing rollback example");
assert.ok(kfdPage.includes('data-local-href="/install/#kfd"'), "KFD page missing install guide card");
assert.ok(buildchainPage.includes('data-local-href="/install/#buildchain"'), "Buildchain page missing install guide card");
assert.ok(hubPage.includes("data-hub-install-card"), "hub first screen missing installation entry card");
assert.ok(hubPage.includes('data-local-href="/install/"'), "hub installation card missing local install guide route");
assert.ok(
  kfdPage.includes("https://libkungfu.dev/install.sh | sh -s -- kfd"),
  "KFD page missing copyable installer command",
);
assert.ok(
  buildchainPage.includes("https://libkungfu.dev/install.sh | sh -s -- buildchain"),
  "Buildchain page missing copyable installer command",
);

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
