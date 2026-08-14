#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

test -d src/fixtures

rm -rf dist
mkdir -p dist

if [ -d public ]; then
  cp -R public/. dist/
fi

for surface in kfx skills core buildchain kfd papers; do
  mkdir -p "dist/${surface}/assets"
  cp public/assets/favicon.svg "dist/${surface}/assets/favicon.svg"
done

node scripts/prepare-dogfood-render-input.mjs
node scripts/render-installer.mjs
node scripts/render-site.mjs
mkdir -p dist/.buildchain
cp src/fixtures/observed-evidence-ownership.json dist/.buildchain/observed-evidence-ownership.json

test -f dist/index.html
test -f dist/404.html
test -f dist/architecture/index.html
test -f dist/install.sh
test -f dist/install.ps1
test -f dist/install/v1/catalog.json
test -f dist/install/v1/manifest.json
test -f dist/kfx/index.html
test -f dist/kfx/manifest.json
test -f dist/kfx/llms.txt
test -f dist/kfx/architecture.json
test -f dist/kfx/capability-map.json
test -f dist/skills/index.html
test -f dist/skills/spec/index.html
test -f dist/skills/roadmap/index.html
test -f dist/skills/manifest.json
test -f dist/skills/llms.txt
test -f dist/skills/architecture.json
test -f dist/skills/capability-map.json
test -f dist/core/index.html
test -f dist/core/runtime/index.html
test -f dist/core/manifest.json
test -f dist/core/llms.txt
test -f dist/core/llms-full.txt
test -f dist/buildchain/index.html
test -f dist/buildchain/mechanism/index.html
test -f dist/kfd/index.html
test -f dist/kfd/decisions/index.html
test -f dist/kfd/foundation/index.html
test -f dist/foundation/index.html
test -f dist/kfd/formal/index.html
test -f dist/formal/index.html
test -f dist/kfd/terminology/index.html
test -f dist/terminology/index.html
test -f dist/kfd/terminology.json
test -f dist/terminology.json
node - <<'NODE'
const fs = require("node:fs");
const kfdSite = JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/site/kfd-site.json", "utf8"));
for (const liveCase of kfdSite.liveCases?.cases || []) {
  const output = liveCase.url.replace(/^\/+|\/+$/g, "");
  for (const file of [`dist/kfd/${output}/index.html`, `dist/${output}/index.html`]) {
    if (!fs.existsSync(file)) throw new Error(`missing rendered KFD live case: ${file}`);
  }
}
NODE
test -f dist/kfd/schemas/kfd-terminology.schema.json
test -f dist/schemas/kfd-terminology.schema.json
for number in $(node -e 'const fs=require("fs"); const registry=JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/registry.json","utf8")); console.log(registry.entries.map((entry)=>entry.number).join("\n"));'); do
  test -f "dist/kfd/${number}/index.html"
  test -f "dist/${number}/index.html"
  test -f "dist/kfd/${number}/usage/index.html"
  test -f "dist/${number}/usage/index.html"
done
test -f dist/kfd/1/index.html
test -f dist/badges/v1/kfd-1/passed.svg
test -f dist/badges/v1/kfd-2/passed.svg
test -f dist/badges/v1/kfd-3/passed.svg
for number in $(node -e 'const fs=require("fs"); const registry=JSON.parse(fs.readFileSync("node_modules/@kungfu-tech/kfd/registry.json","utf8")); console.log(registry.entries.map((entry)=>entry.number).join("\n"));'); do
  test -f "dist/badges/v1/kfd-${number}/passed.svg"
  test -f "dist/badges/v1/kfd-${number}/passed.json"
  test -f "dist/buildchain/badges/v1/kfd-${number}/passed.svg"
  test -f "dist/buildchain/badges/v1/kfd-${number}/passed.json"
done
test -f dist/badges/v1/buildchain-release-passport/passed.svg
test -f dist/buildchain/badges/v1/buildchain-release-passport/passed.svg
test -f dist/badges/v1/kfd-1/passed.json
test -f dist/buildchain/badges/v1/badge-endpoint-registry.json
test -f dist/manifest.json
test -f dist/runtime.json
test -f dist/agent-supply-chain.json
test -f dist/dogfood/index.html
test -f dist/dogfood-evidence.json
test -f dist/dogfood/parallel-runtime-paths/index.html
test -f dist/dogfood/parallel-runtime-paths.json
test -f dist/dogfood/agent-output-comparison-data.json
test -f dist/dogfood/agent-output-comparison-data.json.sha256
test -f dist/dogfood/agent-output-comparison-operating-data.json
test -f dist/dogfood/agent-output-comparison-operating-data.json.sha256
test -f dist/.buildchain/observed-evidence-ownership.json
test -f dist/.well-known/kungfu-release-status.json
test -f dist/llms.txt
test -f dist/papers/index.html
test -f dist/papers/archive/index.html
test -f dist/papers/manifest.json
test -f dist/papers/registry.json
test -f dist/papers/llms.txt
test -f dist/papers/.well-known/kungfu-release-status.json
test -f dist/papers/kfd-machine-life-roadmap/latest/buildchain.release.json
test -f dist/papers/paper-kfd-machine-life-roadmap/index.html
test -f dist/papers/paper-kfd-machine-life-roadmap/latest/buildchain.release.json
node - <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("dist/papers/manifest.json", "utf8"));
for (const publication of manifest.publications || []) {
  const required = [
    `dist/papers/${publication.id}/index.html`,
    `dist/papers/${publication.id}/latest/index.html`,
  ];
  for (const version of publication.versions || []) {
    const prefix = `dist/papers${version.immutablePath}`;
    if (version.immutableIndex) {
      required.push(`${prefix}${version.immutableIndex.path}`);
    }
    const currentPackageVersion = version.version === publication.latest.version;
    for (const artifact of version.artifacts || []) {
      const route = (manifest.routes || []).find((entry) => (
        entry.path === `${version.immutablePath}${artifact.path}`
      ));
      if (currentPackageVersion && !route) {
        throw new Error(`current publication artifact route is missing: ${publication.id}@${version.version}/${artifact.path}`);
      }
      if (route) required.push(`${prefix}${artifact.path}`);
    }
  }
  for (const file of required) {
    if (!fs.existsSync(file)) throw new Error(`missing rendered publication file: ${file}`);
  }
}
NODE

echo "site-libkungfu-dev built dist/"
