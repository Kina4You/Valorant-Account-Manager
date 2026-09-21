# Valorant Account Manager

Desktop-App zum Verwalten mehrerer Valorant-Accounts: Zugangsdaten, aktueller
Rang, RR-Verlauf und Match-History an einer Stelle. Die Zugangsdaten liegen
verschlüsselt auf dem eigenen Rechner, die Spielerdaten kommen über die
Henrik-API.

Zielplattform ist Windows; entwickelt wird auf macOS.
Oberfläche auf Englisch, in den Einstellungen auf Deutsch umstellbar.

---

## Download

**[➜ Aktuellen Installer herunterladen](https://github.com/Kina4You/Valorant-Account-Manager/releases/latest/download/Valorant-Manager-Setup.exe)**

Windows 10/11, 64 Bit. Rund 141 MB — Java ist mit dabei, es muss nichts
weiter installiert werden.

> **Beim ersten Start warnt Windows.** Der Installer ist nicht signiert
> (ein Zertifikat kostet mehrere hundert Euro im Jahr). Auf
> „Weitere Informationen" klicken, dann „Trotzdem ausführen". Nur einmal nötig.

Alle Versionen und Änderungsnotizen: [Releases](https://github.com/Kina4You/Valorant-Account-Manager/releases)

---

## Aufbau

Drei Teile, die zur Laufzeit zusammenspielen:

```
┌─ Electron (main.js) ─────────────────────────────────────┐
│                                                          │
│  1. startet das Java-Backend als eigenen Prozess         │
│     → Port wird vom Betriebssystem zugeteilt             │
│                                                          │
│  2. lädt die React-Oberfläche                            │
│         │                                                │
│         ▼                                                │
│   ┌─ React (Oberfläche) ──────┐                          │
│   │  App.jsx → api.js ────────┼──► IPC ──► Hauptprozess  │
│   │                           │            │             │
│   └───────────────────────────┘            ▼             │
│                                   HTTP mit Token         │
└──────────────────────────────────────────┬───────────────┘
                                           ▼
                              Java-Backend (Spring Boot)
                                           │
              ┌────────────────────────────┴──────────────┐
              ▼                                           ▼
     api.henrikdev.xyz                      ~/.valorant-manager/
     (Rang, RR, Matches)                    (verschlüsselte Daten)
```

| Ordner | Inhalt |
|---|---|
| `Valorant-Manager/` | Java-Backend (Spring Boot 3.5.3, Java 21) |
| `valorant-manager-electron/` | Electron-Hülle + React-Oberfläche |

Die Oberfläche spricht das Backend **nicht** direkt an, sondern über den
Electron-Hauptprozess. Token und Portnummer bleiben dadurch ausserhalb der
Oberfläche.

---

## Voraussetzungen

- Node.js 20+
- Java 21+ (nur zum Entwickeln; die fertige App bringt eine Laufzeit mit)
- Maven — oder das in IntelliJ IDEA mitgelieferte
- Einen Henrik-API-Key ([hier anfragen](https://docs.henrikdev.xyz/authentication-and-authorization))

---

## Einrichten nach dem Klonen

```bash
# Abhängigkeiten
cd valorant-manager-electron && npm install
cd frontend && npm install && cd ../..

# Java-Laufzeit für Windows (nicht im Repo, siehe unten)
curl -L -o /tmp/jre.zip "https://api.adoptium.net/v3/binary/latest/26/ga/windows/x64/jre/hotspot/normal/eclipse"
unzip -q /tmp/jre.zip -d /tmp/jre
mv /tmp/jre/jdk-*-jre valorant-manager-electron/runtime
rm -f valorant-manager-electron/runtime/bin/server/classes_nocoops*.jsa

# Backend bauen und ablegen
cd Valorant-Manager && mvn clean package
cp target/valorant-manager-api-2.0.0.jar ../valorant-manager-electron/backend/
```

**Warum die Laufzeit nicht im Repo liegt:** Sie ist 155 MB unveränderliches
Fremdmaterial, das sich mit den vier Befehlen oben jederzeit wiederherstellen
lässt. Die grösste Einzeldatei darin (`lib/modules`) liegt bei 97 MiB — nur
3 MiB unter GitHubs harter Grenze von 100 MiB pro Datei. Schon die nächste
Java-Version könnte darüber liegen und jeden Push blockieren. Dazu kommt:
Git speichert Binärdateien nicht platzsparend, jede Aktualisierung der
Laufzeit würde dauerhaft weitere ~100 MB in der Historie hinterlassen.

Ohne sie läuft die App auf dem Entwicklungsrechner weiter (dort greift das
installierte Java) — für das Windows-Paket wird sie gebraucht.

---

## Entwickeln

```bash
cd valorant-manager-electron
npm run dev
```

Startet den React-Dev-Server auf Port 3100 und danach Electron. Änderungen an
`frontend/src/` erscheinen sofort im Fenster, ohne Neustart.

Gilt nur fürs Frontend. **Java-Änderungen brauchen immer den vollen Build** —
das Backend läuft aus der `.jar`.

## Fertige App starten

```bash
cd valorant-manager-electron/frontend && npm run build   # nicht vergessen
cd .. && npm start
```

`npm start` lädt immer den zuletzt gebauten Stand aus `frontend/build/`.
Ohne vorheriges `npm run build` sind Oberflächen-Änderungen unsichtbar — die
häufigste Stolperfalle in diesem Projekt.

## Windows-Installer bauen

```bash
cd valorant-manager-electron
npm run package
```

Ergebnis in `dist/`, rund 144 MB. Der Installer ist nicht signiert, deshalb
zeigt Windows beim ersten Start eine SmartScreen-Warnung
(„Weitere Informationen" → „Trotzdem ausführen").

---

## Wo die Daten liegen

Ausserhalb des Projekts, in `~/.valorant-manager/` (Ordner und Dateien nur für
den Besitzer lesbar):

| Datei | Inhalt |
|---|---|
| `accounts.json` | Accounts, AES-256-GCM verschlüsselt |
| `config.json` | Henrik-API-Key |
| `masterkey.bin` | vom Betriebssystem verschlüsselter Schlüssel |

Das Projekt lässt sich löschen, ohne einen Account zu verlieren.

---

## Sicherheit

Die App verwaltet Passwörter, entsprechend ist das der Schwerpunkt:

- **Zufälliger Port.** Das Backend lauscht nur auf `127.0.0.1`, auf einem vom
  System zugeteilten Port. Bei einem festen Port könnte ein fremdes lokales
  Programm ihn vorher belegen und das Token abgreifen.
- **Token-Pflicht.** Jede Anfrage braucht ein bei jedem Start neu gewürfeltes
  Token. Ohne: 401.
- **Browser ausgesperrt.** Keine CORS-Freigaben; Anfragen mit `Origin`-Header
  werden mit 403 abgewiesen.
- **Verschlüsselung.** Standardmässig hängt der Schlüssel am Schlüsselbund des
  Geräts (macOS Keychain / Windows DPAPI). Optional lässt sich in den
  Einstellungen ein **Master-Passwort** einschalten — dann entsteht der
  Schlüssel erst aus der Eingabe und wird nirgends gespeichert.
- **Export.** Passwortgeschützte Sicherungsdatei für den Umzug auf einen
  anderen Rechner. Nötig, weil die normale Ablage an das Gerät gebunden ist.

Nach aussen gehen nur die Henrik-API (Spielername, Tag, API-Key — keine
Passwörter) und die Rang-/Agentenbilder von Riots CDN. Schriften liegen lokal
bei.

**Grenze:** Gegen Schadsoftware, die unter demselben Benutzerkonto läuft,
schützt nur das Master-Passwort. Alles andere kann das Betriebssystem einem
solchen Programm auf Nachfrage herausgeben.

---

## Hinweise

- `CLAUDE.md` enthält die ausführliche Entwickler-Dokumentation.
- Ein neues Account-Feld muss an drei Stellen eingetragen werden: `Account.java`,
  die DTOs in `ApiServer.java` und `App.jsx`. Das DTO wird gern vergessen.
- Die npm-Warnungen im Frontend stammen alle aus `react-scripts` und betreffen
  nur den Build. Kein `npm audit fix --force` — das zerschiesst den Build.
