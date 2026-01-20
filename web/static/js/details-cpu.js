// CPU Details Page
let cpuDetailChart;

document.addEventListener("DOMContentLoaded", () => {
  initializeChart();
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);
});

function initializeChart() {
  const ctx = document.getElementById("cpuDetailChart").getContext("2d");
  cpuDetailChart = new Chart(ctx, {
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
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#0d47a1",
          pointBorderColor: "#1a1f26",
          pointBorderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#e0e0e0", font: { size: 12, weight: 600 } },
          display: true,
          position: "top",
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#e0e0e0",
          bodyColor: "#e0e0e0",
          borderColor: "#2a2f38",
          borderWidth: 1,
          padding: 12,
          titleFont: { size: 13, weight: 600 },
          bodyFont: { size: 12 },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: "#e0e0e0",
            font: { size: 11 },
            stepSize: 20,
          },
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
}

async function fetchAndUpdate() {
  try {
    const response = await fetch("/metrics/cpu");
    const cpu = await response.json();

    const cpuUsage = Math.max(0, Math.min(100, cpu.usage_percent || 0));
    document.getElementById("cpuUsage").textContent = cpuUsage.toFixed(1);
    document.getElementById("cpuCoreCount").textContent = cpu.core_count || 0;
    document.getElementById("cpuProgressBar").style.width = cpuUsage + "%";

    // Per-core usage
    const coresGrid = document.getElementById("coresGrid");
    if (cpu.per_core && cpu.per_core.length > 0) {
      coresGrid.innerHTML = cpu.per_core
        .map(
          (core, i) =>
            `
        <div class="core-item">
          <div class="label">Core ${i}</div>
          <div class="value">${core.toFixed(1)}</div>
        </div>
      `
        )
        .join("");
    }

    // Update top processes
    const dashboardResponse = await fetch("/dashboard");
    const dashboard = await dashboardResponse.json();
    const topProcesses = dashboard.current.top_processes.slice(0, 10);

    const tableBody = document.querySelector("#topProcessesTable");
    tableBody.innerHTML = topProcesses
      .map(
        (p) =>
          `
      <tr>
        <td>${p.name}</td>
        <td>${p.pid}</td>
        <td>${p.cpu_percent.toFixed(1)}</td>
        <td>${p.mem_percent.toFixed(1)}</td>
      </tr>
    `
      )
      .join("");

    // Update trend chart
    const historyResponse = await fetch(
      "/metrics/history?metric=cpu&duration=24h"
    );
    const history = await historyResponse.json();
    const cpuData = history.data || [];

    if (cpuData.length > 0) {
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

      cpuDetailChart.data.labels = generateLabels(cpuData);
      cpuDetailChart.data.datasets[0].data = cpuData.map((d) => d.usage);
      cpuDetailChart.update("none");
    }
  } catch (error) {
    console.error("Error fetching CPU data:", error);
  }
}
