#!/bin/bash
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
chrome_bin=${CHROME_BIN:-}

if [ -z "$chrome_bin" ]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome 2>/dev/null || true)" \
    "$(command -v chromium 2>/dev/null || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      chrome_bin=$candidate
      break
    fi
  done
fi

if [ -z "$chrome_bin" ] && ! command -v sips >/dev/null 2>&1; then
  echo "error: Chrome or Chromium is required; set CHROME_BIN" >&2
  exit 1
fi

profile_dir=$(mktemp -d "${TMPDIR:-/tmp}/kungfu-social-card.XXXXXX")
trap 'rm -rf "$profile_dir"' EXIT

render_card() {
  source_path=$1
  output_path=$2
  if command -v sips >/dev/null 2>&1; then
    sips -s format png "$source_path" --out "$output_path" >/dev/null
    return
  fi
  card_profile="$profile_dir/$(basename "$output_path" .png)"
  mkdir -p "$card_profile"
  "$chrome_bin" \
    --headless \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1200,630 \
    --user-data-dir="$card_profile" \
    --screenshot="$output_path" \
    "file://$source_path" >/dev/null 2>&1
}

mkdir -p "$repo_root/public/assets/social"
render_card "$repo_root/src/social-cards/dogfood-public-evidence.svg" "$repo_root/public/assets/social/dogfood-public-evidence.png"
render_card "$repo_root/src/social-cards/parallel-runtime-paths.svg" "$repo_root/public/assets/social/parallel-runtime-paths.png"

echo "Rendered social cards in public/assets/social/"
