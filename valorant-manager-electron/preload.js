/**
 * preload.js — Sichere Brücke zwischen React (Renderer) und Electron (Main)
 *
 * React hat KEINEN direkten Node.js-Zugriff.
 * Alles läuft über dieses sichere contextBridge.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // Einziger Weg ans Backend. Token und Portnummer kennt nur der Hauptprozess —
  // hier wird lediglich Methode, Pfad und Inhalt durchgereicht.
  apiRequest: (method, path, body) => ipcRenderer.invoke("api-request", { method, path, body }),

  // Passwort in Zwischenablage
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),

  // Externen Link im Standardbrowser öffnen
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // Riot Client starten
  launchRiotClient: () => ipcRenderer.invoke("launch-riot-client"),

  // Sicherung speichern / einlesen (Pfadwahl über den Systemdialog)
  saveExport: (content) => ipcRenderer.invoke("export-save", content),
  openImport: () => ipcRenderer.invoke("import-open"),

  // Fenster-Controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
