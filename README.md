# Chowkidar

A lightweight monitoring stack with a desktop GUI and deployable agents for your servers.

## Components

- **Agent**: runs on each server and streams metrics.
- **Desktop GUI**: connect to agents and visualize metrics.

## Screenshots

<p align="center">
  <img src="docs/assets/servers-placeholder.png" width="32%" alt="Servers" />
  <img src="docs/assets/dashboard-placeholder.png" width="32%" alt="Dashboard" />
  <img src="docs/assets/dashboard-details-cpu.png" width="32%" alt="Details" />
</p>

## Install

### Agent (single curl command)

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-agent.sh | bash
```

### Agent (install as systemd service on Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-agent-service.sh | sudo bash
```

The installer will prompt for the port (defaults to 8080).

### Remove agent systemd service (Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/uninstall-agent-service.sh | sudo bash
```

Run it:

```bash
chowkidar-agent
```

### Desktop GUI

**macOS**

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-client-macos.sh | bash
```

**Windows (PowerShell)**

```powershell
iwr -useb https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-client-windows.ps1 | iex
```

**Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-client-linux.sh | bash
```

## Connect the GUI

Set the backend URL in the desktop app when prompted or via `desktop/config.json`.
Generate a token on the agent host with `./chowkidar --print-token`, then paste
it into the server configuration in the desktop app.

## Token

Generate a token on the agent host (CLI only):

```bash
./chowkidar --print-token
```

## Environment

- `CHOWKIDAR_HOST` (default: `127.0.0.1`)
- `CHOWKIDAR_PORT` (default: `8080`)
- `CHOWKIDAR_ALLOWED_ORIGINS` (comma-separated)
- `CHOWKIDAR_TRUSTED_PROXIES` (comma-separated IPs/CIDRs for reverse proxies)

## Development (optional)

```bash
make build
./chowkidar
```

```javascript
// JavaScript example
const socket = new WebSocket("wss://dashboard.example.com:8080/ws");

socket.onopen = () => {
  socket.send(
    JSON.stringify({
      type: "auth",
      token: "your-jwt-token",
    }),
  );
};

socket.onmessage = (event) => {
  console.log("Metrics received:", event.data);
};
```

### Metrics REST API (from Agent)

```bash
# Get CPU metrics
curl -H "Authorization: Bearer TOKEN" \
  http://agent:8080/metrics/cpu

# Available endpoints:
# - /metrics/cpu
# - /metrics/memory
# - /metrics/disk
# - /metrics/network
# - /metrics/all
```

## Building Agents

### Cross-Compile for All Platforms

```bash
# Build all agent binaries
make build-agent-all

# Outputs:
# chowkidar-agent-darwin-arm64
# chowkidar-agent-darwin-amd64
# chowkidar-agent-linux-amd64
# chowkidar-agent-linux-arm64
# chowkidar-agent-windows-amd64.exe
```

### Build for Specific OS

```bash
make build-agent-linux
make build-agent-macos
make build-agent-windows
```

## Installation as Service

### Systemd (Linux)

```bash
sudo ./chowkidar install-service
sudo systemctl start chowkidar
sudo systemctl enable chowkidar
sudo systemctl status chowkidar
```

### LaunchAgent (macOS)

```bash
./chowkidar install-service
# Automatically installed to ~/Library/LaunchAgents
```

## Performance & Scaling

### Dashboard Capacity

- **Agents**: 100+ concurrent connections
- **Memory**: ~100MB for 50 agents
- **CPU**: <1% idle
- **Network**: ~1KB/s per agent

### Agent Resource Usage

- **Memory**: ~20MB per agent
- **CPU**: <1% (metric collection + network)
- **Disk**: <100MB for binary
- **Network**: ~1KB/s upstream, <100 bytes/s metadata

### Latency

- **Agent to Dashboard**: <100ms typical
- **Dashboard to Browser**: Real-time (WebSocket)
- **Metric Update Frequency**: Configurable (default: 2s)

## Security Best Practices

1. **Use TLS in Production**

   ```bash
   ./chowkidar --tls-cert cert.pem --tls-key key.pem
   ```

2. **Rotate Tokens Every 90 Days**

   ```bash
   make token  # Generate new token
   ```

3. **Use Strong Secrets**
   - Tokens are JWT, unique per agent
   - Never share tokens across environments

4. **Network Security**
   - Agents connect outbound only
   - No inbound firewall rules needed on agents
   - Restrict dashboard access by IP

5. **Disable Unnecessary Features**
   - Disable CORS if not needed
   - Use authentication tokens

## Troubleshooting

### Agent Not Showing in Dashboard

```bash
# Check agent is running
ps aux | grep chowkidar-agent

# Check connectivity
nc -zv dashboard.example.com 8080

# Check logs
journalctl -u chowkidar-agent -f
```

### WebSocket Connection Failed

```bash
# Test WebSocket endpoint
wscat -c wss://dashboard.example.com:8080/ws

# Check firewall
sudo ufw allow 8080

# Check proxy settings
echo $HTTP_PROXY
```

### High Memory Usage

```bash
# Increase metrics retention
# Default: 1 hour of metrics in memory

./chowkidar --metrics-retention 30m
```

## Development

### Local Setup

```bash
# Terminal 1: Start dashboard
make dev

# Terminal 2: Generate token
make token

# Terminal 3: Simulate agent (send test metrics)
go run internal/agent/main.go \
  --dashboard http://localhost:8080 \
  --token YOUR_TOKEN \
  --name "Test Agent"

# Terminal 4: Open dashboard
open http://localhost:8080
```

### Project Structure

```
chowkidar/
├── main.go                 # Dashboard entry point
├── internal/
│   ├── routes/            # HTTP/WebSocket routes
│   ├── handlers/          # API handlers
│   ├── middleware/        # Auth, CORS
│   ├── models/            # Data structures
│   ├── services/          # Business logic
│   └── agent/             # Agent code
├── web/
│   ├── templates/         # HTML dashboard
│   ├── static/
│   │   ├── css/
│   │   ├── js/
│   │   └── img/
├── Makefile
├── README.md
└── ARCHITECTURE.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Roadmap

- [x] Basic monitoring dashboard
- [x] Agent framework
- [ ] Process monitoring
- [ ] Alert notifications
- [ ] Metrics export (Prometheus)
- [ ] Custom dashboards
- [ ] Mobile app
- [ ] Docker support
- [ ] Kubernetes integration

## Support

- 📖 [Architecture Documentation](./ARCHITECTURE.md)
- 🐛 [GitHub Issues](https://github.com/yourusername/chowkidar/issues)
- 💬 [GitHub Discussions](https://github.com/yourusername/chowkidar/discussions)

## License

MIT License - see LICENSE file

---

**Made for DevOps engineers, system administrators, and teams that need to monitor servers globally.**

⭐ If you find Chowkidar helpful, please star the repository!
