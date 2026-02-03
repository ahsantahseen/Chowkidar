.PHONY: build run clean help test dev setup install install-root start stop restart logs token status

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

# Configuration
INSTALL_DIR ?= /opt/chowkidar
BIN_DIR ?= /usr/local/bin
SERVICE_NAME := chowkidar
PORT ?= 8080

help:
	@echo "$(BLUE)Chowkidar - System Monitoring Dashboard$(NC)"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make build      - Build the application"
	@echo "  make run        - Build and run the application"
	@echo "  make dev        - Run in debug mode with live reload (requires air)"
	@echo "  make test       - Run tests"
	@echo "  make clean      - Remove binary and config"
	@echo ""
	@echo "$(YELLOW)Installation:$(NC)"
	@echo "  make install            - Install to ~/.local/bin"
	@echo "  make install-root       - Install as system service (requires sudo)"
	@echo "  make start              - Start the service"
	@echo "  make stop               - Stop the service"
	@echo "  make restart            - Restart the service"
	@echo "  make status             - Check service status"
	@echo "  make logs               - View service logs"
	@echo "  make token              - Display access token"
	@echo ""
	@echo "$(YELLOW)Examples:$(NC)"
	@echo "  make build              # Build locally"
	@echo "  sudo make install-root  # Install as service"
	@echo "  make token              # Get access token"
	@echo ""

build:
	@echo "$(BLUE)Building Chowkidar...$(NC)"
	@go build -o chowkidar .
	@echo "$(GREEN)✓ Build successful$(NC)"

run: build
	@echo "$(BLUE)Starting Chowkidar on http://127.0.0.1:8080$(NC)"
	@echo "$(YELLOW)Set up admin account at: http://127.0.0.1:8080/setup-page$(NC)"
	@./chowkidar

dev:
	@echo "$(BLUE)Starting Chowkidar in debug mode...$(NC)"
	@echo "$(YELLOW)Make sure 'air' is installed: go install github.com/cosmtrek/air@latest$(NC)"
	@air

clean:
	@echo "$(BLUE)Cleaning up...$(NC)"
	@rm -f chowkidar chowkidar-setup
	@rm -rf config/
	@go clean
	@echo "$(GREEN)✓ Clean complete$(NC)"

test:
	@echo "$(BLUE)Running tests...$(NC)"
	@go test ./...

install: build
	@echo "$(BLUE)Installing to ~/.local/bin...$(NC)"
	@mkdir -p ~/.local/bin
	@cp chowkidar ~/.local/bin/
	@chmod +x ~/.local/bin/chowkidar
	@echo "$(GREEN)✓ Installation complete!$(NC)"
	@echo ""
	@echo "To use: export PATH=\$$HOME/.local/bin:\$$PATH"
	@echo "Then run: chowkidar"

install-root: build
	@if [ "$$(id -u)" != "0" ]; then \
		echo "$(YELLOW)✗ This requires root. Run: sudo make install-root$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)Installing as system service...$(NC)"
	@mkdir -p $(INSTALL_DIR)
	@cp chowkidar $(INSTALL_DIR)/
	@chmod +x $(INSTALL_DIR)/chowkidar
	@mkdir -p ~/.chowkidar
	@echo "$(GREEN)✓ Binary installed to $(INSTALL_DIR)/chowkidar$(NC)"
	@echo ""
	@echo "$(BLUE)Creating systemd service...$(NC)"
	@echo "[Unit]" > /etc/systemd/system/$(SERVICE_NAME).service
	@echo "Description=Chowkidar System Monitor" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "After=network.target" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "[Service]" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "Type=simple" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "ExecStart=$(INSTALL_DIR)/chowkidar" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "Restart=on-failure" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "RestartSec=10" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "StandardOutput=journal" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "StandardError=journal" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "[Install]" >> /etc/systemd/system/$(SERVICE_NAME).service
	@echo "WantedBy=multi-user.target" >> /etc/systemd/system/$(SERVICE_NAME).service
	@systemctl daemon-reload
	@chmod 644 /etc/systemd/system/$(SERVICE_NAME).service
	@echo "$(GREEN)✓ Systemd service created$(NC)"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  sudo systemctl start $(SERVICE_NAME)     # Start service"
	@echo "  sudo systemctl enable $(SERVICE_NAME)    # Auto-start on boot"
	@echo "  sudo systemctl status $(SERVICE_NAME)    # Check status"
	@echo "  make token                                # Get access token"

start:
	@echo "$(BLUE)Starting $(SERVICE_NAME)...$(NC)"
	@sudo systemctl start $(SERVICE_NAME)
	@echo "$(GREEN)✓ Service started$(NC)"
	@sleep 2
	@sudo systemctl status $(SERVICE_NAME)

stop:
	@echo "$(BLUE)Stopping $(SERVICE_NAME)...$(NC)"
	@sudo systemctl stop $(SERVICE_NAME)
	@echo "$(GREEN)✓ Service stopped$(NC)"

restart:
	@echo "$(BLUE)Restarting $(SERVICE_NAME)...$(NC)"
	@sudo systemctl restart $(SERVICE_NAME)
	@echo "$(GREEN)✓ Service restarted$(NC)"
	@sleep 2
	@make status

status:
	@sudo systemctl status $(SERVICE_NAME)

logs:
	@sudo journalctl -u $(SERVICE_NAME) -f

token:
	@echo "$(BLUE)Fetching authentication token...$(NC)"
	@echo ""
	@curl -s http://localhost:$(PORT)/auth/token 2>/dev/null | \
		if command -v jq >/dev/null 2>&1; then \
			jq -r '.token' ; \
		else \
			grep -o '"token":"[^"]*' | cut -d'"' -f4; \
		fi
	@echo ""
	@echo "$(GREEN)✓ Token displayed above$(NC)"
	@echo "$(YELLOW)Save this token for API/WebSocket authentication$(NC)"

setup:
	@echo "$(BLUE)Starting setup wizard...$(NC)"
	@read -p "Enter username: " username; \
	read -sp "Enter password: " password; \
	curl -X POST http://127.0.0.1:8080/setup \
		-d "username=$$username&password=$$password" \
		-w "\n"
	@echo "$(GREEN)✓ Setup complete. Log in at http://127.0.0.1:8080/login$(NC)"

fmt:
	@echo "$(BLUE)Formatting code...$(NC)"
	@go fmt ./...
	@echo "$(GREEN)✓ Format complete$(NC)"

lint:
	@echo "$(BLUE)Linting code...$(NC)"
	@golangci-lint run ./...

all: clean build
	@echo "$(GREEN)✓ All tasks complete$(NC)"
