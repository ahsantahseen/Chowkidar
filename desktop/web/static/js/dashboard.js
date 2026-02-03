// Chart instances
let cpuChart, memoryChart, networkChart;
let cpuGaugeCtx, memoryGaugeCtx, diskGaugeCtx;

// Data storage
let dashboardData = null;
let lastUpdateTime = null;

// History arrays for charts (accumulated from WebSocket)
let cpuHistory = [];
let memoryHistory = [];
let networkHistory = [];
const maxHistorySize = 120; // Keep 120 seconds of history (at 1 update/sec)

// Color scheme
const colors = {
  primary: "#0d47a1",
  accent: "#ff6f00",
  success: "#2e7d32",
  warning: "#f57f17",
  danger: "#c62828",
  border: "#2a2f38",
  text: "#e0e0e0",
};

function getSelectedServerHost() {
  try {
    const stored = sessionStorage.getItem("chowkidar_selected_server");
    if (!stored) return "";
    const selected = JSON.parse(stored);
    if (!selected || !selected.url) return "";
    const parsed = new URL(selected.url);
    return parsed.hostname || parsed.host || "";
  } catch (error) {
    return "";
  }
}

// Initialize dashboard
document.addEventListener("DOMContentLoaded", () => {
  console.log("📊 Initializing Chowkidar Dashboard...");

  const serverIpLabel = document.getElementById("dashboardServerIp");
  if (serverIpLabel) {
    const host = getSelectedServerHost();
    serverIpLabel.textContent = host;
  }

  initializeCharts();

  // Initialize WebSocket client for real-time updates
  if (window.initializeWebSocketClient) {
    wsClient = initializeWebSocketClient();

    if (wsClient) {
      // Register handler for real-time stats
      wsClient.onStats((stats) => {
        dashboardData = {
          current: stats,
          history: {
            cpu: cpuHistory,
            memory: memoryHistory,
            network: networkHistory,
          },
        };

        // Accumulate history from WebSocket stats
        if (stats.cpu) {
          cpuHistory.push({
            usage: stats.cpu.usage_percent, // Store as 'usage' for chart compatibility
            timestamp: new Date().toISOString(),
          });
          // Keep only last 120 data points
          if (cpuHistory.length > maxHistorySize) {
            cpuHistory.shift();
          }
        }

        if (stats.memory) {
          memoryHistory.push({
            usage_percent: stats.memory.usage_percent,
            timestamp: new Date().toISOString(),
          });
          if (memoryHistory.length > maxHistorySize) {
            memoryHistory.shift();
          }
        }

        if (stats.network) {
          // Store network data with rates (aggregated from all interfaces)
          const networkData = {
            bytes_sent_rate: stats.network.bytes_sent_rate || 0,
            bytes_recv_rate: stats.network.bytes_recv_rate || 0,
            bytes_sent: stats.network.bytes_sent || 0,
            bytes_recv: stats.network.bytes_recv || 0,
            timestamp: new Date().toISOString(),
          };
          networkHistory.push(networkData);
          if (networkHistory.length > maxHistorySize) {
            networkHistory.shift();
          }
        }

        updateMetrics();
        updateCharts();
        updateProcesses();
        updateLastUpdate();
      });

      // Register connection status callback
      wsClient.onConnectionStatusChange((status) => {
        console.log(`Connection status: ${status}`);
      });
    }
  } else {
    console.warn(
      "⚠️ WebSocket client not available, falling back to HTTP polling",
    );
    // Fallback to HTTP polling if WebSocket fails
    fetchDashboardData();
    setInterval(fetchDashboardData, 10000);
  }
});

// Fetch dashboard data (fallback for HTTP polling)
async function fetchDashboardData() {
  try {
    const response = await fetch("/dashboard");
    dashboardData = await response.json();

    if (dashboardData) {
      updateMetrics();
      updateCharts();
      updateProcesses();
      updateLastUpdate();
    }
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
  }
}

// Update metric cards
function updateMetrics() {
  const { current } = dashboardData;

  // CPU
  document.getElementById("cpuPercent").textContent =
    current.cpu.usage_percent.toFixed(1);
  document.getElementById("cpuCores").textContent = current.cpu.core_count;
  updateGauge("cpuGauge", current.cpu.usage_percent);

  // Memory
  const memPercent =
    (current.memory.used_gb /
      (current.memory.used_gb + current.memory.available_gb)) *
    100;
  document.getElementById("memUsed").textContent =
    current.memory.used_gb.toFixed(1);
  document.getElementById("memTotal").textContent = (
    current.memory.used_gb + current.memory.available_gb
  ).toFixed(1);
  updateGauge("memoryGauge", current.memory.usage_percent);

  // Disk
  document.getElementById("diskUsed").textContent =
    current.disk.used_gb.toFixed(1);
  document.getElementById("diskTotal").textContent =
    current.disk.total_gb.toFixed(1);
  updateGauge("diskGauge", current.disk.usage_percent);

  // Network - handle both aggregated (HTTP) and individual interface (WebSocket) data
  let sentRate = 0;
  let recvRate = 0;

  if (current.network) {
    // If network is an object with rates (aggregated/HTTP data)
    if (typeof current.network.bytes_sent_rate === "number") {
      sentRate = current.network.bytes_sent_rate;
      recvRate = current.network.bytes_recv_rate;
    }
    // If network is an array (raw WebSocket data), sum the rates
    else if (Array.isArray(current.network) && current.network.length > 0) {
      sentRate = current.network.reduce(
        (sum, iface) => sum + (iface.bytes_sent_rate || 0),
        0,
      );
      recvRate = current.network.reduce(
        (sum, iface) => sum + (iface.bytes_recv_rate || 0),
        0,
      );
    }
  }

  sentRate = sentRate / 1024 / 1024; // Convert to MB/s
  recvRate = recvRate / 1024 / 1024;

  document.getElementById("headerNetSent").textContent =
    sentRate.toFixed(2) + " MB/s";
  document.getElementById("headerNetRecv").textContent =
    recvRate.toFixed(2) + " MB/s";
}

// Create and update gauges with smooth animation
function updateGauge(canvasId, percentage) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 15;

  // Sanitize percentage - handle NaN, undefined, null
  if (typeof percentage !== "number" || isNaN(percentage)) {
    percentage = 0;
  }
  percentage = Math.max(0, Math.min(100, percentage));

  // Clear canvas with transparency
  ctx.clearRect(0, 0, size, size);

  // Draw outer glow effect
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    radius - 2,
    centerX,
    centerY,
    radius + 5,
  );
  gradient.addColorStop(0, "rgba(13, 71, 161, 0.1)");
  gradient.addColorStop(1, "rgba(13, 71, 161, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Draw background circle (full arc)
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.stroke();

  // Determine color based on percentage
  let gaugeColor = colors.success;
  if (percentage > 80) gaugeColor = colors.danger;
  else if (percentage > 60) gaugeColor = colors.warning;
  else if (percentage > 40) gaugeColor = colors.accent;

  // Draw progress arc with gradient
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (percentage / 100) * 2 * Math.PI;

  const arcGradient = ctx.createLinearGradient(
    centerX + Math.cos(startAngle) * radius,
    centerY + Math.sin(startAngle) * radius,
    centerX + Math.cos(endAngle) * radius,
    centerY + Math.sin(endAngle) * radius,
  );
  arcGradient.addColorStop(0, gaugeColor);
  arcGradient.addColorStop(1, gaugeColor + "CC");

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.strokeStyle = arcGradient;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.stroke();

  // Draw inner circle for 3D effect
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 12, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(26, 31, 38, 0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw percentage text
  ctx.fillStyle = gaugeColor;
  ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(percentage.toFixed(1), centerX, centerY);
}

// Initialize line charts with improved styling
function initializeCharts() {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: colors.text,
          font: { size: 12, weight: 600 },
          padding: 15,
          usePointStyle: true,
        },
        display: true,
        position: "top",
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 12 },
        callbacks: {
          title: (context) => {
            // Format tooltip title with consistent date format
            const dateStr = context[0].label;
            if (!dateStr) return "";
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const seconds = String(date.getSeconds()).padStart(2, "0");
            return `${hours}:${minutes}:${seconds}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: colors.text,
          font: { size: 11 },
          stepSize: 20,
        },
        grid: {
          color: colors.border,
          drawBorder: false,
        },
      },
      x: {
        ticks: {
          color: colors.text,
          font: { size: 11 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
        grid: {
          color: colors.border,
          drawBorder: false,
        },
      },
    },
  };

  // CPU Chart
  const cpuCtx = document.getElementById("cpuChart").getContext("2d");
  cpuChart = new Chart(cpuCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "CPU %",
          data: [],
          borderColor: colors.primary,
          backgroundColor: "rgba(13, 71, 161, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: colors.primary,
          pointBorderColor: colors.bg,
          pointBorderWidth: 2,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: { ...chartOptions.scales.y, max: 100 },
      },
    },
  });

  // Memory Chart
  const memCtx = document.getElementById("memoryChart").getContext("2d");
  memoryChart = new Chart(memCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Memory %",
          data: [],
          borderColor: colors.accent,
          backgroundColor: "rgba(255, 111, 0, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: colors.accent,
          pointBorderColor: colors.bg,
          pointBorderWidth: 2,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: { ...chartOptions.scales.y, max: 100 },
      },
    },
  });

  // Network Chart with dynamic Y-axis - BAR CHART
  const netCtx = document.getElementById("networkChart").getContext("2d");
  networkChart = new Chart(netCtx, {
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
      indexAxis: undefined, // Vertical bars
      scales: {
        ...chartOptions.scales,
        y: {
          beginAtZero: true,
          // Dynamic max based on data - will be calculated in updateCharts
          max: 100,
          ticks: {
            color: colors.text,
            font: { size: 11 },
            callback: function (value) {
              // Show Kbps for values < 1 MB/s, otherwise MB/s
              if (value < 1) {
                return (value * 1024).toFixed(0) + " Kbps";
              }
              return value.toFixed(1) + " MB/s";
            },
          },
          grid: {
            color: colors.border,
            drawBorder: false,
          },
        },
      },
    },
  });
}

// Update line charts with detailed formatting
function updateCharts() {
  if (!dashboardData || !dashboardData.history) {
    console.debug("No dashboard data or history available yet");
    return;
  }

  const { cpu, memory, network } = dashboardData.history;

  // Return early if not enough data
  if (!cpu || !Array.isArray(cpu) || cpu.length === 0) {
    console.debug("CPU history not available", { cpu });
    return;
  }
  if (!memory || !Array.isArray(memory) || memory.length === 0) {
    console.debug("Memory history not available", { memory });
    return;
  }
  if (!network || !Array.isArray(network) || network.length === 0) {
    console.debug("Network history not available", { network });
    return;
  }

  // Show only latest 20 data points on charts
  const limit = 20;
  const cpuData = cpu.slice(-limit);
  const memoryData = memory.slice(-limit);
  const networkData = network.slice(-limit);

  // Generate time labels (show every label for clarity with limited data)
  const generateLabels = (data) => {
    return data.map((item) => {
      const date = new Date(item.timestamp);
      if (isNaN(date.getTime())) {
        return "";
      }
      // Format as HH:MM:SS (24-hour format)
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    });
  };

  // CPU Chart
  if (cpuData.length > 0) {
    cpuChart.data.labels = generateLabels(cpuData);
    cpuChart.data.datasets[0].data = cpuData.map((d) => d.usage);
    cpuChart.update("none");
  }

  // Memory Chart
  if (memoryData.length > 0) {
    memoryChart.data.labels = generateLabels(memoryData);
    memoryChart.data.datasets[0].data = memoryData.map((d) => d.usage_percent);
    memoryChart.update("none");
  }

  // Network Chart (with rate data and dynamic scaling)
  if (networkData.length > 0 && Array.isArray(networkData)) {
    networkChart.data.labels = generateLabels(networkData);

    const uploadData = networkData.map((d) => {
      const rate = (d.bytes_sent_rate || 0) / 1024 / 1024;
      return Math.max(0, parseFloat(rate.toFixed(2)));
    });

    const downloadData = networkData.map((d) => {
      const rate = (d.bytes_recv_rate || 0) / 1024 / 1024;
      return Math.max(0, parseFloat(rate.toFixed(2)));
    });

    networkChart.data.datasets[0].data = uploadData;
    networkChart.data.datasets[1].data = downloadData;

    // Calculate dynamic Y-axis max based on actual data
    const allNetworkData = [...uploadData, ...downloadData];
    const maxNetworkValue = Math.max(...allNetworkData, 0);

    // Set a reasonable upper limit with some padding
    let yMax = 100;
    if (maxNetworkValue > 0) {
      // Round up to nearest 5 or 10
      yMax = Math.ceil((maxNetworkValue * 1.2) / 5) * 5;
      yMax = Math.max(yMax, 5); // Minimum scale of 5 MB/s
    }

    networkChart.options.scales.y.max = yMax;
    networkChart.update("none");
  }
}

// Update process tables
function updateProcesses() {
  if (!dashboardData || !dashboardData.current) return;

  // Get processes - handle both top_processes (HTTP) and processes (WebSocket)
  let processes =
    dashboardData.current.top_processes || dashboardData.current.processes;

  if (!processes || !Array.isArray(processes)) {
    console.debug("No processes data available");
    return;
  }

  // Sort by CPU
  const byCpu = [...processes]
    .sort((a, b) => b.cpu_percent - a.cpu_percent)
    .slice(0, 5);
  // Sort by Memory
  const byMemory = [...processes]
    .sort((a, b) => b.mem_percent - a.mem_percent)
    .slice(0, 5);

  // CPU Table
  const cpuTableBody = document.querySelector("#processesCpu tbody");
  cpuTableBody.innerHTML = byCpu
    .map(
      (p) => `
        <tr>
            <td>${p.name}</td>
            <td>${p.pid}</td>
            <td><span style="color: var(--primary)">${p.cpu_percent.toFixed(
              1,
            )}%</span></td>
            <td>${p.mem_percent.toFixed(1)}%</td>
        </tr>
    `,
    )
    .join("");

  // Memory Table
  const memTableBody = document.querySelector("#processesMemory tbody");
  memTableBody.innerHTML = byMemory
    .map(
      (p) => `
        <tr>
            <td>${p.name}</td>
            <td>${p.pid}</td>
            <td><span style="color: var(--primary)">${p.mem_percent.toFixed(
              1,
            )}%</span></td>
            <td>${p.cpu_percent.toFixed(1)}%</td>
        </tr>
    `,
    )
    .join("");
}

function updateLastUpdate() {
  if (dashboardData && dashboardData.timestamp) {
    const date = new Date(dashboardData.timestamp);
    if (isNaN(date.getTime())) {
      document.getElementById("lastUpdate").textContent = "--";
      return;
    }
    // Format as HH:MM:SS (24-hour format)
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const timeString = `${hours}:${minutes}:${seconds}`;
    document.getElementById("lastUpdate").textContent = timeString;
  }
}
