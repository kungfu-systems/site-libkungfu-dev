#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

if [ -z "${KUNGFU_SITE_PACKAGE_ROOT:-}" ]; then
  echo "error: KUNGFU_SITE_PACKAGE_ROOT must point to a generated framework/site package root" >&2
  exit 2
fi

package_root=$(cd "$KUNGFU_SITE_PACKAGE_ROOT" && pwd)
for required in \
  package.json \
  index.js \
  experience.js \
  dist/site/site-bundle.json \
  dist/site/agent-index.json; do
  if [ ! -f "$package_root/$required" ]; then
    echo "error: local @kungfu-tech/site package is missing $required under $package_root" >&2
    exit 2
  fi
done

env -u KUNGFU_SITE_PACKAGE_ROOT -u KUNGFU_SITE_EXPERIENCE_MODE pnpm run build
KUNGFU_SITE_PACKAGE_ROOT="$package_root" node scripts/render-local-site-bundle.mjs
KUNGFU_SITE_PACKAGE_ROOT="$package_root" pnpm run check:local-site-bundle

echo "local @kungfu-tech/site preview built at dist/core-preview/"
