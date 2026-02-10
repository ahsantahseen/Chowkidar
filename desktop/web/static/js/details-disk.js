// Disk Details Page
let diskDetailChart, diskBreakdownChart;

function getBaseUrl() {
  return window.CHOWKIDAR_BASE_URL || window.location.origin;
}

function buildUrl(path) {
  return `${getBaseUrl()}${path}`;
}

document.addEventListener("DOMContentLoaded", () => {
  initializeChart();
  fetchAndUpdate();
  updateDiskInfo();
  updateTopDirectories();
  setInterval(fetchAndUpdate, 2000);
});

function initializeChart() {
  // Disk usage trend chart
  const ctx = document.getElementById("diskDetailChart").getContext("2d");
  diskDetailChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Disk Usage %",
          data: [],
          borderColor: "#ff9800",
          backgroundColor: "rgba(255, 152, 0, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#ff9800",
          pointBorderColor: "#1a1f26",
          pointBorderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: "#e0e0e0", font: { size: 11 }, stepSize: 20 },
          grid: { color: "#2a2f38", drawBorder: false },
        },
        x: {
          ticks: {
            color: "#e0e0e0",
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
          grid: { color: "#2a2f38", drawBorder: false },
        },
      },
    },
  });

  // Disk breakdown pie chart
  const pieCtx = document.getElementById("diskBreakdownChart").getContext("2d");
  diskBreakdownChart = new Chart(pieCtx, {
    type: "doughnut",
    data: {
      labels: ["Used", "Free"],
      datasets: [
        {
          data: [0, 100],
          backgroundColor: ["#d32f2f", "#2a2f38"],
          borderColor: "#1a1f26",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#e0e0e0", font: { size: 12, weight: 600 } },
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#e0e0e0",
          bodyColor: "#e0e0e0",
          padding: 12,
          callbacks: {
            label: (context) => {
              const label = context.label || "";
              const value = context.parsed || 0;
              return `${label}: ${value.toFixed(1)} GB`;
            },
          },
        },
      },
    },
  });
}

async function fetchAndUpdate() {
  try {
    const response = await window.authFetch(buildUrl("/metrics/disk"));
    const disk = await response.json();

    const diskPercent = Math.max(
      0,
      Math.min(100, disk.usage_percent || 0),
    ).toFixed(1);

    document.getElementById("diskUsage").textContent = diskPercent;
    document.getElementById("diskProgressBar").style.width = diskPercent + "%";
    document.getElementById("diskUsed").textContent = (
      disk.used_gb || 0
    ).toFixed(1);
    document.getElementById("diskAvailable").textContent = (
      disk.free_gb || 0
    ).toFixed(1);
    document.getElementById("diskTotal").textContent = (
      disk.total_gb || 0
    ).toFixed(1);

    // Update breakdown chart
    diskBreakdownChart.data.datasets[0].data = [
      disk.used_gb.toFixed(1),
      disk.free_gb.toFixed(1),
    ];
    diskBreakdownChart.update("none");

    // Update trend chart
    const historyResponse = await window.authFetch(
      buildUrl("/metrics/history?metric=disk&duration=24h"),
    );
    const history = await historyResponse.json();
    const diskData = history.data || [];

    if (diskData.length > 0) {
      const generateLabels = (data) => {
        return data.map((item, i) => {
          if (i % Math.ceil(data.length / 8) === 0) {
            const date = new Date(item.timestamp);
            if (isNaN(date.getTime())) {
              return "";
            }
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            return `${hours}:${minutes}`;
          }
          return "";
        });
      };

      diskDetailChart.data.labels = generateLabels(diskData);
      diskDetailChart.data.datasets[0].data = diskData.map(
        (d) => d.usage_percent,
      );
      diskDetailChart.update("none");
    }
  } catch (error) {
    console.error("Error fetching disk data:", error);
  }
}

// Update disk info (df -h style)
async function updateDiskInfo() {
  try {
    const response = await window.authFetch(buildUrl("/dashboard"));
    const dashboardData = await response.json();

    if (!dashboardData || !dashboardData.disk_partitions) {
      return;
    }

    const diskList = document.getElementById("diskList");
    if (!diskList) return;

    // Filter to main partitions only (not system/dev/mounts)
    const mainPartitions = dashboardData.disk_partitions.filter((disk) => {
      const path = disk.path;
      // Include only main mount points
      return (
        path === "/" || path.startsWith("/Volumes") || path.startsWith("/mnt")
      );
    });

    diskList.innerHTML = mainPartitions
      .map(
        (disk) => `
      <div class="disk-item">
        <div class="disk-item-header">
          <span class="disk-item-path">${disk.path}</span>
          <span class="disk-item-percent">${disk.usage_percent.toFixed(1)}%</span>
        </div>
        <div class="disk-item-sizes">
          <span>${disk.used_gb.toFixed(1)} GB / ${disk.total_gb.toFixed(1)} GB</span>
        </div>
        <div class="disk-item-bar">
          <div class="disk-item-fill" style="width: ${disk.usage_percent}%"></div>
        </div>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("Error updating disk info:", error);
  }
}

// Update top directories listing
async function updateTopDirectories() {
  try {
    const response = await window.authFetch(buildUrl("/dashboard"));
    const dashboardData = await response.json();

    if (!dashboardData || !dashboardData.top_directories) {
      return;
    }

    const topDirsList = document.getElementById("topDirsList");
    if (!topDirsList) return;

    topDirsList.innerHTML = dashboardData.top_directories
      .map(
        (dir, index) => `
      <div class="dir-item">
        <div class="dir-item-header">
          <span class="dir-item-rank">#${index + 1}</span>
          <span class="dir-item-name">${getDirectoryName(dir.path)}</span>
        </div>
        <div class="dir-item-size">${dir.size}</div>
        <div class="dir-item-path">${dir.path}</div>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("Error updating top directories:", error);
  }
}

// Helper function to get directory name from path
function getDirectoryName(path) {
  if (path === "/") return "Root";
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
