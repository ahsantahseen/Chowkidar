---
layout: default
title: Chowkidar
---

<div style="margin: 36px 0 32px; text-align: center;">
	<h1 style="margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.72rem; color: #94a3b8;">System Monitoring</h1>
	<h2 style="margin: 0 0 12px; font-size: 2.2rem; line-height: 1.2;">Modern desktop dashboards with lightweight agents</h2>
	<p style="margin: 0 auto; max-width: 640px; color: #cbd5f5; font-size: 1.05rem;">Install the agent on any server, connect with the GUI, and monitor in real time.</p>
	<div style="margin: 20px auto 0; display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
		<a href="#agent-install" style="padding: 10px 18px; border-radius: 999px; background: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 600;">Install Agent</a>
		<a href="#desktop-gui" style="padding: 10px 18px; border-radius: 999px; border: 1px solid #3b82f6; color: #3b82f6; text-decoration: none; font-weight: 600;">Get Desktop GUI</a>
	</div>
</div>

![Chowkidar Desktop](assets/dashboard-placeholder.png)

## Install

### <span id="agent-install"></span>Agent (single curl command)

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-agent.sh | bash
```

### Agent (install as systemd service on Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/ahsantahseen/Chowkidar/main/scripts/install-agent-service.sh | sudo bash
```

Run it:

```bash
chowkidar-agent
```

### <span id="desktop-gui"></span>Desktop GUI

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

Auth tokens are optional when adding a server in the desktop app. If left empty,
the app will request a token automatically from the agent on first connect.

## Token

Generate a token on the agent host (CLI only):

```bash
./chowkidar --print-token
```

## Screenshots

![Servers list](assets/servers-placeholder.png)

![CPU Details](assets/dashboard-details-cpu.png)

## Support

Open an issue in the repository for bugs and feature requests.
