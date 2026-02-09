#!/usr/bin/env bash
set -euo pipefail

REPO="ahsantahseen/Chowkidar"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="chowkidar-agent"
SERVICE_NAME="${SERVICE_NAME:-chowkidar-agent}"
RELEASE_TAG="${RELEASE_TAG:-latest}"

if [[ "$EUID" -ne 0 ]]; then
  echo "This installer must be run as root. Try: sudo $0"
  exit 1
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux) OS_KEY="linux";;
  *) echo "Unsupported OS: $OS (systemd installer is Linux-only)"; exit 1;;
 esac

case "$ARCH" in
  x86_64|amd64) ARCH_KEY="amd64";;
  arm64|aarch64) ARCH_KEY="arm64";;
  *) echo "Unsupported arch: $ARCH"; exit 1;;
 esac

ASSET_PREFIX_PRIMARY="chowkidar-agent-${OS_KEY}-${ARCH_KEY}"
ASSET_PREFIX_FALLBACK="chowkidar-${OS_KEY}-${ARCH_KEY}"

if [[ "$RELEASE_TAG" == "latest" ]]; then
  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
else
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}"
fi

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
for asset in assets:
    name = asset.get("name", "")
    if name.startswith(asset_primary):
        print(asset.get("browser_download_url", ""))
        raise SystemExit(0)
for asset in assets:
    name = asset.get("name", "")
    if name.startswith(asset_fallback):
        print(asset.get("browser_download_url", ""))
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
for asset in assets:
    name = asset.get("name", "")
    if name.startswith(asset_primary):
        print(asset.get("browser_download_url", ""))
        raise SystemExit(0)
for asset in assets:
    name = asset.get("name", "")
    if name.startswith(asset_fallback):
        print(asset.get("browser_download_url", ""))
        raise SystemExit(0)
print("")
PY
  fi
}

URL=$(fetch_asset_url)

if [[ -z "$URL" ]]; then
  echo "No release asset found for ${ASSET_PREFIX_PRIMARY} or ${ASSET_PREFIX_FALLBACK}."
  echo "Publish a GitHub Release with agent binaries, then retry."
  exit 1
fi

echo "Downloading ${ASSET_PREFIX_PRIMARY} (or fallback)..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" -o "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"

cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Chowkidar Agent
After=network.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/${BINARY_NAME}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

systemctl status ${SERVICE_NAME} --no-pager

echo "Installed: ${INSTALL_DIR}/${BINARY_NAME}"
echo "Service: ${SERVICE_NAME}"
