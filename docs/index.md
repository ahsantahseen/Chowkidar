---
layout: default
title: Chowkidar
---

# Chowkidar

<div style="margin: 28px 0 36px; padding: 28px; border-radius: 20px; background: radial-gradient(circle at top left, #2c3450, #1b1e2a);">
	<p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.75rem; color: #94a3b8;">System Monitoring</p>
	<h2 style="margin: 0 0 10px; font-size: 2rem;">Modern desktop dashboards with lightweight agents</h2>
	<p style="margin: 0; color: #cbd5f5; font-size: 1.05rem;">Install the agent on any server, connect with the GUI, and monitor in real time.</p>
</div>

![Chowkidar Desktop](assets/dashboard-placeholder.svg)

## Install

### Agent (single curl command)

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-agent.sh | bash
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

## Token

Generate a token from the agent host:

```bash
curl http://localhost:8080/auth/token
```

## Screenshots

![Servers list](assets/servers-placeholder.svg)

![Dashboard](assets/dashboard-placeholder.svg)

## Support

Open an issue in the repository for bugs and feature requests.
