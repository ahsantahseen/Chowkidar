const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  listServers: () => ipcRenderer.invoke("servers:list"),
  createServer: (payload) => ipcRenderer.invoke("servers:add", payload),
  updateServer: (payload) => ipcRenderer.invoke("servers:update", payload),
  updateServerMeta: (payload) => ipcRenderer.invoke("servers:meta", payload),
  deleteServer: (payload) => ipcRenderer.invoke("servers:delete", payload),
});
