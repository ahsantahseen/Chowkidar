const { app, BrowserWindow, protocol, shell, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const DEFAULT_BACKEND = "http://127.0.0.1:8080";
const DEFAULT_UI_PORT = 5177;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "chowkidar",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: false,
    },
  },
]);

function loadConfig() {
  const configPath = path.join(__dirname, "config.json");
  let config = { backendBaseUrl: DEFAULT_BACKEND, uiPort: DEFAULT_UI_PORT };

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      config = {
        backendBaseUrl: parsed.backendBaseUrl || DEFAULT_BACKEND,
        uiPort: parsed.uiPort || DEFAULT_UI_PORT,
      };
    } catch (error) {
      console.error("Failed to parse config.json:", error.message);
    }
  }

  if (process.env.CHOWKIDAR_BACKEND_URL) {
    config.backendBaseUrl = process.env.CHOWKIDAR_BACKEND_URL;
  }

  if (process.env.CHOWKIDAR_UI_PORT) {
    const port = Number(process.env.CHOWKIDAR_UI_PORT);
    if (!Number.isNaN(port)) {
      config.uiPort = port;
    }
  }

  return config;
}

function resolveUiPath(requestUrl) {
  const webRoot = path.join(__dirname, "web");
  const templatesRoot = path.join(webRoot, "templates");
  const staticRoot = path.join(webRoot, "static");
  const parsed = new URL(requestUrl);
  const pathname = parsed.pathname || "/";

  if (pathname.startsWith("/static/")) {
    const staticPath = path.normalize(pathname.replace("/static/", ""));
    const resolved = path.join(staticRoot, staticPath);
    if (resolved.startsWith(staticRoot)) {
      return resolved;
    }
  }

  const routeMap = {
    "/": "dashboard.html",
    "/servers": "servers.html",
    "/cpu": "details-cpu.html",
    "/memory": "details-memory.html",
    "/network": "details-network.html",
    "/disk": "details-disk.html",
  };

  const template = routeMap[pathname] || "servers.html";
  const resolved = path.join(templatesRoot, template);
  if (resolved.startsWith(templatesRoot)) {
    return resolved;
  }

  return path.join(templatesRoot, "servers.html");
}

function registerProtocol() {
  protocol.registerFileProtocol("chowkidar", (request, callback) => {
    const filePath = resolveUiPath(request.url);
    callback({ path: filePath });
  });
}

async function createWindow() {
  const { backendBaseUrl } = loadConfig();

  const userDataDir = app.getPath("userData");
  try {
    db.initDb(userDataDir);
  } catch (error) {
    log.error("Failed to initialize SQLite:", error);
  }

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const url = `chowkidar://app/servers?baseUrl=${encodeURIComponent(
    backendBaseUrl,
  )}`;
  await mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });
}

function registerIpcHandlers() {
  ipcMain.handle("servers:list", () => db.listServers());
  ipcMain.handle("servers:add", (_event, payload) => db.addServer(payload));
  ipcMain.handle("servers:update", (_event, payload) =>
    db.updateServer(payload),
  );
  ipcMain.handle("servers:meta", (_event, payload) =>
    db.updateServerMeta(payload),
  );
  ipcMain.handle("servers:delete", (_event, payload) =>
    db.deleteServer(payload),
  );
}

function setupAutoUpdater() {
  if (process.env.CHOWKIDAR_AUTO_UPDATE !== "1") {
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
  log.info("Auto-update enabled");

  autoUpdater.on("error", (error) => {
    log.error("Auto-update error:", error);
  });

  autoUpdater.on("update-available", () => {
    log.info("Update available");
  });

  autoUpdater.on("update-not-available", () => {
    log.info("No update available");
  });

  autoUpdater.on("update-downloaded", () => {
    log.info("Update downloaded");
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  registerProtocol();
  registerIpcHandlers();
  createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
