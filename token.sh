#!/bin/bash

# Chowkidar Quick Start - Display token for API access
# Run this after installation to get your access token

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BIN="${CHOWKIDAR_BIN:-chowkidar}"
TOKEN_FILE="$HOME/.chowkidar/current-token.txt"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║  Chowkidar - Get Your Access Token    ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${BLUE}Generating authentication token...${NC}"

if ! command -v "$BIN" >/dev/null 2>&1; then
    if [ -x /usr/local/bin/chowkidar ]; then
        BIN="/usr/local/bin/chowkidar"
    else
        echo -e "${YELLOW}Chowkidar binary not found in PATH.${NC}"
        echo "  Set CHOWKIDAR_BIN or install the binary."
        exit 1
    fi
fi

SUDO_PREFIX=""
if [ -f /root/.chowkidar-secret-key ] && [ "$EUID" -ne 0 ]; then
    SUDO_PREFIX="sudo -E"
fi

TOKEN=$($SUDO_PREFIX "$BIN" --print-token 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Failed to generate token via CLI.${NC}"
    echo "  If the service runs as root, re-run with sudo."
    exit 1
fi

# Clear the screen and display token nicely
clear

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Chowkidar - Your Access Token                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

echo -e "${GREEN}✓ Token Successfully Generated${NC}"
echo ""

# Display token
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TOKEN:${NC}"
echo ""
echo -e "${YELLOW}$TOKEN${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Display token details
echo -e "${BLUE}Token Details:${NC}"
echo "  Generated via CLI"
echo ""

# Display usage instructions
echo -e "${BLUE}How to Use:${NC}"
echo ""
echo -e "${GREEN}1. Web Dashboard:${NC}"
echo "   http://localhost:$PORT"
echo ""
echo -e "${GREEN}2. API with curl:${NC}"
echo "   curl -H \"Authorization: Bearer $TOKEN\" \\""
echo "     http://localhost:8080/metrics/cpu"
echo ""
echo -e "${GREEN}3. WebSocket Connection:${NC}"
echo "   ws://localhost:8080/ws?token=$TOKEN"
echo ""

# Token is displayed - user can copy manually

echo ""echo -e "${YELLOW}Keep this token safe! It provides access to your system metrics.${NC}"
echo ""

# Save token to a file for reference
mkdir -p "$(dirname "$TOKEN_FILE")"
echo "$TOKEN" > "$TOKEN_FILE"
echo -e "${BLUE}Token saved to: $TOKEN_FILE${NC}"
echo ""
