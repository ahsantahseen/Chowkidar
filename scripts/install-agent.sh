#!/usr/bin/env bash
set -euo pipefail

REPO="ahsantahseen/Chowkidar"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="chowkidar-agent"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_KEY="darwin";;
  Linux) OS_KEY="linux";;
  *) echo "Unsupported OS: $OS"; exit 1;;
 esac

case "$ARCH" in
  x86_64|amd64) ARCH_KEY="amd64";;
  arm64|aarch64) ARCH_KEY="arm64";;
  *) echo "Unsupported arch: $ARCH"; exit 1;;
 esac

ASSET_PREFIX_PRIMARY="chowkidar-agent-${OS_KEY}-${ARCH_KEY}"
ASSET_PREFIX_FALLBACK="chowkidar-${OS_KEY}-${ARCH_KEY}"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

fetch_asset_url() {
  if command -v python3 >/dev/null 2>&1; then
    API_URL="$API_URL" ASSET_PRIMARY="$ASSET_PREFIX_PRIMARY" ASSET_FALLBACK="$ASSET_PREFIX_FALLBACK" python3 - <<'PY'
import json
import os
import urllib.error
import urllib.request

api_url = os.environ["API_URL"]
asset_primary = os.environ["ASSET_PRIMARY"]
asset_fallback = os.environ["ASSET_FALLBACK"]
try:
  with urllib.request.urlopen(api_url) as response:
    data = json.load(response)
except (urllib.error.HTTPError, urllib.error.URLError):
  print("")
  raise SystemExit(0)
assets = data.get("assets", [])
matches = []
for asset in assets:
    name = asset.get("name", "")
    if name.startswith(asset_primary):
        print(asset.get("browser_download_url", ""))
        raise SystemExit(0)
    if name.startswith(asset_fallback):
        matches.append(asset.get("browser_download_url", ""))
if matches:
    print(matches[0])
    raise SystemExit(0)
print("")
PY
  else
    API_URL="$API_URL" ASSET_PRIMARY="$ASSET_PREFIX_PRIMARY" ASSET_FALLBACK="$ASSET_PREFIX_FALLBACK" python - <<'PY'
import json
import os
import urllib.error
import urllib.request

api_url = os.environ["API_URL"]
asset_primary = os.environ["ASSET_PRIMARY"]
asset_fallback = os.environ["ASSET_FALLBACK"]
try:
  with urllib.request.urlopen(api_url) as response:
    data = json.load(response)
except (urllib.error.HTTPError, urllib.error.URLError):
  print("")
  raise SystemExit(0)
assets = data.get("assets", [])
matches = []
for asset in assets:
    name = asset.get("name", "")
    if name.startswith(asset_primary):
        print(asset.get("browser_download_url", ""))
        raise SystemExit(0)
    if name.startswith(asset_fallback):
        matches.append(asset.get("browser_download_url", ""))
if matches:
    print(matches[0])
    raise SystemExit(0)
print("")
PY
  fi
}

URL=$(fetch_asset_url)

if [[ -z "$URL" ]]; then
  echo "No release asset found for ${ASSET_PREFIX_PRIMARY} or ${ASSET_PREFIX_FALLBACK}."
  echo "Falling back to build from source (requires git + Go)."
  TMP_DIR=$(mktemp -d)
  git clone --depth=1 "https://github.com/${REPO}.git" "$TMP_DIR"
  pushd "$TMP_DIR" >/dev/null
  if ! command -v go >/dev/null 2>&1; then
    echo "Go is required to build from source."
    exit 1
  fi
  go build -o chowkidar ./main.go
  mkdir -p "$INSTALL_DIR"
  cp ./chowkidar "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"
  popd >/dev/null
  rm -rf "$TMP_DIR"
else
  echo "Downloading ${ASSET_PREFIX_PRIMARY} (or fallback)..."
  mkdir -p "$INSTALL_DIR"
  curl -fsSL "$URL" -o "$INSTALL_DIR/$BINARY_NAME"
  chmod +x "$INSTALL_DIR/$BINARY_NAME"
fi

echo "Installed: $INSTALL_DIR/$BINARY_NAME"
echo "Run: $BINARY_NAME"
