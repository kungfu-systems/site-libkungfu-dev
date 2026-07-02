#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

if grep -RInE 'mailto:|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  README.md docs public src dist 2>/dev/null; then
  echo "error: email address or mailto link found" >&2
  exit 1
fi

node - <<'NODE'
const fs = require("fs");
const requiredFiles = [
  "src/fixtures/site-manifest.json",
  "src/fixtures/core-spec-manifest.json",
  "package-lock.json",
  "dist/index.html",
  "dist/core/index.html",
  "dist/buildchain/index.html",
  "dist/manifest.json",
  "dist/llms.txt",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`missing required file: ${file}`);
  }
}

const site = JSON.parse(fs.readFileSync("src/fixtures/site-manifest.json", "utf8"));
const core = JSON.parse(fs.readFileSync("src/fixtures/core-spec-manifest.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const buildchainLock = packageLock.packages["node_modules/@kungfu-tech/buildchain"];
const buildchainPackage = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/package.json", "utf8"));
const buildchainSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/buildchain/dist/site/buildchain-site.json", "utf8"));

if (site.contract !== "libkungfu-dev-site-manifest-fixture") {
  throw new Error("site fixture contract mismatch");
}
if (core.contract !== "kungfu-spec-manifest-fixture") {
  throw new Error("core fixture contract mismatch");
}
if (packageJson.dependencies["@kungfu-tech/buildchain"] !== "2.3.0") {
  throw new Error("Buildchain dependency must be pinned to 2.3.0");
}
if (!buildchainLock || buildchainLock.version !== "2.3.0") {
  throw new Error("Buildchain lockfile entry must resolve to 2.3.0");
}
if (!String(buildchainLock.resolved).startsWith("https://registry.npmjs.org/")) {
  throw new Error("Buildchain lockfile must resolve from the official npm registry");
}
for (const [name, entry] of Object.entries(packageLock.packages)) {
  if (entry && entry.resolved && !String(entry.resolved).startsWith("https://registry.npmjs.org/")) {
    throw new Error(`${name} lockfile entry must resolve from the official npm registry`);
  }
}
if (buildchainPackage.version !== "2.3.0") {
  throw new Error("installed Buildchain package version mismatch");
}
if (buildchainSite.contract !== "kungfu-buildchain-site-bundle") {
  throw new Error("Buildchain site bundle contract mismatch");
}
if (manifest.sourceBoundary.truthOwner !== "upstream-manifests") {
  throw new Error("dist manifest source boundary drifted");
}
if (manifest.upstreamPackages.buildchain.version !== "2.3.0") {
  throw new Error("dist manifest does not record Buildchain 2.3.0");
}
NODE

grep -q 'libkungfu.dev' dist/index.html
grep -q 'Open developer and agent substrate hub' dist/index.html
grep -q 'core.libkungfu.dev' dist/core/index.html
grep -q 'buildchain.libkungfu.dev' dist/buildchain/index.html
grep -q 'Fixture source' dist/index.html
grep -q 'not a product fact source' dist/index.html
grep -q '@kungfu-tech/buildchain' dist/buildchain/index.html
grep -q '2.3.0' dist/buildchain/index.html
grep -q 'Pinned npm package' dist/buildchain/index.html
grep -q 'Buildchain Release Passport' dist/buildchain/index.html
grep -q 'CLI command registry' dist/buildchain/index.html
grep -q 'workflow-registry.json' dist/buildchain/index.html
grep -q 'buildchain.release.json' dist/buildchain/index.html
if grep -q '0.0.0-fixture' dist/buildchain/index.html; then
  echo "error: Buildchain page still contains fixture version" >&2
  exit 1
fi
grep -q 'docs_url' dist/core/index.html
grep -q 'llms-full.txt' dist/llms.txt

echo "site-libkungfu-dev checks passed"
