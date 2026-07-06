import { contextBridge, ipcRenderer } from "electron";

const api = {
  models: {
    list: () => ipcRenderer.invoke("models:list"),
    status: () => ipcRenderer.invoke("models:status"),
    download: (modelId) => ipcRenderer.invoke("models:download", modelId),
    cancelDownload: () => ipcRenderer.invoke("models:cancelDownload"),
    load: (modelId) => ipcRenderer.invoke("models:load", modelId),
    delete: (modelId) => ipcRenderer.invoke("models:delete", modelId),
    current: () => ipcRenderer.invoke("models:current"),
    onDownloadProgress: (cb) => {
      const listener = (_event, data) => cb(data);
      ipcRenderer.on("models:download-progress", listener);
      return () => ipcRenderer.removeListener("models:download-progress", listener);
    },
  },
  chat: {
    send: (payload) => ipcRenderer.invoke("chat:send", payload),
    abort: () => ipcRenderer.invoke("chat:abort"),
    onToken: (cb) => {
      const listener = (_event, data) => cb(data);
      ipcRenderer.on("chat:token", listener);
      return () => ipcRenderer.removeListener("chat:token", listener);
    },
    onDone: (cb) => {
      const listener = (_event, data) => cb(data);
      ipcRenderer.on("chat:done", listener);
      return () => ipcRenderer.removeListener("chat:done", listener);
    },
    onError: (cb) => {
      const listener = (_event, data) => cb(data);
      ipcRenderer.on("chat:error", listener);
      return () => ipcRenderer.removeListener("chat:error", listener);
    },
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    create: (name) => ipcRenderer.invoke("profiles:create", name),
    delete: (id) => ipcRenderer.invoke("profiles:delete", id),
  },
  history: {
    get: (profileId) => ipcRenderer.invoke("history:get", profileId),
    save: (profileId, history) => ipcRenderer.invoke("history:save", { profileId, history }),
  },
  files: {
    openFileDialog: () => ipcRenderer.invoke("files:openFileDialog"),
    openFolderDialog: () => ipcRenderer.invoke("files:openFolderDialog"),
    readDropped: (paths) => ipcRenderer.invoke("files:readDropped", paths),
  },
  system: {
    startMonitor: () => ipcRenderer.invoke("system:startMonitor"),
    stopMonitor: () => ipcRenderer.invoke("system:stopMonitor"),
    onStats: (cb) => {
      const listener = (_event, data) => cb(data);
      ipcRenderer.on("system:stats", listener);
      return () => ipcRenderer.removeListener("system:stats", listener);
    },
  },
  app: {
    getDataPath: () => ipcRenderer.invoke("app:getDataPath"),
    wipeAllData: () => ipcRenderer.invoke("app:wipeAllData"),
  },
};

contextBridge.exposeInMainWorld("codex", api);
