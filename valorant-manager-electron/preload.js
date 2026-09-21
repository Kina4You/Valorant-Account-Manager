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

  // Aktualisierung
  updatePruefen: () => ipcRenderer.invoke("update-pruefen"),
  updateLaden: () => ipcRenderer.invoke("update-laden"),
  updateInstallieren: () => ipcRenderer.invoke("update-installieren"),
  // Fortschrittsmeldungen des Updaters. Gibt eine Funktion zum Abmelden zurück,
  // damit React beim Aufräumen keine Zuhörer stehen lässt.
  onUpdateStatus: (rueckruf) => {
    const handler = (_e, daten) => rueckruf(daten);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
  version: process.env.npm_package_version || null,

  // Sprache melden — der Hauptprozess braucht sie für die Systemdialoge
  setUiLang: (code) => ipcRenderer.invoke("set-lang", code),

  // Oberflächengröße einstellen (0.7 bis 1.4)
  setZoom: (faktor) => ipcRenderer.invoke("set-zoom", faktor),

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
