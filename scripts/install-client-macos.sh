#!/usr/bin/env bash
set -euo pipefail

REPO="ahsantahseen/Chowkidar"
OUT="${OUT:-$HOME/Downloads/Chowkidar.dmg}"

API_URL="https://api.github.com/repos/${REPO}/releases/latest"

if command -v python3 >/dev/null 2>&1; then
  URL=$(curl -fsSL "$API_URL" | python3 - <<'PY'
import json, sys

data = json.load(sys.stdin)
assets = data.get("assets", [])
preferred = [a for a in assets if a.get("name", "").endswith(".dmg") and "Chowkidar" in a.get("name", "")]
if preferred:
    print(preferred[0].get("browser_download_url", ""))
    raise SystemExit(0)
for asset in assets:
    name = asset.get("name", "")
    if name.endswith(".dmg"):
        print(asset.get("browser_download_url", ""))
        break
PY
  )
else
  URL=$(curl -fsSL "$API_URL" | python - <<'PY'
import json, sys

data = json.load(sys.stdin)
assets = data.get("assets", [])
preferred = [a for a in assets if a.get("name", "").endswith(".dmg") and "Chowkidar" in a.get("name", "")]
if preferred:
    print(preferred[0].get("browser_download_url", ""))
    raise SystemExit(0)
for asset in assets:
    name = asset.get("name", "")
    if name.endswith(".dmg"):
        print(asset.get("browser_download_url", ""))
        break
PY
  )
fi

if [[ -z "$URL" ]]; then
  echo "No macOS .dmg asset found in latest release."
  exit 1
fi

curl -fsSL "$URL" -o "$OUT"
open "$OUT"
