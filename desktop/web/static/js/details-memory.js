// Memory Details Page
let memoryDetailChart, memoryBreakdownChart;

function getBaseUrl() {
  return window.CHOWKIDAR_BASE_URL || window.location.origin;
}

function buildUrl(path) {
  return `${getBaseUrl()}${path}`;
}

document.addEventListener("DOMContentLoaded", () => {
  initializeChart();
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 2000);
});

function initializeChart() {
  // Memory trend chart
  const ctx = document.getElementById("memoryDetailChart").getContext("2d");
  memoryDetailChart = new Chart(ctx, {
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
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#ff6f00",
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

  // Memory breakdown pie chart
  const pieCtx = document
    .getElementById("memoryBreakdownChart")
    .getContext("2d");
  memoryBreakdownChart = new Chart(pieCtx, {
    type: "doughnut",
    data: {
      labels: ["Used", "Available"],
      datasets: [
        {
          data: [0, 100],
          backgroundColor: ["#0d47a1", "#2a2f38"],
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
    const response = await fetch(buildUrl("/metrics/memory"));
    const memory = await response.json();

    const usedGb = memory.used_gb || 0;
    const availGb = memory.available_gb || 0;
    const totalGb = usedGb + availGb || 1;
    const memPercent = Math.max(
      0,
      Math.min(100, (usedGb / totalGb) * 100),
    ).toFixed(1);

    document.getElementById("memUsage").textContent = memPercent;
    document.getElementById("memProgressBar").style.width = memPercent + "%";
    document.getElementById("memUsed").textContent = usedGb.toFixed(1) + " GB";
    document.getElementById("memAvailable").textContent =
      availGb.toFixed(1) + " GB";
    document.getElementById("memTotal").textContent = totalGb.toFixed(1);

    // Update breakdown chart
    memoryBreakdownChart.data.datasets[0].data = [
      memory.used_gb.toFixed(1),
      memory.available_gb.toFixed(1),
    ];
    memoryBreakdownChart.update("none");

    // Update top processes
    const dashboardResponse = await fetch(buildUrl("/dashboard"));
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
        <td>${p.mem_percent.toFixed(1)}</td>
        <td>${p.cpu_percent.toFixed(1)}</td>
      </tr>
    `,
      )
      .join("");

    // Update trend chart
    const historyResponse = await fetch(
      buildUrl("/metrics/history?metric=memory&duration=24h"),
    );
    const history = await historyResponse.json();
    const memoryData = history.data || [];

    if (memoryData.length > 0) {
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

      memoryDetailChart.data.labels = generateLabels(memoryData);
      memoryDetailChart.data.datasets[0].data = memoryData.map(
        (d) => d.usage_percent,
      );
      memoryDetailChart.update("none");
    }
  } catch (error) {
    console.error("Error fetching memory data:", error);
  }
}
