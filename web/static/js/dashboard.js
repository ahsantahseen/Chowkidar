// Chart instances
let cpuChart, memoryChart, networkChart, diskChart;
let cpuGaugeCtx, memoryGaugeCtx, diskGaugeCtx;

// Data storage
let dashboardData = null;
let lastUpdateTime = null;

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

// Initialize dashboard
document.addEventListener("DOMContentLoaded", () => {
  initializeCharts();
  fetchDashboardData();

  // Refresh every second
  setInterval(fetchDashboardData, 1000);
});

// Fetch dashboard data
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

  // Network
  const sentRate = (current.network.bytes_sent_rate / 1024 / 1024).toFixed(2);
  const recvRate = (current.network.bytes_recv_rate / 1024 / 1024).toFixed(2);
  document.getElementById("netSent").textContent = sentRate + " MB/s";
  document.getElementById("netRecv").textContent = recvRate + " MB/s";
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
    radius + 5
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
    centerY + Math.sin(endAngle) * radius
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
          title: (context) => new Date(context[0].label).toLocaleTimeString(),
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

  // Network Chart with dynamic Y-axis
  const netCtx = document.getElementById("networkChart").getContext("2d");
  networkChart = new Chart(netCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Upload MB/s",
          data: [],
          borderColor: colors.success,
          backgroundColor: "rgba(46, 125, 50, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: colors.success,
          pointBorderColor: colors.bg,
          pointBorderWidth: 2,
          pointHoverRadius: 5,
        },
        {
          label: "Download MB/s",
          data: [],
          borderColor: colors.danger,
          backgroundColor: "rgba(198, 40, 40, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: colors.danger,
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
        y: {
          beginAtZero: true,
          // Dynamic max based on data - will be calculated in updateCharts
          max: 100,
          ticks: {
            color: colors.text,
            font: { size: 11 },
            callback: function (value) {
              return value.toFixed(1);
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

  // Disk Chart (Pie)
  const diskCtx = document.getElementById("diskChart").getContext("2d");
  diskChart = new Chart(diskCtx, {
    type: "doughnut",
    data: {
      labels: ["Used", "Available"],
      datasets: [
        {
          data: [0, 100],
          backgroundColor: [colors.primary, colors.border],
          borderColor: "#1a1f26",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: colors.text } } },
    },
  });
}

// Update line charts with detailed formatting
function updateCharts() {
  if (!dashboardData || !dashboardData.history) return;

  const { cpu, memory, network } = dashboardData.history;

  // Use more data points for better trends (limit to 120)
  const limit = 120;
  const cpuData = cpu.slice(-limit);
  const memoryData = memory.slice(-limit);
  const networkData = network.slice(-limit);

  // Generate time labels (show every 10th label to avoid crowding)
  const generateLabels = (data) => {
    return data.map((item, i) => {
      if (i % 10 === 0) {
        const date = new Date(item.timestamp);
        return date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      }
      return "";
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
  if (networkData.length > 0) {
    networkChart.data.labels = generateLabels(networkData);

    const uploadData = networkData.map((d) => {
      const rate = d.bytes_sent_rate / 1024 / 1024;
      return Math.max(0, parseFloat(rate.toFixed(2)));
    });

    const downloadData = networkData.map((d) => {
      const rate = d.bytes_recv_rate / 1024 / 1024;
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

  // Disk Chart
  const { current } = dashboardData;
  const diskUsedPercent = parseFloat(current.disk.usage_percent.toFixed(1));
  const diskAvailPercent = parseFloat(
    (100 - current.disk.usage_percent).toFixed(1)
  );
  diskChart.data.datasets[0].data = [diskUsedPercent, diskAvailPercent];
  diskChart.update("none");
}

// Update process tables
function updateProcesses() {
  if (!dashboardData || !dashboardData.current.top_processes) return;

  const processes = dashboardData.current.top_processes;

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
              1
            )}%</span></td>
            <td>${p.mem_percent.toFixed(1)}%</td>
        </tr>
    `
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
              1
            )}%</span></td>
            <td>${p.cpu_percent.toFixed(1)}%</td>
        </tr>
    `
    )
    .join("");
}

// Update last update timestamp
function updateLastUpdate() {
  if (dashboardData && dashboardData.timestamp) {
    const date = new Date(dashboardData.timestamp);
    const timeString = date.toLocaleTimeString();
    document.getElementById("lastUpdate").textContent = timeString;
  }
}
