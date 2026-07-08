import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Store from "electron-store";
import si from "systeminformation";
import { ModelManager } from "./modelManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

const store = new Store({ name: "normandy-codex-data" });
const modelManager = new ModelManager({
  modelsDir: path.join(app.getPath("userData"), "models"),
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#05070d",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------- Models ----------
ipcMain.handle("models:list", () => modelManager.getCatalog());
ipcMain.handle("models:status", () => modelManager.getStatus());
ipcMain.handle("models:download", (_event, modelId) =>
  modelManager.download(modelId, (progress) => {
    mainWindow?.webContents.send("models:download-progress", progress);
  })
);
ipcMain.handle("models:cancelDownload", () => modelManager.cancelDownload());
ipcMain.handle("models:load", (_event, modelId) => modelManager.load(modelId));
ipcMain.handle("models:delete", (_event, modelId) => modelManager.delete(modelId));
ipcMain.handle("models:current", () => modelManager.getCurrent());

// ---------- Chat ----------
ipcMain.handle("chat:send", (_event, { message, attachments }) => {
  const streamId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  modelManager
    .chat(message, attachments, {
      onToken: (chunk) => mainWindow?.webContents.send("chat:token", { streamId, chunk }),
    })
    .then((full) => {
      mainWindow?.webContents.send("chat:done", { streamId, full });
    })
    .catch((error) => {
      // Silently ignore deliberate user aborts — no error message in chat
      if (error?.name === "AbortError" || error?.code === "ERR_ABORTED") return;
      mainWindow?.webContents.send("chat:error", {
        streamId,
        message: String(error?.message || error),
      });
    });
  return { streamId };
});
ipcMain.handle("chat:abort", () => modelManager.abort());

// ---------- Profiles & history ----------
const DEFAULT_PROFILES = [{ id: "default", name: "Основной" }];

ipcMain.handle("profiles:list", () => store.get("profiles", DEFAULT_PROFILES));
ipcMain.handle("profiles:create", (_event, name) => {
  const profiles = store.get("profiles", DEFAULT_PROFILES);
  const profile = { id: `p_${Date.now()}`, name };
  profiles.push(profile);
  store.set("profiles", profiles);
  return profile;
});
ipcMain.handle("profiles:delete", (_event, id) => {
  const profiles = store.get("profiles", DEFAULT_PROFILES).filter((p) => p.id !== id);
  store.set("profiles", profiles);
  store.delete(`history:${id}`);
  return profiles;
});

ipcMain.handle("history:get", (_event, profileId) => store.get(`history:${profileId}`, []));
ipcMain.handle("history:save", (_event, { profileId, history }) => {
  store.set(`history:${profileId}`, history);
  return true;
});

// ---------- Files & folders ----------
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", "release", ".next", ".venv", "__pycache__"]);
const MAX_FILE_BYTES = 2_000_000;

function readFileEntry(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_BYTES) {
      return { path: filePath, name: path.basename(filePath), type: "file", tooLarge: true };
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return { path: filePath, name: path.basename(filePath), type: "file", content };
  } catch (error) {
    return {
      path: filePath,
      name: path.basename(filePath),
      type: "file",
      error: String(error?.message || error),
    };
  }
}

function readFolderEntry(dirPath, depth = 0, counter = { count: 0 }) {
  const name = path.basename(dirPath);
  if (depth > 6 || counter.count > 200) {
    return { path: dirPath, name, type: "folder", children: [] };
  }
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return { path: dirPath, name, type: "folder", children: [] };
  }
  const children = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      children.push(readFolderEntry(fullPath, depth + 1, counter));
    } else {
      counter.count += 1;
      if (counter.count > 200) continue;
      children.push(readFileEntry(fullPath));
    }
  }
  return { path: dirPath, name, type: "folder", children };
}

ipcMain.handle("files:openFileDialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openFile", "multiSelections"] });
  if (result.canceled) return [];
  return result.filePaths.map(readFileEntry);
});

ipcMain.handle("files:openFolderDialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (result.canceled) return null;
  return readFolderEntry(result.filePaths[0]);
});

ipcMain.handle("files:readDropped", (_event, filePaths) =>
  filePaths.map((p) => {
    try {
      const stat = fs.statSync(p);
      return stat.isDirectory() ? readFolderEntry(p) : readFileEntry(p);
    } catch (error) {
      return { path: p, name: path.basename(p), type: "file", error: String(error?.message || error) };
    }
  })
);

// ---------- System monitor ----------
let monitorInterval = null;
ipcMain.handle("system:startMonitor", () => {
  if (monitorInterval) return true;
  monitorInterval = setInterval(async () => {
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);
      mainWindow?.webContents.send("system:stats", {
        cpu: Math.round(load.currentLoad),
        ram: Math.round((mem.active / mem.total) * 100),
      });
    } catch {
      // ignore transient system-info read failures
    }
  }, 2000);
  return true;
});
ipcMain.handle("system:stopMonitor", () => {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = null;
  return true;
});

// ---------- App data ----------
ipcMain.handle("app:getDataPath", () => app.getPath("userData"));
ipcMain.handle("app:wipeAllData", async () => {
  store.clear();
  await modelManager.deleteAll();
  return true;
});
