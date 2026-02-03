#!/bin/bash

# Chowkidar Installation Script
# This script installs Chowkidar and displays a token for browser access

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="${INSTALL_DIR:- /opt/chowkidar}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
SERVICE_DIR="/etc/systemd/system"
CONFIG_DIR="${CONFIG_DIR:-$HOME/.chowkidar}"
PORT="${PORT:-8080}"

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║   Chowkidar System Monitor - Install   ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Go if building from source
if [ "$BUILD_FROM_SOURCE" = "true" ]; then
    echo -e "${YELLOW}Building from source...${NC}"
    if ! command -v go &> /dev/null; then
        echo -e "${RED}✗ Go is not installed. Please install Go 1.20+ first.${NC}"
        exit 1
    fi
    
    # Build the binary
    echo "Building chowkidar..."
    go build -o chowkidar ./main.go
    BINARY="./chowkidar"
else
    # Check if binary exists
    if [ ! -f "chowkidar" ]; then
        echo -e "${RED}✗ chowkidar binary not found. Run: go build -o chowkidar ./main.go${NC}"
        exit 1
    fi
    BINARY="./chowkidar"
fi

# Create installation directories
echo -e "${BLUE}Creating installation directories...${NC}"
if [ "$EUID" -eq 0 ]; then
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
else
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
fi

# Copy binary
echo -e "${BLUE}Installing binary...${NC}"
if [ "$EUID" -eq 0 ]; then
    cp "$BINARY" "$INSTALL_DIR/chowkidar"
    chmod +x "$INSTALL_DIR/chowkidar"
    ln -sf "$INSTALL_DIR/chowkidar" "$BIN_DIR/chowkidar" 2>/dev/null || true
else
    cp "$BINARY" "$INSTALL_DIR/chowkidar"
    chmod +x "$INSTALL_DIR/chowkidar"
fi

# Copy web assets
echo -e "${BLUE}Installing web assets...${NC}"
cp -r web/static "$INSTALL_DIR/" 2>/dev/null || true
cp -r web/templates "$INSTALL_DIR/" 2>/dev/null || true

# Create systemd service file if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${BLUE}Creating systemd service...${NC}"
    cat > "$SERVICE_DIR/chowkidar.service" << 'EOF'
[Unit]
Description=Chowkidar System Monitor
Documentation=https://github.com/ahsantahseen/chowkidar
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/chowkidar
ExecStart=/opt/chowkidar/chowkidar
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=true
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/home

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 "$SERVICE_DIR/chowkidar.service"
    systemctl daemon-reload
    echo -e "${GREEN}✓ Systemd service created${NC}"
fi

# Create environment file
echo -e "${BLUE}Creating configuration file...${NC}"
cat > "$CONFIG_DIR/chowkidar.env" << EOF
# Chowkidar Configuration
PORT=${PORT}
GIN_MODE=release
# Allowed origins for CORS
CHOWKIDAR_ALLOWED_ORIGINS=http://localhost:${PORT},http://127.0.0.1:${PORT}
EOF

echo -e "${GREEN}✓ Configuration file created at $CONFIG_DIR/chowkidar.env${NC}"

# Summary
echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════╗"
echo "║   Installation Successful!             ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${BLUE}Installation Summary:${NC}"
echo "  Binary:     $INSTALL_DIR/chowkidar"
echo "  Config:     $CONFIG_DIR/chowkidar.env"
echo "  Port:       $PORT"
echo ""

# Start the service
if [ "$EUID" -eq 0 ]; then
    echo -e "${BLUE}Starting chowkidar service...${NC}"
    systemctl enable chowkidar
    systemctl start chowkidar
    sleep 2
    
    # Check if service is running
    if systemctl is-active --quiet chowkidar; then
        echo -e "${GREEN}✓ Service started successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Service status check failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Not running as root. To start the service:${NC}"
    echo "   sudo systemctl enable chowkidar"
    echo "   sudo systemctl start chowkidar"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Access the dashboard at: http://localhost:$PORT"
echo "  2. A token will be displayed on first access"
echo "  3. Copy the token to authenticate with the API/WebSocket"
echo ""
