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

node scripts/render-site.mjs

test -f dist/index.html
test -f dist/core/index.html
test -f dist/buildchain/index.html
test -f dist/kfd/index.html
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
test -f dist/llms.txt

echo "site-libkungfu-dev built dist/"
