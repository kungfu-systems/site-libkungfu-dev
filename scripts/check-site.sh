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
  "src/fixtures/buildchain-site-bundle.json",
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
const buildchain = JSON.parse(fs.readFileSync("src/fixtures/buildchain-site-bundle.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("dist/manifest.json", "utf8"));

if (site.contract !== "libkungfu-dev-site-manifest-fixture") {
  throw new Error("site fixture contract mismatch");
}
if (core.contract !== "kungfu-spec-manifest-fixture") {
  throw new Error("core fixture contract mismatch");
}
if (buildchain.contract !== "buildchain-site-bundle-fixture") {
  throw new Error("buildchain fixture contract mismatch");
}
if (manifest.sourceBoundary.truthOwner !== "upstream-manifests") {
  throw new Error("dist manifest source boundary drifted");
}
NODE

grep -q 'libkungfu.dev' dist/index.html
grep -q 'Open developer and agent substrate hub' dist/index.html
grep -q 'core.libkungfu.dev' dist/core/index.html
grep -q 'buildchain.libkungfu.dev' dist/buildchain/index.html
grep -q 'Fixture source' dist/index.html
grep -q 'not a product fact source' dist/index.html
grep -q 'site manifest' dist/buildchain/index.html
grep -q 'CLI command registry' dist/buildchain/index.html
grep -q 'workflow/action registry' dist/buildchain/index.html
grep -q 'docs_url' dist/core/index.html
grep -q 'llms-full.txt' dist/llms.txt

echo "site-libkungfu-dev checks passed"
