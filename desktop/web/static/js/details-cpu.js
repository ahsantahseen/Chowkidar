// CPU Details Page
let cpuDetailChart;

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
    const response = await window.authFetch(buildUrl("/metrics/cpu"));
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
      `,
        )
        .join("");
    }

    // Update top processes
    const dashboardResponse = await window.authFetch(buildUrl("/dashboard"));
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
    `,
      )
      .join("");

    // Update trend chart
    const historyResponse = await window.authFetch(
      buildUrl("/metrics/history?metric=cpu&duration=24h"),
    );
    const history = await historyResponse.json();
    const cpuData = history.data || [];

    if (cpuData.length > 0) {
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

      cpuDetailChart.data.labels = generateLabels(cpuData);
      cpuDetailChart.data.datasets[0].data = cpuData.map((d) => d.usage);
      cpuDetailChart.update("none");
    }
  } catch (error) {
    console.error("Error fetching CPU data:", error);
  }

  // Fetch CPU info and compatibility
  try {
    const cpuInfoResponse = await window.authFetch(
      buildUrl("/metrics/cpu/info"),
    );
    if (cpuInfoResponse.ok) {
      const cpuInfo = await cpuInfoResponse.json();
      updateCPUInfo(cpuInfo);
    }

    const compatibilityResponse = await window.authFetch(
      buildUrl("/metrics/cpu/compatibility"),
    );
    if (compatibilityResponse.ok) {
      const compatibility = await compatibilityResponse.json();
      updateCompatibility(compatibility);
    }
  } catch (error) {
    console.error("Error fetching CPU info:", error);
  }
}

function updateCPUInfo(cpuInfo) {
  document.getElementById("cpuModelName").textContent =
    cpuInfo.model_name || "--";
  document.getElementById("cpuVendor").textContent = cpuInfo.vendor_id || "--";
  document.getElementById("cpuPhysicalCores").textContent =
    cpuInfo.cores || "--";
  document.getElementById("cpuThreads").textContent = cpuInfo.threads || "--";
  document.getElementById("cpuMaxFreq").textContent =
    cpuInfo.max_frequency || "--";
  document.getElementById("cpuArch").textContent = cpuInfo.architecture || "--";

  // Dynamically generate instruction set badges based on architecture
  const instructionSetsContainer = document.getElementById("instructionSets");
  let badgesHTML = "";

  if (cpuInfo.is_arm) {
    // ARM architecture badges
    const armBadges = [
      {
        name: "NEON",
        supported: cpuInfo.has_neon,
        description: "Advanced SIMD",
      },
      {
        name: "SVE",
        supported: cpuInfo.has_sve,
        description: "Scalable Vector",
      },
      {
        name: "CRC32",
        supported: cpuInfo.has_crc32,
        description: "CRC32 Checksum",
      },
    ];

    badgesHTML = armBadges
      .map(
        (badge) => `
      <span class="badge ${badge.supported ? "" : "unavailable"}" title="${badge.description}">
        ${badge.name}
      </span>
    `,
      )
      .join("");

    if (badgesHTML) {
      instructionSetsContainer.innerHTML = badgesHTML;
      instructionSetsContainer.insertAdjacentHTML(
        "beforeend",
        '<p style="color: var(--text-muted); font-size: 12px; margin-top: 10px;">ARM64 Architecture</p>',
      );
    }
  } else if (cpuInfo.is_x86) {
    // x86/x64 architecture badges
    const x86Badges = [
      { name: "SSE4.1", supported: cpuInfo.has_sse41 },
      { name: "SSE4.2", supported: cpuInfo.has_sse42 },
      { name: "AVX", supported: cpuInfo.has_avx },
      { name: "AVX2", supported: cpuInfo.has_avx2 },
    ];

    badgesHTML = x86Badges
      .map(
        (badge) => `
      <span class="badge ${badge.supported ? "" : "unavailable"}">
        ${badge.name}
      </span>
    `,
      )
      .join("");

    if (badgesHTML) {
      instructionSetsContainer.innerHTML = badgesHTML;
      instructionSetsContainer.insertAdjacentHTML(
        "beforeend",
        '<p style="color: var(--text-muted); font-size: 12px; margin-top: 10px;">x86/x64 Architecture</p>',
      );
    }
  }
}

function updateCompatibility(compatibility) {
  const grid = document.getElementById("compatibilityGrid");
  if (!grid) return;

  grid.innerHTML = compatibility
    .map(
      (app) => `
    <div class="compatibility-card ${app.compatible ? "" : "incompatible"}">
      <div class="compatibility-header">
        <span class="compatibility-name">${app.name}</span>
        <span class="compatibility-status ${app.compatible ? "compatible" : "incompatible"}">
          ${app.compatible ? "✓" : "✗"}
        </span>
      </div>
      <span class="compatibility-category">${app.category}</span>
      <div class="compatibility-requirements">
        📋 ${app.requirements}
      </div>
      <div class="compatibility-notes">
        ${app.notes}
      </div>
    </div>
  `,
    )
    .join("");
}
