/**
 * Multi-Server Dashboard Manager
 * Handles server management, switching, and dashboard rendering
 */

class ServerManager {
  constructor() {
    this.servers = [];
    this.currentServer = null;
    this.searchQuery = "";
    this.groupBy = "group";
    this.draggingId = null;
    this.wsClients = new Map(); // Map of server ID to WebSocket client
    this.dashboardData = new Map(); // Map of server ID to dashboard data
    this.charts = new Map(); // Map of server ID to chart instances
    this.history = new Map(); // Map of server ID to history data

    this.isReady = false;
    this.statusPoller = null;
  }

  normalizeUrl(rawUrl) {
    const trimmed = rawUrl?.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/\/$/, "");
    }
    return `http://${trimmed}`.replace(/\/$/, "");
  }

  normalizeHost(rawHost) {
    const trimmed = rawHost?.trim();
    if (!trimmed) return "";
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `http://${trimmed}`;
      const parsed = new URL(withProtocol);
      return parsed.hostname || parsed.host || "";
    } catch (error) {
      return trimmed
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        .replace(/:\d+$/, "");
    }
  }

  buildUrlFromHostPort(host, port) {
    const normalizedHost = this.normalizeHost(host);
    const trimmedPort = String(port || "").trim();
    if (!normalizedHost || !trimmedPort) return "";
    const isIpv6 =
      normalizedHost.includes(":") && !normalizedHost.startsWith("[");
    const hostPart = isIpv6 ? `[${normalizedHost}]` : normalizedHost;
    return `http://${hostPart}:${trimmedPort}`;
  }

  parseHostPort(url) {
    const normalized = this.normalizeUrl(url);
    try {
      const parsed = new URL(normalized);
      return {
        host: parsed.hostname || "",
        port: parsed.port || "80",
      };
    } catch (error) {
      return { host: "", port: "" };
    }
  }

  extractHost(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return parsed.hostname || parsed.host || "";
    } catch (error) {
      return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  }

  normalizeGroup(rawGroup) {
    const trimmed = rawGroup?.trim();
    return trimmed || "General";
  }

  normalizeTags(rawTags) {
    if (!rawTags) return [];
    if (Array.isArray(rawTags)) {
      return rawTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    }
    return String(rawTags)
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  formatTags(tags) {
    return this.normalizeTags(tags).join(", ");
  }

  getIconIndex(value) {
    const text = String(value || "");
    if (!text) return 1;
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash + text.charCodeAt(i) * (i + 1)) % 997;
    }
    return (hash % 3) + 1;
  }

  detectOsKey(server) {
    const name = String(server?.name || "").toLowerCase();
    const group = String(server?.group || "").toLowerCase();
    const tags = this.normalizeTags(server?.tags).join(" ").toLowerCase();
    const host = String(this.extractHost(server?.url || "")).toLowerCase();
    const haystack = `${name} ${group} ${tags} ${host}`;

    if (/\b(win|windows)\b/.test(haystack)) return "windows";
    if (/\b(mac|macos|osx|darwin)\b/.test(haystack)) return "macos";
    if (/\bubuntu\b/.test(haystack)) return "ubuntu";
    if (/\bdebian\b/.test(haystack)) return "debian";
    if (/\bfedora\b/.test(haystack)) return "fedora";
    if (/\bcentos\b/.test(haystack)) return "centos";
    if (/\brhel\b|red\s*hat\b/.test(haystack)) return "rhel";
    if (/\brocky\b/.test(haystack)) return "rocky";
    if (/\balma\b/.test(haystack)) return "alma";
    if (/\barch\b/.test(haystack)) return "arch";
    if (/\blinux\b/.test(haystack)) return "linux";

    return "server";
  }

  getOsIconPath(osKey) {
    return `static/icons/os-${osKey}.svg`;
  }

  async fetchWithTimeout(url, timeoutMs = 4000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async bootstrap() {
    await this.loadServers();
    this.initializeUI();
    this.isReady = true;
  }

  // Load servers from SQLite (desktop) or localStorage fallback
  async loadServers() {
    try {
      if (window.desktopAPI?.listServers) {
        const rows = await window.desktopAPI.listServers();
        this.servers = rows.map((server) => ({
          ...server,
          url: this.normalizeUrl(server.url),
          group: this.normalizeGroup(server.group_name || server.group),
          tags: this.normalizeTags(server.tags || server.tags_list),
          sortOrder:
            server.sort_order ?? server.sortOrder ?? server.sort_order ?? 0,
          status: server.status || "offline",
          lastError: server.lastError || "",
          lastSeenAt: server.lastSeenAt || null,
        }));
        this.saveServers();
        return;
      }

      const stored = localStorage.getItem("chowkidar_servers");
      if (stored) {
        try {
          this.servers = JSON.parse(stored);
          this.servers = this.servers.map((server) => ({
            ...server,
            url: this.normalizeUrl(server.url),
            group: this.normalizeGroup(server.group),
            tags: this.normalizeTags(server.tags),
            sortOrder: server.sortOrder ?? server.sort_order ?? 0,
            status: server.status || "offline",
            lastError: server.lastError || "",
            lastSeenAt: server.lastSeenAt || null,
          }));
        } catch (e) {
          console.error("Failed to load servers:", e);
          this.servers = [];
        }
      }
    } catch (error) {
      console.warn("localStorage unavailable, using in-memory state", error);
      this.servers = [];
    }
  }

  // Save servers to localStorage
  saveServers() {
    try {
      localStorage.setItem("chowkidar_servers", JSON.stringify(this.servers));
    } catch (error) {
      console.warn("Failed to persist servers to localStorage", error);
    }
  }

  // Add a new server
  async addServer(name, url, token = null, group = null, tags = null) {
    const trimmedName = name?.trim();
    const trimmedUrl = this.normalizeUrl(url);
    const trimmedToken = token?.trim();
    if (!trimmedName || !trimmedUrl) {
      throw new Error("name and url are required");
    }
    if (!trimmedToken) {
      throw new Error("token is required");
    }

    const normalizedGroup = this.normalizeGroup(group);
    const normalizedTags = this.normalizeTags(tags);
    const resolvedToken = trimmedToken;

    if (window.desktopAPI?.createServer) {
      const created = await window.desktopAPI.createServer({
        name: trimmedName,
        url: trimmedUrl,
        token: resolvedToken,
        group: normalizedGroup,
        tags: this.formatTags(normalizedTags),
      });
      this.servers = [
        {
          ...created,
          group: normalizedGroup,
          tags: normalizedTags,
          token: created.token ?? resolvedToken,
          status: "offline",
          lastError: "",
          lastSeenAt: null,
        },
        ...this.servers.filter((s) => s.id !== created.id),
      ];
      this.saveServers();
      this.renderServersList();
      return created.id;
    }

    const id = Date.now().toString();
    const maxOrder = this.servers.reduce(
      (max, server) => Math.max(max, Number(server.sortOrder || 0)),
      0,
    );
    const server = {
      id,
      name: trimmedName,
      url: trimmedUrl,
      token: resolvedToken,
      group: normalizedGroup,
      tags: normalizedTags,
      sortOrder: maxOrder + 1,
      createdAt: new Date().toISOString(),
      status: "offline",
      lastError: "",
      lastSeenAt: null,
    };

    this.servers.push(server);
    this.saveServers();
    this.renderServersList();

    return id;
  }

  // Edit server
  async editServer(id, name, url, token = null, group = null, tags = null) {
    const trimmedName = name?.trim();
    const trimmedUrl = this.normalizeUrl(url);
    const trimmedToken = token?.trim();
    if (!trimmedName || !trimmedUrl) {
      throw new Error("name and url are required");
    }
    if (!trimmedToken) {
      throw new Error("token is required");
    }

    const normalizedGroup = this.normalizeGroup(group);
    const normalizedTags = this.normalizeTags(tags);

    if (window.desktopAPI?.updateServer) {
      const updated = await window.desktopAPI.updateServer({
        id,
        name: trimmedName,
        url: trimmedUrl,
        token: trimmedToken,
        group: normalizedGroup,
        tags: this.formatTags(normalizedTags),
      });

      this.servers = this.servers.map((server) =>
        server.id === id ? { ...server, ...updated } : server,
      );
      this.saveServers();
      this.renderServersList();

      if (this.currentServer && this.currentServer.id === id) {
        const nameLabel = document.getElementById("serverName");
        const urlLabel = document.getElementById("serverUrl");
        if (nameLabel) {
          nameLabel.textContent = trimmedName;
        }
        if (urlLabel) {
          urlLabel.textContent = trimmedUrl;
        }
        const ipLabel = document.getElementById("serverIp");
        if (ipLabel) {
          ipLabel.textContent = this.extractHost(trimmedUrl);
        }
      }
      return;
    }

    const server = this.servers.find((s) => s.id === id);
    if (server) {
      server.name = trimmedName;
      server.url = trimmedUrl;
      server.token = trimmedToken;
      server.group = normalizedGroup;
      server.tags = normalizedTags;
      this.saveServers();
      this.renderServersList();

      if (this.currentServer && this.currentServer.id === id) {
        const nameLabel = document.getElementById("serverName");
        const urlLabel = document.getElementById("serverUrl");
        if (nameLabel) {
          nameLabel.textContent = trimmedName;
        }
        if (urlLabel) {
          urlLabel.textContent = trimmedUrl;
        }
        const ipLabel = document.getElementById("serverIp");
        if (ipLabel) {
          ipLabel.textContent = this.extractHost(trimmedUrl);
        }
      }
    }
  }

  // Delete server
  async deleteServer(id) {
    const index = this.servers.findIndex((s) => String(s.id) === String(id));
    if (index > -1) {
      this.disconnectServer(id);

      if (window.desktopAPI?.deleteServer) {
        await window.desktopAPI.deleteServer({ id });
      }

      this.servers.splice(index, 1);
      this.saveServers();
      this.renderServersList();

      if (this.currentServer && this.currentServer.id === id) {
        this.currentServer = null;
        this.renderDashboard();
      }
    }
  }

  // Connect to a server
  async connectServer(id) {
    let server = this.servers.find((s) => String(s.id) === String(id));
    if (!server) {
      console.error("Server not found:", id);
      return;
    }

    console.log("Connecting to server:", server.name);
    this.updateServerStatus(id, "connecting", "");

    // If already connected to a different server, disconnect
    if (this.currentServer && this.currentServer.id !== id) {
      this.disconnectServer(this.currentServer.id);
    }

    this.currentServer = server;

    // Get or generate token
    let token = server.token;
    if (!token) {
      const message =
        "Missing token. Generate it via command and paste it into the server config.";
      console.error("Cannot connect without token for", server.url);
      this.updateServerStatus(id, "error", "missing token");
      alert(`Failed to connect to ${server.name}: ${message}`);
      return;
    }

    // Update UI
    const nameLabel = document.getElementById("serverName");
    const urlLabel = document.getElementById("serverUrl");
    if (nameLabel) {
      nameLabel.textContent = server.name;
    }
    if (urlLabel) {
      urlLabel.textContent = server.url;
    }
    const ipLabel = document.getElementById("serverIp");
    if (ipLabel) {
      ipLabel.textContent = this.extractHost(server.url);
    }
    this.renderServersList();

    // Initialize WebSocket
    await this.initializeWebSocket(id, server, token);
  }

  // Initialize WebSocket for a server
  async initializeWebSocket(id, server, token) {
    if (this.wsClients.has(id)) {
      return; // Already connected
    }

    const protocol = server.url.startsWith("https") ? "wss" : "ws";
    const wsUrl = `${protocol}://${server.url.replace(/^https?:\/\//, "")}`;

    // Create WebSocket connection directly for this server
    const wsConnection = new WebSocket(`${wsUrl}/ws?token=${token}`);

    const wsClient = {
      id,
      ws: wsConnection,
      isConnected: false,
      messageHandlers: [],
      serverUrl: server.url,
    };

    // Setup WebSocket handlers
    wsConnection.onopen = () => {
      wsClient.isConnected = true;
      console.log(`✅ Connected to ${server.name}`);
      this.updateServerStatus(id, "online", "");
    };

    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Skip non-stats messages
        if (message.type !== "stats" || !message.data) {
          return;
        }

        // Parse data if it's a string
        let statsData = message.data;
        if (typeof message.data === "string") {
          statsData = JSON.parse(message.data);
        }

        // Call all registered handlers
        wsClient.messageHandlers.forEach((handler) => {
          try {
            handler(statsData);
          } catch (error) {
            console.error("Error in message handler:", error);
          }
        });
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    wsConnection.onerror = (error) => {
      console.error(`❌ WebSocket error for ${server.name}:`, error);
      this.updateServerStatus(id, "error", "WebSocket error");
    };

    wsConnection.onclose = () => {
      wsClient.isConnected = false;
      console.log(`⚠️ Disconnected from ${server.name}`);
      this.updateServerStatus(id, "offline", "Disconnected");
    };

    // Store client
    this.wsClients.set(id, wsClient);

    // Initialize history for this server
    if (!this.history.has(id)) {
      this.history.set(id, {
        cpu: [],
        memory: [],
        network: [],
      });
    }

    // Register stats handler
    const handler = (stats) => {
      this.handleServerStats(id, stats);
    };
    wsClient.messageHandlers.push(handler);

    // Wait a bit for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Disconnect from a server
  disconnectServer(id) {
    const wsClient = this.wsClients.get(id);
    if (wsClient && wsClient.ws) {
      wsClient.ws.close();
    }
    this.wsClients.delete(id);
    this.updateServerStatus(id, "offline");
  }

  // Handle incoming stats from a server
  handleServerStats(id, stats) {
    // Update status
    this.updateServerStatus(id, "online", "");

    // Store current data
    if (!this.dashboardData.has(id)) {
      this.dashboardData.set(id, {});
    }

    const data = this.dashboardData.get(id);
    data.current = stats;
    data.timestamp = new Date();

    // Accumulate history if this is the active server
    if (this.currentServer && this.currentServer.id === id) {
      const history = this.history.get(id);

      if (stats.cpu) {
        history.cpu.push({
          usage: stats.cpu.usage_percent,
          timestamp: new Date().toISOString(),
        });
        if (history.cpu.length > 120) history.cpu.shift();
      }

      if (stats.memory) {
        history.memory.push({
          usage_percent: stats.memory.usage_percent,
          timestamp: new Date().toISOString(),
        });
        if (history.memory.length > 120) history.memory.shift();
      }

      if (stats.network) {
        history.network.push({
          bytes_sent_rate: stats.network.bytes_sent_rate || 0,
          bytes_recv_rate: stats.network.bytes_recv_rate || 0,
          bytes_sent: stats.network.bytes_sent || 0,
          bytes_recv: stats.network.bytes_recv || 0,
          timestamp: new Date().toISOString(),
        });
        if (history.network.length > 120) history.network.shift();
      }

      // Update UI
      this.updateMetrics(stats);
      this.updateCharts(id, stats);
      this.updateProcesses(stats);
      this.updateLastUpdate();
    }
  }

  // Update server status indicator
  updateServerStatus(id, status, message = "") {
    const server = this.servers.find((s) => s.id === id);
    if (server) {
      server.status = status;
      if (message) {
        server.lastError = message;
      }
      server.lastSeenAt =
        status === "online" ? new Date().toISOString() : server.lastSeenAt;
      this.renderServersList();

      // Update header status if it's the current server
      if (this.currentServer && this.currentServer.id === id) {
        const statusDot = document.getElementById("statusDot");
        const statusText = document.getElementById("statusText");
        statusDot.className = "status-dot";
        if (status === "online") {
          statusDot.classList.add("alive");
          statusText.textContent = "Live";
        } else {
          statusText.textContent =
            status === "error" ? "Error" : "Disconnected";
        }
      }
    }
  }

  // Update metrics display
  updateMetrics(stats) {
    if (!stats) return;

    // CPU
    if (stats.cpu) {
      document.getElementById("cpuPercent").textContent = Math.round(
        stats.cpu.usage_percent,
      );
      document.getElementById("cpuCores").textContent = stats.cpu.core_count;
      updateGauge("cpuGauge", stats.cpu.usage_percent);
    }

    // Memory
    if (stats.memory) {
      document.getElementById("memUsed").textContent =
        stats.memory.used_gb.toFixed(1);
      document.getElementById("memTotal").textContent = (
        stats.memory.used_gb + stats.memory.available_gb
      ).toFixed(1);
      updateGauge("memoryGauge", stats.memory.usage_percent);
    }

    // Disk
    if (stats.disk) {
      document.getElementById("diskUsed").textContent =
        stats.disk.used_gb.toFixed(1);
      document.getElementById("diskTotal").textContent =
        stats.disk.total_gb.toFixed(1);
      updateGauge("diskGauge", stats.disk.usage_percent);
    }

    // Network
    let sentRate = 0;
    let recvRate = 0;

    if (stats.network) {
      if (typeof stats.network.bytes_sent_rate === "number") {
        sentRate = stats.network.bytes_sent_rate;
        recvRate = stats.network.bytes_recv_rate;
      } else if (Array.isArray(stats.network) && stats.network.length > 0) {
        sentRate = stats.network.reduce(
          (sum, iface) => sum + (iface.bytes_sent_rate || 0),
          0,
        );
        recvRate = stats.network.reduce(
          (sum, iface) => sum + (iface.bytes_recv_rate || 0),
          0,
        );
      }
    }

    sentRate = sentRate / 1024 / 1024;
    recvRate = recvRate / 1024 / 1024;

    document.getElementById("headerNetSent").textContent =
      sentRate.toFixed(2) + " MB/s";
    document.getElementById("headerNetRecv").textContent =
      recvRate.toFixed(2) + " MB/s";
  }

  // Update charts
  updateCharts(id, stats) {
    const history = this.history.get(id);
    if (!history) return;

    // Get or create charts
    if (!this.charts.has(id)) {
      this.createCharts(id);
    }

    const charts = this.charts.get(id);

    // CPU Chart
    if (history.cpu.length > 0 && charts.cpu) {
      charts.cpu.data.labels = generateLabels(history.cpu);
      charts.cpu.data.datasets[0].data = history.cpu.map((d) => d.usage);
      charts.cpu.update("none");
    }

    // Memory Chart
    if (history.memory.length > 0 && charts.memory) {
      charts.memory.data.labels = generateLabels(history.memory);
      charts.memory.data.datasets[0].data = history.memory.map(
        (d) => d.usage_percent,
      );
      charts.memory.update("none");
    }

    // Network Chart
    if (history.network.length > 0 && charts.network) {
      charts.network.data.labels = generateLabels(history.network);

      const uploadData = history.network.map((d) => {
        const rate = (d.bytes_sent_rate || 0) / 1024 / 1024;
        return Math.max(0, parseFloat(rate.toFixed(2)));
      });

      const downloadData = history.network.map((d) => {
        const rate = (d.bytes_recv_rate || 0) / 1024 / 1024;
        return Math.max(0, parseFloat(rate.toFixed(2)));
      });

      charts.network.data.datasets[0].data = uploadData;
      charts.network.data.datasets[1].data = downloadData;

      const allNetworkData = [...uploadData, ...downloadData];
      const maxNetworkValue = Math.max(...allNetworkData, 0);

      let yMax = 100;
      if (maxNetworkValue > 0) {
        yMax = Math.ceil((maxNetworkValue * 1.2) / 5) * 5;
        yMax = Math.max(yMax, 5);
      }

      charts.network.options.scales.y.max = yMax;
      charts.network.update("none");
    }
  }

  // Create charts for a server
  createCharts(id) {
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#e0e0e0",
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#e0e0e0",
          bodyColor: "#e0e0e0",
        },
      },
      scales: {
        x: {
          ticks: { color: "#9e9e9e", font: { size: 10 } },
          grid: { color: "#2a2f38", drawBorder: false },
        },
        y: {
          ticks: { color: "#9e9e9e", font: { size: 10 } },
          grid: { color: "#2a2f38", drawBorder: false },
        },
      },
    };

    const charts = {};

    // CPU Chart
    const cpuCtx = document.getElementById("cpuChart")?.getContext("2d");
    if (cpuCtx) {
      charts.cpu = new Chart(cpuCtx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "CPU Usage %",
              data: [],
              borderColor: "#0d47a1",
              backgroundColor: "rgba(13, 71, 161, 0.1)",
              borderWidth: 2,
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: {
              ...chartOptions.scales.y,
              beginAtZero: true,
              max: 100,
            },
          },
        },
      });
    }

    // Memory Chart
    const memCtx = document.getElementById("memoryChart")?.getContext("2d");
    if (memCtx) {
      charts.memory = new Chart(memCtx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Memory Usage %",
              data: [],
              borderColor: "#ff6f00",
              backgroundColor: "rgba(255, 111, 0, 0.1)",
              borderWidth: 2,
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: {
              ...chartOptions.scales.y,
              beginAtZero: true,
              max: 100,
            },
          },
        },
      });
    }

    // Network Chart
    const netCtx = document.getElementById("networkChart")?.getContext("2d");
    if (netCtx) {
      charts.network = new Chart(netCtx, {
        type: "bar",
        data: {
          labels: [],
          datasets: [
            {
              label: "Upload MB/s",
              data: [],
              backgroundColor: "#2e7d32",
              borderColor: "rgba(46, 125, 50, 0.8)",
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: "Download MB/s",
              data: [],
              backgroundColor: "#c62828",
              borderColor: "rgba(198, 40, 40, 0.8)",
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: {
              ...chartOptions.scales.y,
              beginAtZero: true,
              max: 100,
              ticks: {
                ...chartOptions.scales.y.ticks,
                callback: function (value) {
                  if (value < 1) {
                    return (value * 1024).toFixed(0) + " Kbps";
                  }
                  return value.toFixed(1) + " MB/s";
                },
              },
            },
          },
        },
      });
    }

    this.charts.set(id, charts);
  }

  // Update processes
  updateProcesses(stats) {
    if (!stats.processes) return;

    const processes = stats.processes || [];

    // CPU processes
    const cpuTable = document.querySelector("#processesCpu tbody");
    if (cpuTable) {
      cpuTable.innerHTML = "";
      processes.slice(0, 5).forEach((p) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${p.name}</td>
          <td>${p.pid}</td>
          <td>${p.cpu_percent.toFixed(1)}%</td>
          <td>${p.memory_percent.toFixed(1)}%</td>
        `;
        cpuTable.appendChild(row);
      });
    }

    // Memory processes
    const memTable = document.querySelector("#processesMemory tbody");
    if (memTable) {
      memTable.innerHTML = "";
      const memSorted = [...processes].sort(
        (a, b) => b.memory_percent - a.memory_percent,
      );
      memSorted.slice(0, 5).forEach((p) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${p.name}</td>
          <td>${p.pid}</td>
          <td>${p.memory_percent.toFixed(1)}%</td>
          <td>${p.cpu_percent.toFixed(1)}%</td>
        `;
        memTable.appendChild(row);
      });
    }
  }

  // Update last update time
  updateLastUpdate() {
    const now = new Date();
    const time = now.toLocaleTimeString();
    const footer = document.querySelector(".footer");
    if (footer) {
      footer.innerHTML = `<p>Last updated: <span id="lastUpdate">${time}</span></p>`;
    }
  }

  getFilteredServers() {
    return this.servers.filter((server) => {
      if (!this.searchQuery) return true;
      const name = server.name?.toLowerCase() || "";
      const host = this.extractHost(server.url).toLowerCase();
      const group = (server.group || "").toLowerCase();
      const tags = this.normalizeTags(server.tags).join(" ").toLowerCase();
      return (
        name.includes(this.searchQuery) ||
        host.includes(this.searchQuery) ||
        group.includes(this.searchQuery) ||
        tags.includes(this.searchQuery)
      );
    });
  }

  getServerSortValue(server) {
    const value = Number(server.sortOrder || 0);
    return Number.isFinite(value) ? value : 0;
  }

  sortServers(servers) {
    return [...servers].sort((a, b) => {
      const orderDiff = this.getServerSortValue(a) - this.getServerSortValue(b);
      if (orderDiff !== 0) return orderDiff;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  buildGroups(servers) {
    const grouping = this.groupBy || "none";
    if (grouping === "none") {
      return [{ key: "all", label: "All Servers", servers }];
    }

    const groupMap = new Map();
    const addToGroup = (key, label, server) => {
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, label, servers: [] });
      }
      groupMap.get(key).servers.push(server);
    };

    if (grouping === "status") {
      const order = ["online", "connecting", "offline"];
      const labels = {
        online: "Online",
        connecting: "Connecting",
        offline: "Offline",
      };
      order.forEach((key) =>
        groupMap.set(key, { key, label: labels[key], servers: [] }),
      );
      servers.forEach((server) => {
        const status = server.status || "offline";
        const key = order.includes(status) ? status : "offline";
        addToGroup(key, labels[key], server);
      });
      return order.map((key) => groupMap.get(key)).filter(Boolean);
    }

    if (grouping === "group") {
      servers.forEach((server) => {
        const key = this.normalizeGroup(server.group);
        addToGroup(key, key, server);
      });
      return Array.from(groupMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    }

    if (grouping === "tags") {
      const tagMap = new Map();
      servers.forEach((server) => {
        const tags = this.normalizeTags(server.tags);
        const primaryTag = tags.length ? tags[0] : "Untagged";
        const key = primaryTag;
        if (!tagMap.has(key)) {
          tagMap.set(key, { key, label: key, servers: [] });
        }
        tagMap.get(key).servers.push(server);
      });
      return Array.from(tagMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    }

    return [{ key: "all", label: "All Servers", servers }];
  }

  createServerCard(server) {
    const status = server.status || "offline";
    const item = document.createElement("div");
    item.className = `server-item ${
      this.currentServer && this.currentServer.id === server.id ? "active" : ""
    }`;
    item.dataset.id = String(server.id);

    const iconIndex = this.getIconIndex(server.id || server.name);
    const iconPath = `static/icons/server-${iconIndex}.svg`;

    const content = document.createElement("div");
    content.className = "server-item-content";
    content.innerHTML = `
        <div class="server-card-body">
          <div class="server-item-icon server-item-icon--${iconIndex}" aria-hidden="true">
            <span class="server-status-dot ${status}" aria-label="${status}"></span>
            <img class="server-item-icon-img" src="${iconPath}" alt="" />
          </div>
          <div class="server-item-text">
            <p class="server-item-name">${server.name}</p>
            <p class="server-item-ip">${this.extractHost(server.url)}</p>
          </div>
        </div>
      `;

    const actions = document.createElement("div");
    actions.className = "server-item-actions";
    actions.innerHTML = `
        <button type="button" class="server-edit-btn" title="Edit server" aria-label="Edit server">
          ✎
        </button>
      `;

    item.appendChild(content);
    item.appendChild(actions);

    item.addEventListener("click", (e) => {
      if (e.target.closest(".server-edit-btn")) return;
      this.currentServer = server;
      this.redirectToDashboard(server);
    });

    item.querySelector(".server-edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.showEditModal(server);
    });

    item.draggable = true;
    item.addEventListener("dragstart", () => {
      this.draggingId = String(server.id);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      this.draggingId = null;
      item.classList.remove("dragging");
    });

    return item;
  }

  async persistOrder(ids, groupKey) {
    const updatedServers = [];
    ids.forEach((id, index) => {
      const server = this.servers.find(
        (item) => String(item.id) === String(id),
      );
      if (!server) return;
      server.sortOrder = index + 1;

      if (this.groupBy === "group") {
        server.group = this.normalizeGroup(groupKey);
      }

      if (this.groupBy === "tags") {
        if (groupKey === "Untagged") {
          server.tags = [];
        } else {
          server.tags = [groupKey];
        }
      }

      updatedServers.push(server);
    });

    if (window.desktopAPI?.updateServerMeta) {
      await Promise.all(
        updatedServers.map((server) =>
          window.desktopAPI.updateServerMeta({
            id: server.id,
            sortOrder: server.sortOrder,
            group: server.group,
            tags: this.formatTags(server.tags),
          }),
        ),
      );
    } else {
      this.saveServers();
    }
  }

  getDragAfterElement(container, y) {
    const draggableElements = [
      ...container.querySelectorAll(".server-item:not(.dragging)"),
    ];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element;
  }

  // Render servers list
  renderServersList() {
    const list = document.getElementById("serversList");
    if (!list) return;
    list.innerHTML = "";

    this.updateMiniStats();

    const filteredServers = this.servers.filter((server) => {
      if (!this.searchQuery) return true;
      const name = server.name?.toLowerCase() || "";
      const host = this.extractHost(server.url).toLowerCase();
      return name.includes(this.searchQuery) || host.includes(this.searchQuery);
    });

    filteredServers.forEach((server) => {
      const status = server.status || "offline";
      const statusText =
        server.lastError && status !== "online"
          ? `${status} · ${server.lastError}`
          : status;
      const item = document.createElement("div");
      item.className = `server-item ${
        this.currentServer && this.currentServer.id === server.id
          ? "active"
          : ""
      }`;

      const osKey = this.detectOsKey(server);
      const iconPath = this.getOsIconPath(osKey);

      const content = document.createElement("div");
      content.className = "server-item-content";
      content.innerHTML = `
        <div class="server-card-body">
          <div class="server-item-icon server-item-icon--${osKey}" aria-hidden="true">
            <span class="server-status-dot ${status}" aria-label="${status}"></span>
            <img class="server-item-icon-img" src="${iconPath}" alt="" />
          </div>
          <div class="server-item-text">
            <p class="server-item-name">${server.name}</p>
            <p class="server-item-ip">${this.extractHost(server.url)}</p>
          </div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "server-item-actions";
      actions.innerHTML = `
        <button type="button" class="server-edit-btn" title="Edit server" aria-label="Edit server">
          ✎
        </button>
      `;

      item.appendChild(content);
      item.appendChild(actions);

      // Click to connect
      item.addEventListener("click", (e) => {
        if (e.target.closest(".server-edit-btn")) return;
        this.currentServer = server;
        this.redirectToDashboard(server);
      });

      // Edit button
      item.querySelector(".server-edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.showEditModal(server);
      });

      list.appendChild(item);
    });
  }

  updateMiniStats() {
    const totalEl = document.getElementById("serversTotal");
    const onlineEl = document.getElementById("serversOnline");
    const offlineEl = document.getElementById("serversOffline");
    if (!totalEl || !onlineEl || !offlineEl) return;

    const total = this.servers.length;
    const online = this.servers.filter((s) => s.status === "online").length;
    const offline = total - online;

    totalEl.textContent = String(total);
    onlineEl.textContent = String(online);
    offlineEl.textContent = String(offline);
  }

  async refreshServerStatuses() {
    const serversToCheck = [...this.servers];
    await Promise.all(
      serversToCheck.map(async (server) => {
        if (!server?.url) return;
        try {
          const response = await this.fetchWithTimeout(
            `${server.url}/metrics/cpu`,
            4000,
          );
          if (response.ok) {
            this.updateServerStatus(server.id, "online", "");
          } else {
            this.updateServerStatus(server.id, "offline", "");
          }
        } catch (error) {
          this.updateServerStatus(server.id, "offline", "");
        }
      }),
    );
  }

  // Render dashboard
  renderDashboard() {
    const content = document.getElementById("dashboardContent");
    if (!content) return;

    if (!this.currentServer) {
      content.innerHTML =
        '<div class="empty-state"><p>👈 Select a server to view its dashboard</p></div>';
      return;
    }
    this.redirectToDashboard(this.currentServer);
  }

  redirectToDashboard(server) {
    if (!server) return;
    try {
      sessionStorage.setItem(
        "chowkidar_selected_server",
        JSON.stringify({
          id: server.id,
          name: server.name,
          url: server.url,
          token: server.token || "",
        }),
      );
    } catch (error) {
      console.warn("Failed to store selected server", error);
    }

    const baseUrl = encodeURIComponent(server.url);
    const host = this.extractHost(server.url);
    const serverIp = document.getElementById("dashboardServerIp");
    if (serverIp) {
      serverIp.textContent = host;
    }
    window.location.href = `/?baseUrl=${baseUrl}`;
  }

  // Show add server modal
  showAddModal() {
    const modal = document.getElementById("addServerModal");
    const form = document.getElementById("addServerForm");
    form.reset();
    modal.classList.add("active");
  }

  // Show edit server modal
  showEditModal(server) {
    const modal = document.getElementById("editServerModal");
    document.getElementById("editServerNameInput").value = server.name;
    const parsed = this.parseHostPort(server.url);
    const editHostInput = document.getElementById("editServerIpInput");
    if (editHostInput) {
      editHostInput.value = parsed.host;
    }
    const editPortInput = document.getElementById("editServerPortInput");
    if (editPortInput) {
      editPortInput.value = parsed.port;
    }
    const editGroupInput = document.getElementById("editServerGroupInput");
    if (editGroupInput) {
      editGroupInput.value = server.group || "";
    }
    const editTagsInput = document.getElementById("editServerTagsInput");
    if (editTagsInput) {
      editTagsInput.value = this.formatTags(server.tags || []);
    }
    const editTokenInput = document.getElementById("editServerTokenInput");
    if (editTokenInput) {
      editTokenInput.value = server.token || "";
    }
    modal.classList.add("active");

    // Delete button
    document.getElementById("deleteServerBtn").onclick = async () => {
      if (confirm(`Delete server "${server.name}"?`)) {
        await this.deleteServer(server.id);
        modal.classList.remove("active");
      }
    };

    // Form submission
    document.getElementById("editServerForm").onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById("editServerNameInput").value;
      const host = document.getElementById("editServerIpInput").value;
      const port = document.getElementById("editServerPortInput").value;
      const url = this.buildUrlFromHostPort(host, port);
      const token =
        document.getElementById("editServerTokenInput")?.value || null;
      const group =
        document.getElementById("editServerGroupInput")?.value || "";
      const tags = document.getElementById("editServerTagsInput")?.value || "";
      this.editServer(server.id, name, url, token, group, tags);
      modal.classList.remove("active");
    };
  }

  // Initialize UI
  initializeUI() {
    const addButton = document.getElementById("btnAddServer");
    const addForm = document.getElementById("addServerForm");
    const searchInput = document.getElementById("serverSearchInput");
    const groupBySelect = document.getElementById("groupBySelect");
    const closeModal = document.getElementById("closeModal");
    const cancelModal = document.getElementById("cancelModal");
    const closeEditModal = document.getElementById("closeEditModal");
    const cancelEditModal = document.getElementById("cancelEditModal");

    if (!addButton || !addForm) {
      console.warn("Add server UI elements not found");
      return;
    }

    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        this.searchQuery = event.target.value.trim().toLowerCase();
        this.renderServersList();
      });
    }

    if (groupBySelect) {
      const savedGroupBy = localStorage.getItem("chowkidar_group_by");
      if (savedGroupBy) {
        this.groupBy = savedGroupBy;
        groupBySelect.value = savedGroupBy;
      }
      groupBySelect.addEventListener("change", (event) => {
        this.groupBy = event.target.value || "none";
        localStorage.setItem("chowkidar_group_by", this.groupBy);
        this.renderServersList();
      });
    }

    // Add server button
    addButton.addEventListener("click", () => {
      this.showAddModal();
    });

    // Add server form
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("serverNameInput").value;
      const host = document.getElementById("serverIpInput").value;
      const port = document.getElementById("serverPortInput").value;
      const url = this.buildUrlFromHostPort(host, port);
      const token = document.getElementById("serverTokenInput").value || null;
      const group = document.getElementById("serverGroupInput")?.value || "";
      const tags = document.getElementById("serverTagsInput")?.value || "";

      if (!name || !host || !port || !token) {
        alert("Please fill in all required fields");
        return;
      }

      try {
        const newId = await this.addServer(name, url, token, group, tags);
        console.log("✓ Server added:", name);

        document.getElementById("addServerModal").classList.remove("active");
        addForm.reset();

        if (newId) {
          const createdServer = this.servers.find(
            (server) => String(server.id) === String(newId),
          );
          if (createdServer?.token) {
            this.connectServer(newId)
              .then(() => {
                this.renderServersList();
              })
              .catch((err) => {
                console.error("Failed to connect to new server:", err);
              });
          } else {
            this.renderServersList();
          }
        }
      } catch (error) {
        console.error("Error adding server:", error);
        alert("Error adding server: " + error.message);
      }
    });

    // Close modals
    closeModal?.addEventListener("click", () => {
      document.getElementById("addServerModal").classList.remove("active");
    });

    closeEditModal?.addEventListener("click", () => {
      document.getElementById("editServerModal").classList.remove("active");
    });

    cancelModal?.addEventListener("click", () => {
      document.getElementById("addServerModal").classList.remove("active");
    });

    cancelEditModal?.addEventListener("click", () => {
      document.getElementById("editServerModal").classList.remove("active");
    });

    // Close modal on outside click
    window.addEventListener("click", (e) => {
      const addModal = document.getElementById("addServerModal");
      const editModal = document.getElementById("editServerModal");

      if (e.target === addModal) {
        addModal.classList.remove("active");
      }
      if (e.target === editModal) {
        editModal.classList.remove("active");
      }
    });

    // Render initial UI
    this.renderServersList();

    this.refreshServerStatuses();
    if (this.statusPoller) {
      clearInterval(this.statusPoller);
    }
    this.statusPoller = setInterval(() => {
      this.refreshServerStatuses();
    }, 15000);
  }
}

window.handleAddServerSubmit = async function handleAddServerSubmit(event) {
  event.preventDefault();
  if (!window.serverManager) {
    console.warn("Server manager not initialized");
    return false;
  }

  if (window.serverManager.isReady) {
    return false;
  }

  const name = document.getElementById("serverNameInput").value;
  const host = document.getElementById("serverIpInput").value;
  const port = document.getElementById("serverPortInput").value;
  const url = window.serverManager.buildUrlFromHostPort(host, port);
  const token = document.getElementById("serverTokenInput").value || null;
  const group = document.getElementById("serverGroupInput")?.value || "";
  const tags = document.getElementById("serverTagsInput")?.value || "";

  if (!name || !host || !port || !token) {
    alert("Please fill in all required fields");
    return false;
  }

  try {
    await window.serverManager.addServer(name, url, token, group, tags);
    document.getElementById("addServerModal").classList.remove("active");
    document.getElementById("addServerForm").reset();
    window.serverManager.renderServersList?.();
  } catch (error) {
    console.error("Error adding server:", error);
    alert("Error adding server: " + error.message);
  }

  return false;
};

// Helper functions (from dashboard.js)
function updateGauge(canvasId, percentage) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 15;

  if (typeof percentage !== "number" || isNaN(percentage)) {
    percentage = 0;
  }
  percentage = Math.max(0, Math.min(100, percentage));

  ctx.clearRect(0, 0, size, size);

  // Background circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = "#2a2f38";
  ctx.lineWidth = 10;
  ctx.stroke();

  // Percentage circle
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (percentage / 100) * 2 * Math.PI;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.strokeStyle = percentage > 80 ? "#c62828" : "#0d47a1";
  ctx.lineWidth = 10;
  ctx.stroke();

  // Text
  ctx.font = "bold 24px Arial";
  ctx.fillStyle = "#e0e0e0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.round(percentage), centerX, centerY);
}

function generateLabels(dataArray) {
  const maxLabels = 20;
  if (dataArray.length <= maxLabels) {
    return dataArray.map((_, i) => i + 1);
  }
  const step = Math.floor(dataArray.length / maxLabels);
  return dataArray.map((_, i) => (i % step === 0 ? i + 1 : ""));
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📊 Initializing Chowkidar Multi-Server Dashboard...");
  window.serverManager = new ServerManager();
  await window.serverManager.bootstrap();
});
