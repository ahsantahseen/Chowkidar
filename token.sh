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
PORT="${PORT:-8080}"
TIMEOUT=10

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║  Chowkidar - Get Your Access Token    ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${YELLOW}Waiting for Chowkidar to be ready...${NC}"
echo "(Testing connection to http://localhost:$PORT)"
echo ""

# Wait for server to be ready
START_TIME=$(date +%s)
while true; do
    if curl -s http://localhost:$PORT/auth/token > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server is ready!${NC}"
        break
    fi
    
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    if [ $ELAPSED -gt $TIMEOUT ]; then
        echo -e "${YELLOW}✗ Timeout waiting for server${NC}"
        echo "  Is chowkidar running? Try: sudo systemctl status chowkidar"
        exit 1
    fi
    
    echo -n "."
    sleep 1
done

echo ""
echo -e "${BLUE}Generating authentication token...${NC}"

# Get token from server
RESPONSE=$(curl -s http://localhost:$PORT/auth/token)

# Extract token using basic parsing (fallback if jq not available)
if command -v jq &> /dev/null; then
    TOKEN=$(echo "$RESPONSE" | jq -r '.token')
    EXPIRY=$(echo "$RESPONSE" | jq -r '.expiry')
    SERVER=$(echo "$RESPONSE" | jq -r '.server')
else
    # Simple extraction without jq
    TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    EXPIRY=$(echo "$RESPONSE" | grep -o '"expiry":"[^"]*' | cut -d'"' -f4)
    SERVER=$(echo "$RESPONSE" | grep -o '"server":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Failed to generate token. Server response:${NC}"
    echo "$RESPONSE"
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
echo "  Server:  $SERVER"
echo "  Expires: $EXPIRY"
echo "  Port:    $PORT"
echo ""

# Display usage instructions
echo -e "${BLUE}How to Use:${NC}"
echo ""
echo -e "${GREEN}1. Web Dashboard:${NC}"
echo "   http://localhost:$PORT"
echo ""
echo -e "${GREEN}2. API with curl:${NC}"
echo "   curl -H \"Authorization: Bearer $TOKEN\" \\"
echo "     http://localhost:$PORT/auth/status"
echo ""
echo -e "${GREEN}3. WebSocket Connection:${NC}"
echo "   ws://localhost:$PORT/ws?token=$TOKEN"
echo ""

# Token is displayed - user can copy manually

echo ""echo -e "${YELLOW}Keep this token safe! It provides access to your system metrics.${NC}"
echo ""

# Save token to a file for reference
TOKEN_FILE="$HOME/.chowkidar/current-token.txt"
mkdir -p "$(dirname "$TOKEN_FILE")"
echo "$TOKEN" > "$TOKEN_FILE"
echo -e "${BLUE}Token saved to: $TOKEN_FILE${NC}"
echo ""
