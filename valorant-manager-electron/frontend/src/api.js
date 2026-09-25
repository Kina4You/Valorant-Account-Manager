/**
 * api.js — Alle Aufrufe ans Java-Backend zentral hier.
 * React-Komponenten importieren nur diese Datei.
 */

import { t } from "./i18n";

const BASE = "/api";

/**
 * Alle Aufrufe laufen über den Electron-Hauptprozess, nicht über fetch.
 *
 * Grund: Token und Portnummer des Backends bleiben damit ausserhalb der
 * Oberfläche. Ein Browser kann das Backend nicht ansprechen, und selbst wenn
 * in dieser Oberfläche fremder Code ausgeführt würde, hätte er kein Token.
 */
async function req(path, options = {}) {
  if (typeof window === "undefined" || !window.electron?.apiRequest) {
    throw new Error(t("err.desktopOnly"));
  }

  const body = options.body ? JSON.parse(options.body) : undefined;
  const res = await window.electron.apiRequest(options.method || "GET", `${BASE}${path}`, body);

  if (!res || res.status === 0) {
    throw new Error(res?.code ? t(res.code) : (res?.error || t("err.backendDown")));
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(t("err.denied"));
  }
  if (res.status < 200 || res.status >= 300) {
    // Status mitgeben, damit die Oberfläche z. B. 423 (gesperrt) erkennen kann
    const err = new Error(`API Fehler: ${res.status} auf ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.data; // bei 204 (z.B. DELETE) ist das null
}

// Alle Accounts laden (mit gecachten Daten)
export const getAccounts = () => req("/accounts");

// Neuen Account anlegen
export const createAccount = (data) =>
  req("/accounts", { method: "POST", body: JSON.stringify(data) });

// Account bearbeiten
export const updateAccount = (index, data) =>
  req(`/accounts/${index}`, { method: "PUT", body: JSON.stringify(data) });

// Account löschen
export const deleteAccount = (index) =>
  req(`/accounts/${index}`, { method: "DELETE" });

// Valorant API-Daten synchronisieren (live fetch)
export const syncAccount = (index) => req(`/accounts/${index}/sync`);

// Als Main-Account markieren
export const setMainAccount = (index) =>
  req(`/accounts/${index}/main`, { method: "POST" });

// Zugangsdaten abrufen (POST, weil der Aufruf den "zuletzt kopiert"-Zeitstempel setzt)
export const getCredentials = (index) =>
  req(`/accounts/${index}/credentials`, { method: "POST" });

// ─── Freunde (nur anschauen, keine Zugangsdaten) ────
export const getFriends = () => req("/friends");

export const addFriend = (riotName, riotTag) =>
  req("/friends", { method: "POST", body: JSON.stringify({ riotName, riotTag }) });

export const deleteFriend = (index) =>
  req(`/friends/${index}`, { method: "DELETE" });

export const syncFriend = (index) => req(`/friends/${index}/sync`);

// ─── Sicherung: Export / Import ─────────────────────
// Der Export ist mit einem selbst gewählten Passwort geschützt und dadurch
// auf einem anderen Rechner lesbar — anders als die normale Ablage, die am
// Schlüsselbund des Betriebssystems hängt.
export const exportAccounts = (password) =>
  req("/export", { method: "POST", body: JSON.stringify({ password }) });

export const importAccounts = (password, content) =>
  req("/import", { method: "POST", body: JSON.stringify({ password, content }) });

// ─── Master-Passwort (optionaler Zusatzschutz) ──────
// Ohne: Schlüssel liegt im Schlüsselbund des Geräts.
// Mit:  Schlüssel entsteht erst aus dem eingetippten Passwort.
export const getSecurityStatus = () => req("/security/status");

export const unlockWithPassword = (password) =>
  req("/security/unlock", { method: "POST", body: JSON.stringify({ password }) });

export const enableMasterPassword = (password) =>
  req("/security/enable-password", { method: "POST", body: JSON.stringify({ password }) });

export const disableMasterPassword = (password) =>
  req("/security/disable-password", { method: "POST", body: JSON.stringify({ password }) });

export const changeMasterPassword = (oldPassword, newPassword) =>
  req("/security/change-password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });

// ─── API-Key-Verwaltung ─────────────────────────────
// Prüft, ob im Backend bereits ein API-Key hinterlegt ist
export const getApiKeyStatus = () => req("/config/api-key/status");

// Setzt einen neuen API-Key (Erststart oder Wechsel in den Einstellungen)
export const setApiKey = (apiKey) =>
  req("/config/api-key", { method: "POST", body: JSON.stringify({ apiKey }) });
