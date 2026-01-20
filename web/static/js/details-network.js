// Network Details Page
let networkDetailChart;

document.addEventListener("DOMContentLoaded", () => {
  initializeCharts();
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);
});

function initializeCharts() {
  // Network throughput chart
  const ctx = document.getElementById("networkDetailChart").getContext("2d");
  networkDetailChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Upload (Mbps)",
          data: [],
          borderColor: "#00bcd4",
          backgroundColor: "rgba(0, 188, 212, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#00bcd4",
          pointBorderColor: "#1a1f26",
          pointBorderWidth: 1,
        },
        {
          label: "Download (Mbps)",
          data: [],
          borderColor: "#4caf50",
          backgroundColor: "rgba(76, 175, 80, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#4caf50",
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
          ticks: { color: "#e0e0e0", font: { size: 11 } },
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
      plugins: {
        legend: {
          labels: { color: "#e0e0e0", font: { size: 12, weight: 600 } },
        },
      },
    },
  });
}

async function fetchAndUpdate() {
  try {
    const response = await fetch("/metrics/network/aggregated");
    const network = await response.json();

    // Update current metrics
    const bytesSentRate = network.bytes_sent_rate || 0;
    const bytesRecvRate = network.bytes_recv_rate || 0;
    const uploadMbps = ((bytesSentRate / 1024 / 1024) * 8).toFixed(2);
    const downloadMbps = ((bytesRecvRate / 1024 / 1024) * 8).toFixed(2);

    const bytesSent = network.bytes_sent || 0;
    const bytesRecv = network.bytes_recv || 0;
    document.getElementById("uploadRate").textContent = uploadMbps;
    document.getElementById("downloadRate").textContent = downloadMbps;
    document.getElementById("totalSent").textContent = (
      bytesSent /
      1024 /
      1024 /
      1024
    ).toFixed(2);
    document.getElementById("totalRecv").textContent = (
      bytesRecv /
      1024 /
      1024 /
      1024
    ).toFixed(2);

    // Update interfaces table
    const interfaces = network.interfaces || [];

    const tableBody = document.querySelector("#interfacesTable tbody");
    tableBody.innerHTML = interfaces
      .map(
        (iface) =>
          `
      <tr>
        <td>${iface.interface}</td>
        <td>${iface.bytes_sent || 0}</td>
        <td>${iface.bytes_recv || 0}</td>
        <td>${iface.packets_sent || 0}</td>
        <td>${iface.packets_recv || 0}</td>
      </tr>
    `
      )
      .join("");

    // Update trend chart
    const historyResponse = await fetch(
      "/metrics/history?metric=network&duration=24h"
    );
    const history = await historyResponse.json();
    const networkData = history.data || [];

    if (networkData.length > 0) {
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

      const uploadData = networkData.map((d) => {
        const rate = d.bytes_sent_rate || 0;
        return ((rate / 1024 / 1024) * 8).toFixed(2);
      });
      const downloadData = networkData.map((d) => {
        const rate = d.bytes_recv_rate || 0;
        return ((rate / 1024 / 1024) * 8).toFixed(2);
      });

      networkDetailChart.data.labels = generateLabels(networkData);
      networkDetailChart.data.datasets[0].data = uploadData;
      networkDetailChart.data.datasets[1].data = downloadData;
      networkDetailChart.update("none");
    }
  } catch (error) {
    console.error("Error fetching network data:", error);
  }
}
