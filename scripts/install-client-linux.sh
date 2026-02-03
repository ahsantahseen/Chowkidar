#!/usr/bin/env bash
set -euo pipefail

REPO="ahsantahseen/Chowkidar"
OUT="${OUT:-$HOME/Downloads/Chowkidar.AppImage}"

API_URL="https://api.github.com/repos/${REPO}/releases/latest"

if command -v python3 >/dev/null 2>&1; then
  URL=$(curl -fsSL "$API_URL" | python3 - <<'PY'
import json, sys

data = json.load(sys.stdin)
assets = data.get("assets", [])
preferred = [a for a in assets if a.get("name", "").endswith(".AppImage") and "Chowkidar" in a.get("name", "")]
if preferred:
    print(preferred[0].get("browser_download_url", ""))
    raise SystemExit(0)
for asset in assets:
    name = asset.get("name", "")
    if name.endswith(".AppImage"):
        print(asset.get("browser_download_url", ""))
        break
PY
  )
else
  URL=$(curl -fsSL "$API_URL" | python - <<'PY'
import json, sys

data = json.load(sys.stdin)
assets = data.get("assets", [])
preferred = [a for a in assets if a.get("name", "").endswith(".AppImage") and "Chowkidar" in a.get("name", "")]
if preferred:
    print(preferred[0].get("browser_download_url", ""))
    raise SystemExit(0)
for asset in assets:
    name = asset.get("name", "")
    if name.endswith(".AppImage"):
        print(asset.get("browser_download_url", ""))
        break
PY
  )
fi

if [[ -z "$URL" ]]; then
  echo "No Linux AppImage asset found in latest release."
  exit 1
fi

curl -fsSL "$URL" -o "$OUT"
chmod +x "$OUT"
"$OUT" --appimage-version || true

echo "Downloaded to: $OUT"
