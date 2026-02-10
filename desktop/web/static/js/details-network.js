// Network Details Page
let networkDetailChart;
let interfacesTable;

function getBaseUrl() {
  return window.CHOWKIDAR_BASE_URL || window.location.origin;
}

function buildUrl(path) {
  return `${getBaseUrl()}${path}`;
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing charts...");
  initializeCharts();
  initializeDataTable();
  console.log(
    "Chart object:",
    networkDetailChart ? "✅ Created" : "❌ Not created",
  );
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 2000);
});

function initializeCharts() {
  // Network throughput bar chart - clean design
  const ctx = document.getElementById("networkDetailChart").getContext("2d");
  networkDetailChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Upload",
          data: [],
          backgroundColor: "#ff4444",
          borderColor: "rgba(255, 68, 68, 0.8)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Download",
          data: [],
          backgroundColor: "#44ff44",
          borderColor: "rgba(68, 255, 68, 0.8)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: "#e0e0e0",
            font: { size: 11 },
            callback: function (value) {
              // Show Kbps for values < 1 Mbps, otherwise Mbps
              if (value < 1) {
                return (value * 1024).toFixed(0) + " Kbps";
              }
              return value.toFixed(1) + " Mbps";
            },
          },
          grid: {
            color: "#2a2f38",
            drawBorder: false,
            lineWidth: 0.5,
          },
        },
        x: {
          ticks: {
            color: "#e0e0e0",
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
          grid: {
            color: "#2a2f38",
            drawBorder: false,
            lineWidth: 0.5,
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: "#e0e0e0",
            font: { size: 12, weight: 500 },
            padding: 20,
            usePointStyle: true,
            pointStyle: "circle",
          },
          align: "top",
        },
        tooltip: {
          backgroundColor: "rgba(26, 31, 38, 0.9)",
          borderColor: "#2a2f38",
          borderWidth: 1,
          titleColor: "#e0e0e0",
          bodyColor: "#e0e0e0",
          padding: 10,
          displayColors: true,
          callbacks: {
            label: function (context) {
              const value = context.parsed.y;
              const unit = value < 1 ? "Kbps" : "Mbps";
              const displayValue =
                value < 1 ? (value * 1024).toFixed(0) : value.toFixed(2);
              return context.dataset.label + ": " + displayValue + " " + unit;
            },
          },
        },
      },
    },
  });
}

function initializeDataTable() {
  interfacesTable = $("#interfacesTable").DataTable({
    destroy: true,
    paging: true,
    pageLength: 10,
    searching: true,
    ordering: true,
    order: [[1, "desc"]],
    orderClasses: false,
    columnDefs: [{ targets: [1, 2, 3, 4, 5], type: "num" }],
    language: {
      search: "Search interfaces:",
      paginate: { previous: "Previous", next: "Next" },
      info: "Showing _START_ to _END_ of _TOTAL_ interfaces",
    },
    dom: '<"top"f>rt<"bottom"lp><"clear">',
    initComplete: function () {
      // Style search box and controls
      $("#interfacesTable_filter input").css({
        "background-color": "#1a1f26",
        color: "#e0e0e0",
        border: "1px solid #2a2f38",
        padding: "5px 10px",
        "border-radius": "4px",
      });
      $("#interfacesTable_filter label").css({
        color: "#e0e0e0",
        "font-size": "13px",
      });
      $("#interfacesTable_length select").css({
        "background-color": "#1a1f26",
        color: "#e0e0e0",
        border: "1px solid #2a2f38",
        padding: "3px 5px",
        "border-radius": "4px",
      });
      $(".dataTables_info").css({
        color: "#a0a0a0",
        "font-size": "12px",
      });
      $(".paginate_button").css({
        color: "#e0e0e0",
      });
    },
  });
}

async function fetchAndUpdate() {
  try {
    const response = await window.authFetch(
      buildUrl("/metrics/network/aggregated"),
    );
    const network = await response.json();

    // Update current metrics
    const bytesSentRate = network.bytes_sent_rate || 0;
    const bytesRecvRate = network.bytes_recv_rate || 0;
    const uploadMbps = ((bytesSentRate / 1024 / 1024) * 8).toFixed(2);
    const downloadMbps = ((bytesRecvRate / 1024 / 1024) * 8).toFixed(2);

    // Update spinner values and percentages
    // Cap at 100 Mbps for visual scaling (adjust as needed)
    const maxMbps = 100;
    const uploadPercentage = Math.min(
      (parseFloat(uploadMbps) / maxMbps) * 100,
      100,
    );
    const downloadPercentage = Math.min(
      (parseFloat(downloadMbps) / maxMbps) * 100,
      100,
    );

    document.getElementById("uploadRate").textContent = `${uploadMbps} MB/s`;
    document.getElementById("downloadRate").textContent =
      `${downloadMbps} MB/s`;

    // Update spinner percentages
    document
      .getElementById("uploadSpinner")
      .style.setProperty("--percentage", uploadPercentage);
    document
      .getElementById("downloadSpinner")
      .style.setProperty("--percentage", downloadPercentage);

    const bytesSent = network.bytes_sent || 0;
    const bytesRecv = network.bytes_recv || 0;
    document.getElementById("totalSent").textContent =
      (bytesSent / 1024 / 1024 / 1024).toFixed(2) + " GB";
    document.getElementById("totalRecv").textContent =
      (bytesRecv / 1024 / 1024 / 1024).toFixed(2) + " GB";

    // Fetch individual interfaces data
    const interfacesResponse = await window.authFetch(
      buildUrl("/metrics/network"),
    );
    const interfaces = await interfacesResponse.json();

    if (interfacesTable) {
      interfacesTable.clear();
      interfacesTable.rows.add(
        interfaces.map((iface) => [
          iface.interface,
          iface.bytes_sent || 0,
          iface.bytes_recv || 0,
          iface.packets_sent || 0,
          iface.packets_recv || 0,
          iface.errors_in || 0,
        ]),
      );
      interfacesTable.draw();
    }

    // Update trend chart
    try {
      const historyResponse = await window.authFetch(
        buildUrl("/metrics/history?metric=network&duration=24h"),
      );
      const history = await historyResponse.json();
      const networkData = history.data || [];

      console.log("Network history data points:", networkData.length);
      if (networkData.length > 0) {
        console.log("First data point:", networkData[0]);

        const generateLabels = (data) => {
          return data.map((item, i) => {
            if (i % Math.ceil(data.length / 12) === 0) {
              // Parse ISO 8601 timestamp correctly
              const date = new Date(item.timestamp);
              if (isNaN(date.getTime())) {
                console.warn("Invalid date:", item.timestamp);
                return "";
              }
              // Format as HH:MM (24-hour format)
              const hours = String(date.getHours()).padStart(2, "0");
              const minutes = String(date.getMinutes()).padStart(2, "0");
              return `${hours}:${minutes}`;
            }
            return "";
          });
        };

        const uploadData = networkData.map((d) => {
          const rate = d.bytes_sent_rate || 0;
          // Convert bytes/sec to Mbps: (bytes * 8 bits/byte) / (1024*1024 bits/Megabit)
          return parseFloat(((rate * 8) / (1024 * 1024)).toFixed(2));
        });
        const downloadData = networkData.map((d) => {
          const rate = d.bytes_recv_rate || 0;
          // Convert bytes/sec to Mbps: (bytes * 8 bits/byte) / (1024*1024 bits/Megabit)
          return parseFloat(((rate * 8) / (1024 * 1024)).toFixed(2));
        });

        console.log("Upload data:", uploadData.slice(0, 5));
        console.log("Download data:", downloadData.slice(0, 5));

        networkDetailChart.data.labels = generateLabels(networkData);
        networkDetailChart.data.datasets[0].data = uploadData;
        networkDetailChart.data.datasets[1].data = downloadData;

        // Auto-scale Y-axis based on max data value
        const allData = [...uploadData, ...downloadData];
        const maxValue = Math.max(...allData, 0);
        let yMax = 10; // Default minimum
        if (maxValue > 0) {
          // Round up to nearest 5 or 10 for clean scaling
          yMax = Math.ceil((maxValue * 1.15) / 5) * 5; // Add 15% padding
          yMax = Math.max(yMax, 5);
        }
        networkDetailChart.options.scales.y.max = yMax;

        networkDetailChart.update("none");

        console.log("Chart updated successfully");
      } else {
        console.log("No network history data available");
      }
    } catch (historyError) {
      console.error("Error fetching history:", historyError);
    }
  } catch (error) {
    console.error("Error fetching network data:", error);
  }
}
