// Disk Details Page
let diskDetailChart, diskBreakdownChart;

document.addEventListener("DOMContentLoaded", () => {
  initializeCharts();
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);
});

function initializeCharts() {
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
    const response = await fetch("/metrics/disk");
    const disk = await response.json();

    const diskPercent = Math.max(
      0,
      Math.min(100, disk.usage_percent || 0)
    ).toFixed(1);

    document.getElementById("diskUsage").textContent = diskPercent;
    document.getElementById("diskProgressBar").style.width = diskPercent + "%";
    document.getElementById("diskUsed").textContent = (
      disk.used_gb || 0
    ).toFixed(1);
    document.getElementById("diskFree").textContent = (
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

    // Update partitions table
    const partitions = disk.partitions || [];
    const tableBody = document.querySelector("#partitionsTable tbody");
    tableBody.innerHTML = partitions
      .map(
        (p) =>
          `
      <tr>
        <td>${p.device}</td>
        <td>${p.mountpoint}</td>
        <td>${p.used_gb.toFixed(1)} GB</td>
        <td>${p.free_gb.toFixed(1)} GB</td>
        <td>${p.usage_percent.toFixed(1)}%</td>
      </tr>
    `
      )
      .join("");

    // Update trend chart
    const historyResponse = await fetch(
      "/metrics/history?metric=disk&duration=24h"
    );
    const history = await historyResponse.json();
    const diskData = history.data || [];

    if (diskData.length > 0) {
      const generateLabels = (data) => {
        return data.map((item, i) => {
          if (i % Math.ceil(data.length / 8) === 0) {
            const date = new Date(item.timestamp);
            return date.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
          }
          return "";
        });
      };

      diskDetailChart.data.labels = generateLabels(diskData);
      diskDetailChart.data.datasets[0].data = diskData.map(
        (d) => d.usage_percent
      );
      diskDetailChart.update("none");
    }
  } catch (error) {
    console.error("Error fetching disk data:", error);
  }
}
