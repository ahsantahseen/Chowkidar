#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="chowkidar-agent"
SERVICE_NAME="${SERVICE_NAME:-chowkidar-agent}"

if [[ "$EUID" -ne 0 ]]; then
  echo "This uninstaller must be run as root. Try: sudo $0"
  exit 1
fi

systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}" 2>/dev/null || true

rm -f "/etc/systemd/system/${SERVICE_NAME}.service"

systemctl daemon-reload
systemctl reset-failed "${SERVICE_NAME}" 2>/dev/null || true

rm -f "${INSTALL_DIR}/${BINARY_NAME}"

echo "Removed service: ${SERVICE_NAME}"
echo "Removed binary: ${INSTALL_DIR}/${BINARY_NAME}"
