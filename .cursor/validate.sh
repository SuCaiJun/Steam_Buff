#!/usr/bin/env bash
# Idempotent source validation for the Steam Buff extension.
# The project is a static Manifest V3 extension with no dependencies or build
# step, so "setup" is validating that the checked-out source is loadable:
#   - manifest.json and all JSON assets are valid JSON
#   - every JavaScript file parses
#   - every file referenced by manifest.json exists
#   - Chrome can pack the extension (full manifest validation)
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Steam Buff source validation =="
echo "node: $(node --version)"
echo "chrome: $(google-chrome --version 2>/dev/null || echo 'not found')"

echo "-- Validating JSON (manifest + _locales + ai) --"
jq empty manifest.json
while IFS= read -r f; do
  jq empty "$f"
done < <(find _locales ai -name '*.json')

echo "-- Checking JavaScript syntax --"
js_count=0
while IFS= read -r f; do
  node --check "$f"
  js_count=$((js_count + 1))
done < <(find . -name '*.js' -not -path './node_modules/*' -not -path './.git/*')
echo "Checked ${js_count} JavaScript files."

echo "-- Verifying manifest-referenced files exist --"
python3 - <<'PY'
import json, glob, os, sys
m = json.load(open("manifest.json"))
missing = []
def check(p):
    if any(c in p for c in "*?[]"):
        if not glob.glob(p):
            missing.append(p + " (glob: no match)")
        return
    if not os.path.exists(p):
        missing.append(p)
check(m["background"]["service_worker"])
for cs in m.get("content_scripts", []):
    for j in cs.get("js", []):
        check(j)
for war in m.get("web_accessible_resources", []):
    for r in war.get("resources", []):
        check(r)
for _, v in m.get("icons", {}).items():
    check(v)
if missing:
    print("Missing manifest references:", missing)
    sys.exit(1)
print("All manifest-referenced files present.")
PY

echo "-- Packing extension with Chrome (manifest validation) --"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
pack="$work/pkg"
mkdir -p "$pack"
# Copy source without VCS/artifacts so the pack mirrors the shipped extension.
cp -r . "$pack/"
rm -rf "$pack/.git" "$pack/.cursor"
google-chrome --headless=new --no-sandbox --disable-gpu \
  --pack-extension="$pack" >/dev/null 2>&1
if [ -f "$work/pkg.crx" ]; then
  echo "Chrome packed the extension successfully."
else
  echo "Chrome failed to pack the extension." >&2
  exit 1
fi

echo "== Validation passed =="
