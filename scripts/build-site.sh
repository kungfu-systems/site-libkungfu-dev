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
test -f dist/kfd/1/index.html
test -f dist/badges/v1/kfd-1/passed.svg
test -f dist/badges/v1/kfd-2/passed.svg
test -f dist/badges/v1/kfd-3/passed.svg
test -f dist/badges/v1/buildchain-release-passport/passed.svg
test -f dist/badges/v1/kfd-1/passed.json
test -f dist/manifest.json
test -f dist/llms.txt

echo "site-libkungfu-dev built dist/"
