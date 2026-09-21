const { app, BrowserWindow, ipcMain, clipboard, shell, safeStorage, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const http = require("http");
const crypto = require("crypto");

// Fester App-Name. WICHTIG für den Schlüsselbund: dessen Eintrag heißt
// "<App-Name> Safe Storage". Ohne diese Zeile hieße die App im Entwicklungs-
// modus "Electron" und gepackt "Valorant Manager" — die fertige App käme dann
// nicht mehr an die Daten, die während der Entwicklung verschlüsselt wurden.
app.setName("Valorant Manager");

// Gemeinsames Geheimnis für diesen Programmlauf. Ohne diesen Wert weist das
// Backend jede Anfrage ab — damit kommt keine fremde Webseite an die Daten.
// Bei jedem Start neu, nirgends gespeichert.
const API_TOKEN = crypto.randomBytes(32).toString("hex");

let mainWindow;
let backendProcess = null;

// Port, den das Betriebssystem unserem Backend zugeteilt hat. Steht erst fest,
// wenn das Backend ihn über die Standardausgabe gemeldet hat (VM_PORT=...).
let backendPort = null;

// ─── Pfade: im Dev anders als in der gepackten App ──────────────────
const isDev = !app.isPackaged;

// Hot Reload: nur aktiv, wenn über "npm run dev" gestartet.
// Erkennung über das Startargument --dev statt über NODE_ENV, weil
// "NODE_ENV=x electron ." unter Windows (cmd.exe) nicht funktioniert.
// NODE_ENV wird weiter akzeptiert, falls jemand es von Hand setzt.
const useDevServer =
  process.argv.includes("--dev") || process.env.NODE_ENV === "development";

// Eigener Port, damit nichts mit anderen Projekten auf 3000 kollidiert.
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://localhost:3100";

// Die .jar liegt im Dev unter ./backend/, in der gepackten App unter resources/backend/
function getJarPath() {
  const jarName = "valorant-manager-api-2.0.0.jar";
  if (isDev) {
    return path.join(__dirname, "backend", jarName);
  }
  // process.resourcesPath zeigt in der gepackten App auf den resources-Ordner
  return path.join(process.resourcesPath, "backend", jarName);
}

// Java-Kommando. Bevorzugt eine mitgelieferte Laufzeit unter runtime/bin/.
// Zwei Gründe: die meisten Windows-Rechner haben kein Java 21+ installiert,
// und ein fester Pfad kann nicht durch einen manipulierten Suchpfad
// ausgetauscht werden ("java.exe" aus PATH wäre angreifbar).
function getJavaCommand() {
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const runtimeDir = isDev
    ? path.join(__dirname, "runtime")
    : path.join(process.resourcesPath, "runtime");
  const bundled = path.join(runtimeDir, "bin", exe);

  if (fs.existsSync(bundled)) {
    console.log("[Backend] Nutze mitgelieferte Java-Laufzeit.");
    return bundled;
  }
  // Die beiliegende Laufzeit ist die für Windows (dort wird ausgeliefert).
  // Auf dem Entwicklungs-Mac ist das kein Fehler — dort greift das System-Java.
  if (fs.existsSync(runtimeDir)) {
    console.log("[Backend] Beiliegende Laufzeit passt nicht zu dieser Plattform "
      + `(${process.platform}) — nutze 'java' aus dem Suchpfad.`);
  } else {
    console.warn("[Backend] Keine Laufzeit unter", runtimeDir,
      "— nutze 'java' aus dem Suchpfad. Für die Auslieferung muss eine beiliegen.");
  }
  return "java";
}

// ─── Schlüssel für die Account-Datei ────────────────────────────────
// Der Schlüssel liegt im Schlüsselbund des Betriebssystems (macOS Keychain /
// Windows DPAPI), nicht im Programmcode. Auf der Platte steht nur eine vom
// Betriebssystem verschlüsselte Fassung, die ausschliesslich dieser Benutzer
// auf diesem Rechner wieder öffnen kann.
const MASTER_KEY_FILE = path.join(os.homedir(), ".valorant-manager", "masterkey.bin");

function getOrCreateMasterKey() {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[Schlüssel] Schlüsselbund nicht verfügbar — es bleibt beim alten Verfahren.");
    return null;
  }
  try {
    if (fs.existsSync(MASTER_KEY_FILE)) {
      return safeStorage.decryptString(fs.readFileSync(MASTER_KEY_FILE));
    }
    const fresh = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(MASTER_KEY_FILE), { recursive: true });
    fs.writeFileSync(MASTER_KEY_FILE, safeStorage.encryptString(fresh), { mode: 0o600 });
    console.log("[Schlüssel] Neuer Schlüssel im Schlüsselbund angelegt.");
    return fresh;
  } catch (err) {
    // Lieber ohne neuen Schlüssel weiterlaufen als die App unbenutzbar machen —
    // das Backend nutzt dann weiter das alte Verfahren und die Daten bleiben lesbar.
    console.error("[Schlüssel] Nicht verfügbar:", err.message);
    return null;
  }
}

// ─── Backend starten ────────────────────────────────────────────────
function startBackend() {
  const jarPath = getJarPath();
  const javaCmd = getJavaCommand();
  // Muss nach app.whenReady() laufen — vorher ist der Schlüsselbund nicht bereit
  const masterKey = getOrCreateMasterKey();
  console.log("[Backend] Starte:", javaCmd, "-jar", jarPath);

  backendProcess = spawn(javaCmd, ["-jar", jarPath], {
    // windowsHide verhindert das schwarze Konsolenfenster unter Windows
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    // Token per Umgebungsvariable — taucht so weder in der Prozessliste
    // noch in einem Logfile auf.
    env: {
      ...process.env,
      VM_API_TOKEN: API_TOKEN,
      // Nur setzen, wenn der Schlüsselbund wirklich einen Schlüssel geliefert hat
      ...(masterKey ? { VM_MASTER_KEY: masterKey } : {}),
    },
  });

  backendProcess.stdout.on("data", (d) => {
    const text = d.toString();
    // Das Backend meldet seinen zugeteilten Port genau einmal beim Start
    const match = text.match(/VM_PORT=(\d+)/);
    if (match) {
      backendPort = Number(match[1]);
      console.log("[Backend] Läuft auf Port", backendPort);
    }
    console.log("[Backend]", text.trim());
  });
  backendProcess.stderr.on("data", (d) => console.error("[Backend]", d.toString().trim()));

  backendProcess.on("error", (err) => {
    console.error("[Backend] Konnte nicht gestartet werden:", err.message);
    // Häufigster Fall auf einem frischen Windows-Rechner: Java fehlt.
    // Ohne diese Meldung sähe der Nutzer nur ein Fenster ohne Daten.
    if (err.code === "ENOENT") {
      dialog.showErrorBox(
        "Java nicht gefunden",
        "Der Valorant Manager braucht Java 21 oder neuer.\n\n"
        + "Entweder Java installieren oder eine Laufzeit im Ordner \"runtime\" "
        + "mitliefern.\n\nDie App startet, zeigt aber keine Accounts an."
      );
    }
  });

  backendProcess.on("exit", (code) => {
    console.log("[Backend] Beendet mit Code", code);
    backendProcess = null;
  });
}

// ─── Warten bis das Backend seinen Port gemeldet hat und antwortet ──
function waitForBackend(retries = 60) {
  return new Promise((resolve) => {
    const tryOnce = (left) => {
      if (left <= 0) { resolve(false); return; }
      // Solange der Port noch nicht gemeldet wurde, gibt es nichts anzufragen
      if (!backendPort) { setTimeout(() => tryOnce(left - 1), 400); return; }

      const req = http.get({
        host: "127.0.0.1", port: backendPort, path: "/api/accounts",
        headers: { "X-VM-Token": API_TOKEN },
      }, (res) => {
        res.destroy();
        resolve(true);
      });
      req.on("error", () => setTimeout(() => tryOnce(left - 1), 400));
      req.setTimeout(800, () => req.destroy());
    };
    tryOnce(retries);
  });
}

// ─── API-Brücke ─────────────────────────────────────────────────────
// Die Oberfläche ruft das Backend NICHT selbst auf. Sie schickt ihren Wunsch
// hierher, und erst dieser Prozess setzt die Anfrage ab — mit dem Token.
// Folge: Token und Portnummer bleiben im Hauptprozess. Selbst wenn in der
// Oberfläche fremder Code liefe, hätte er beides nicht.
function callBackend({ method, path: apiPath, body }) {
  return new Promise((resolve) => {
    if (!backendPort) {
      resolve({ status: 0, error: "Backend läuft noch nicht." });
      return;
    }
    // Nur Pfade in die eigene API zulassen — keine fremden Ziele, keine Umwege
    if (typeof apiPath !== "string" || !/^\/api\/[A-Za-z0-9/_\-.]*$/.test(apiPath)) {
      console.warn("[Sicherheit] Unzulässiger API-Pfad abgelehnt:", apiPath);
      resolve({ status: 0, error: "Unzulässiger Pfad." });
      return;
    }

    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({
      host: "127.0.0.1", port: backendPort, path: apiPath,
      method: (method || "GET").toUpperCase(),
      headers: {
        "X-VM-Token": API_TOKEN,
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
      },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        if (res.statusCode === 204 || !data) { resolve({ status: res.statusCode, data: null }); return; }
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, error: "Unlesbare Antwort vom Backend." });
        }
      });
    });
    req.on("error", (err) => resolve({ status: 0, error: err.message }));
    req.setTimeout(40000, () => { req.destroy(); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Backend sauber beenden ─────────────────────────────────────────
function stopBackend() {
  if (backendProcess) {
    console.log("[Backend] Wird beendet...");
    backendProcess.kill();
    backendProcess = null;
  }
}

// ─── Navigations-Sperre ─────────────────────────────────────────────
// Das App-Fenster soll ausschließlich die eigene Oberfläche zeigen.
// Links nach außen (z. B. zur Henrik-Seite) gehen in den echten Browser,
// nicht in ein Electron-Fenster ohne Adresszeile.
function isOwnFrontend(url) {
  return url.startsWith("file://") || url.startsWith(DEV_SERVER_URL);
}

function openExternally(url) {
  // Nur echte Web-Adressen weitergeben — kein file:, kein javascript:
  if (/^https?:\/\//i.test(url)) {
    shell.openExternal(url);
    return true;
  }
  console.warn("[Sicherheit] Link abgewiesen:", url);
  return false;
}

function applyNavigationGuards(win) {
  // target="_blank" und window.open(...)
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  // Weg-Navigation im Hauptfenster selbst unterbinden
  win.webContents.on("will-navigate", (event, url) => {
    if (isOwnFrontend(url)) return;
    event.preventDefault();
    openExternally(url);
  });

  // Keine zusätzlichen Renderer-Prozesse mit Node-Zugriff
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

// ─── Frontend laden ─────────────────────────────────────────────────
// Dev: vom React-Dev-Server (Änderungen erscheinen sofort, ohne Build).
// Sonst: aus frontend/build/ — dem zuletzt gebauten Stand.
function loadBuiltFrontend() {
  const indexPath = path.join(__dirname, "frontend", "build", "index.html");
  console.log("Lade Build:", indexPath);
  return mainWindow.loadFile(indexPath);
}

async function loadFrontend() {
  if (!useDevServer) return loadBuiltFrontend();

  console.log("[Dev] Lade Dev-Server:", DEV_SERVER_URL);
  try {
    await mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } catch (err) {
    // Dev-Server nicht erreichbar -> lieber der alte Build als ein leeres Fenster
    console.error("[Dev] Dev-Server nicht erreichbar:", err.message);
    console.error("[Dev] Falle auf frontend/build/ zurück.");
    await loadBuiltFrontend();
  }
}

app.whenReady().then(async () => {
  // Standardmenü (File/Edit/View/Window/Help) entfernen — die App hat eine
  // eigene Bedienung. Unter macOS bleibt es, dort gehört es zum System und
  // enthält u. a. "Beenden".
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  startBackend();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    show: false, // erst zeigen, wenn bereit
    // Kein nativer Fensterrahmen: die Oberfläche bringt eine eigene Titelleiste
    // mit (Ziehbereich per WebkitAppRegion und eigene Fensterknöpfe). Ohne
    // frame:false lägen beide übereinander — nativer Rahmen samt Menüleiste
    // oben, die eigene Leiste direkt darunter.
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Bewusst KEINE Weitergabe des Tokens an die Oberfläche mehr —
      // es bleibt in diesem Prozess (siehe callBackend).
    },
  });

  applyNavigationGuards(mainWindow);

  // Warten bis das Backend hochgefahren ist, dann Frontend laden
  await waitForBackend();

  await loadFrontend();
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

// Sicherheitsnetz: Backend auch beim harten Beenden mitnehmen
app.on("before-quit", stopBackend);
process.on("exit", stopBackend);

// ─── IPC Handler ────────────────────────────────────────────────────
// Einziger Weg der Oberfläche zum Backend
ipcMain.handle("api-request", (event, payload) => callBackend(payload || {}));

ipcMain.handle("copy-to-clipboard", (event, text) => {
  clipboard.writeText(text);
  return true;
});

// Link im echten Browser öffnen (Henrik-Seite aus dem API-Key-Dialog)
ipcMain.handle("open-external", (event, url) => openExternally(String(url)));

ipcMain.handle("launch-riot-client", async () => {
  if (process.platform !== "win32") {
    return { ok: false, message: "Der Riot Client lässt sich nur unter Windows starten." };
  }
  // Riot lässt sich bei der Installation umlenken — deshalb mehrere Orte prüfen,
  // statt einen festen Pfad anzunehmen.
  const candidates = [
    "C:\\Riot Games\\Riot Client\\RiotClientServices.exe",
    "C:\\Program Files\\Riot Games\\Riot Client\\RiotClientServices.exe",
    "C:\\Program Files (x86)\\Riot Games\\Riot Client\\RiotClientServices.exe",
    path.join(process.env.LOCALAPPDATA || "", "Riot Games", "Riot Client", "RiotClientServices.exe"),
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) {
    return { ok: false, message: "Riot Client nicht gefunden. Bitte einmal von Hand starten." };
  }
  // Direkt Valorant starten statt nur den Launcher zu öffnen
  const child = spawn(found, ["--launch-product=valorant", "--launch-patchline=live"], {
    detached: true, stdio: "ignore", windowsHide: false,
  });
  child.unref();
  return { ok: true, path: found };
});

// ─── Export / Import: Datei-Dialoge ─────────────────────────────────
// Den Pfad wählt immer der Nutzer über den Systemdialog. Die Oberfläche kann
// keinen Pfad vorgeben — sie liefert nur den Inhalt bzw. bekommt ihn zurück.
const EXPORT_FILTER = [{ name: "Valorant Manager Export", extensions: ["vmexport"] }];

ipcMain.handle("export-save", async (event, content) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Accounts sichern",
    defaultPath: `valorant-manager-${stamp}.vmexport`,
    filters: EXPORT_FILTER,
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, String(content), "utf8");
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("import-open", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Sicherung einlesen",
    properties: ["openFile"],
    filters: EXPORT_FILTER,
  });
  if (canceled || !filePaths?.length) return { ok: false, canceled: true };
  try {
    return { ok: true, content: fs.readFileSync(filePaths[0], "utf8"), path: filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());
