# Valorant Account Manager

Desktop-App zum Verwalten mehrerer Valorant-Accounts: Zugangsdaten, Rang,
RR-Verlauf, Match-History. Electron-Fenster + React-Oberfläche + Java-Backend,
das die Daten von der Henrik-API holt und lokal verschlüsselt ablegt.

## Struktur

- `Valorant-Manager/` — Java-Backend (Maven, Spring Boot 3.5.3, Java 21).
  Quellcode in `src/main/java/com/valorant/`. **Einzige Quelle für Java-Code.**
- `valorant-manager-electron/` — Electron-Hülle (`main.js`, `preload.js`)
  und React-Frontend in `frontend/`. **Einzige Quelle für UI-Code.**
- `Valorant Zwischenspeicher/` — **Tote alte Kopie von März 2026.** Wird von
  keinem Build angefasst. Nicht als Referenz benutzen, nicht bearbeiten.

## Entwickeln (Normalfall)

```
cd valorant-manager-electron && npm run dev
```

Startet React-Dev-Server auf **Port 3100**, wartet auf ihn, startet dann
Electron (das seinerseits das Java-Backend auf Port 8080 hochfährt).
Änderungen an `frontend/src/` erscheinen sofort im Fenster — kein Build,
kein Neustart. Fenster schließen beendet alles mit.

Gilt nur für Frontend-Änderungen. **Java-Änderungen brauchen immer den
vollen Build unten**, auch im Dev-Modus — das Backend läuft aus der `.jar`.

## Voller Build

Nach Java-Änderungen:

```
cd Valorant-Manager && mvn clean package
cp target/valorant-manager-api-2.0.0.jar ../valorant-manager-electron/backend/
```

Nach Frontend-Änderungen, wenn die App ohne Dev-Modus laufen soll:

```
cd valorant-manager-electron/frontend && npm run build
```

Fertige App starten:

```
cd valorant-manager-electron && npm start
```

Windows-Installer bauen (Ergebnis in `dist/`, rund 144 MB):

```
cd valorant-manager-electron && npm run package
```

`npm start` lädt **immer** `frontend/build/` — den zuletzt gebauten Stand.
Ohne vorheriges `npm run build` sind Frontend-Änderungen dort unsichtbar.
Das ist die häufigste Fehlerquelle.

## Datenfluss

React (`frontend/src/App.jsx`) → `frontend/src/api.js` → HTTP an
`localhost:8080/api` → `ApiServer.java` → `ValorantAPI.java` → Henrik-API.
Gespeichert wird über `StorageManager.java`.

Daneben: React → `window.electron` → `preload.js` → IPC → `main.js`.
Nur für Zwischenablage, Riot-Client-Start und die Fenster-Buttons.

Ein neues Account-Feld muss an **drei** Stellen eingetragen werden:
`Account.java`, die DTOs in `ApiServer.java`, und `App.jsx`. Das DTO wird
gern vergessen — dann kommt das Feld nie im Frontend an.

## Sicherheitsaufbau (seit 21.09.2026)

**Zufälliger Port.** `server.port=0` — das Betriebssystem teilt dem Backend
einen freien Port zu und reserviert ihn für unseren Prozess. `PortReporter`
meldet ihn als Zeile `VM_PORT=<nr>` über die Standardausgabe an `main.js`.
NIE auf einen festen Port zurückstellen: bei 8080 konnte ein fremdes lokales
Programm den Port vorher belegen, unser Token abgreifen und der App
gefälschte Daten unterschieben (nachgewiesen am 21.09.2026).

**Token-Pflicht.** `main.js` würfelt bei jedem Start ein Zufallstoken und gibt
es dem Java-Prozess als `VM_API_TOKEN` mit. Jede Anfrage braucht den Header
`X-VM-Token`, sonst 401 (`TokenFilter.java`). Ohne Electron gestartet, erzeugt
das Backend sich selbst eines unter `~/.valorant-manager/session-token` —
nie offen.

**Die Oberfläche kennt weder Token noch Port.** Sie ruft das Backend nicht
selbst auf, sondern über `window.electron.apiRequest` → IPC → `callBackend()`
in `main.js`. Deshalb gibt es in `frontend/src` kein einziges `fetch` aufs
Backend und kein `@CrossOrigin` im Java-Code. `callBackend` lässt nur Pfade
nach dem Muster `/api/...` zu.

**Browser sind komplett ausgesperrt.** `TokenFilter` weist jede Anfrage mit
einem `Origin`-Header mit 403 ab — auch die CORS-Vorabfrage. Unsere eigenen
Aufrufe kommen aus dem Node-Prozess und senden keinen Origin.

**Verschlüsselung über den Schlüsselbund.** Der Schlüssel liegt im macOS-
Schlüsselbund (`safeStorage`), nicht im Code. `main.js` reicht ihn als
`VM_MASTER_KEY` weiter. Dateipräfixe: `VMENC2:` = Schlüsselbund (aktuell),
`VMENC1:` = alter fest verdrahteter Schlüssel (wird beim Laden automatisch
umgestellt). `app.setName("Valorant Manager")` in `main.js` muss bleiben —
der Schlüsselbund-Eintrag hängt an diesem Namen, sonst findet die gepackte App
den Schlüssel nicht mehr.

**Schutzsperre.** Lässt sich eine vorhandene `accounts.json` nicht entschlüsseln,
setzt `StorageManager` eine Sperre und speichert gar nicht mehr, statt die
echten Daten mit einer leeren Liste zu überschreiben.

**Achtung beim Start aus IntelliJ:** Ohne Electron fehlt `VM_MASTER_KEY`. Das
Backend kann `VMENC2:`-Daten dann nicht lesen, meldet 0 Accounts und sperrt das
Speichern. Das ist gewollt — die Daten bleiben heil. Zum Arbeiten mit echten
Daten die App über `npm run dev` starten.

**Master-Passwort (optional, aus by default).** Drei Verschlüsselungsstufen,
erkennbar am Präfix der `accounts.json`:
`VMENC1:` alter Code-Schlüssel (wird automatisch abgelöst) ·
`VMENC2:` Schlüsselbund/DPAPI des Geräts (Standard) ·
`VMENC3:` aus dem Master-Passwort abgeleitet, Salt je Datei.
Das Passwort steht NIRGENDS — nur im Arbeitsspeicher der laufenden Sitzung
(`CryptoManager.sessionPassword`). Das ist der einzige Schutz gegen
Schadsoftware, die unter demselben Windows-Konto läuft.

Ist V3 gesetzt und noch nicht entsperrt, meldet `StorageManager` den Zustand
`lockedByPassword`; `LockFilter` beantwortet dann alles ausser
`/api/security/*` und dem API-Key-Status mit **423**. Speichern ist in dem
Zustand blockiert. `unlock()` prüft das Passwort mit
`decryptWithSessionCandidate`, BEVOR es die Sitzung setzt — sonst stünde nach
einem Fehlversuch ein falscher Schlüssel scharf.

Endpunkte: `/api/security/status`, `/unlock`, `/enable-password`,
`/disable-password`, `/change-password`.

**Keine vermeidbaren Aufrufe nach aussen.** Schriften liegen lokal unter
`frontend/public/fonts/` + `fonts.css` — kein Google-Fonts-Aufruf mehr.
Nach aussen gehen nur noch: die Henrik-API beim Sync (Riot-Name, Tag,
API-Key — keine Passwörter) und die Rang-/Agentenbilder von Riots CDN.

## Oberfläche: Einstellungen & Ersteinrichtung

Zahnrad öffnet `BasicSettings` (Master-Passwort, Sicherung, API-Key). Nach der
Ersteinrichtung des API-Keys erscheint derselbe Dialog automatisch als
"Schritt 2 von 2".

Jede Einstellung hat einen `<InfoHint>` — der rote Pfeil ➜. Überfahren zeigt
die Erklärung, Anklicken hält sie fest. Neue Einstellungen bitte immer mit
InfoHint versehen; die Erklärung nennt Vor- UND Nachteil, nicht nur die
Funktion.

`UnlockScreen` erscheint vor allem anderen, wenn `security.locked` gilt.

## Sicherung / Umzug (Export & Import)

Knopf `⤓` im Kopfbereich. Nötig, weil die normale `accounts.json` am
Schlüsselbund bzw. an DPAPI hängt und auf einem anderen Rechner wertlos ist.

Der Export ist deshalb NICHT an den Schlüsselbund gebunden, sondern an ein vom
Nutzer vergebenes Passwort (`CryptoManager.encryptWithPassword`, Präfix
`VMEXPORT1:`, eigenes Salt je Datei). Endpunkte: `POST /api/export`,
`POST /api/import`. Vor jedem Import legt `StorageManager.backupCurrent()`
eine datierte Kopie unter `accounts-vor-import-*.json` an.

Beim Import wird die Liste **ersetzt**, nicht zusammengeführt.

## Daten und Geheimnisse

Liegen außerhalb des Projekts in `~/.valorant-manager/` (Ordner 700, Dateien 600):

- `accounts.json` — AES-256-GCM, Schlüssel aus dem Schlüsselbund
- `config.json` — Henrik-API-Key
- `masterkey.bin` — vom Betriebssystem verschlüsselter Schlüssel
- `backup-*/` — Sicherung vor dem Sicherheitsumbau

Nie committen: Account-Daten, API-Keys, Exportdateien. Die `.gitignore`
deckt das ab.

**`application.properties` gehört ins Repo** — sie enthält keine Geheimnisse,
aber mit `server.port=0` eine sicherheitsrelevante Einstellung. Fehlt sie,
bindet das Backend wieder auf Port 8080 und die Port-Besetzungslücke ist
zurück. (Eine frühere Fassung dieser Datei riet vom Committen ab; das war
falsch.)

In `Valorant Zwischenspeicher/ValorantAPI.java` steht ein alter API-Key im
Klartext. Der Ordner ist per `.gitignore` ausgeschlossen — Datei nicht
weitergeben.

## Java-Laufzeit beschaffen

`valorant-manager-electron/runtime/` ist NICHT im Repo: `lib/modules` allein
ist 112 MB und damit über GitHubs Grenze von 100 MB pro Datei. Nach einem
frischen Klon so wiederherstellen:

```
curl -L -o /tmp/jre.zip "https://api.adoptium.net/v3/binary/latest/26/ga/windows/x64/jre/hotspot/normal/eclipse"
unzip -q /tmp/jre.zip -d /tmp/jre
mv /tmp/jre/jdk-*-jre valorant-manager-electron/runtime
rm -f valorant-manager-electron/runtime/bin/server/classes_nocoops*.jsa
```

Die letzte Zeile entfernt 29 MB Start-Archive, die nur bei Heaps über 32 GB
greifen. Ohne `runtime/` läuft die App auf dem Entwicklungs-Mac weiter (dort
greift das System-Java), aber die gepackte Windows-App braucht sie.

## Windows (Hauptzielplattform, Entwicklung auf macOS)

- Dateirechte laufen über `FilePermissions.java`: POSIX auf macOS, ACL unter
  Windows. Nie wieder `setPosixFilePermissions` direkt aufrufen — das ist unter
  Windows wirkungslos.
- `safeStorage` nutzt unter Windows DPAPI statt Schlüsselbund. Der Schlüssel
  ist damit ans Windows-Benutzerkonto gebunden.
- Keine Unix-Syntax in npm-Scripts (`VAR=wert befehl` scheitert an cmd.exe).
  Port/Browser stehen deshalb in `frontend/.env`, der Dev-Modus wird über das
  Startargument `--dev` erkannt.
- Immer `127.0.0.1` statt `localhost` ansprechen — das Backend lauscht nur auf
  IPv4, und Windows löst `localhost` oft zuerst auf IPv6 auf.
- **Java-Laufzeit liegt bei:** `runtime/` enthält ein Windows-x64-JRE
  (Temurin 26.0.2.1, 155 MB, um ungenutzte Start-Archive gekürzt).
  `getJavaCommand()` nimmt `runtime/bin/java.exe`, sonst `java` aus dem
  Suchpfad. Auf dem Mac greift immer der Suchpfad — die beiliegende Laufzeit
  ist die für Windows, das ist kein Fehler.
- **Immer mit `--x64` bauen.** Ohne den Schalter richtet sich electron-builder
  nach dem Baurechner und erzeugt auf Apple Silicon ein arm64-Paket, das nicht
  zur x64-Laufzeit passt. Das `package`-Script setzt den Schalter bereits.
- Nicht auf Windows getestet — bisher nur Code-Durchsicht auf dem Mac.

## Versionskontrolle

Ein Repo im Projektwurzelverzeichnis, Branch `main`, kein Remote.
Das alte verschachtelte CRA-Repo unter `frontend/.git` wurde nach
`~/Desktop/valorant-frontend-git-backup` verschoben — verschachtelte Repos
brechen die Nachverfolgung im Hauptrepo.

Vor dem Veröffentlichen beachten: `CryptoManager.part()` enthält den alten
VMENC1-Schlüssel im Klartext. Für ein privates Repo unkritisch (er steckt
ohnehin in jeder ausgelieferten .jar, und die Daten liegen auf VMENC2/V3).

## Offene Punkte

- **Maven fehlt im PATH** (kein `mvnw`). Behelf oben. Fix: `brew install maven`
  (Homebrew ist ebenfalls nicht installiert).
- **Alter Henrik-API-Key** steht im Klartext in `Valorant Zwischenspeicher/`.
  Muss bei Henrik zurückgezogen werden — das kann nur der Nutzer selbst.
- **Kein Git im Hauptprojekt.** Nur `frontend/` hat ein Repo mit einem
  einzigen CRA-Commit; `App.jsx` und `api.js` sind dort untracked.
- **Port 3000 ist belegt** von einem anderen Projekt des Nutzers (Zoodle).
  Deshalb läuft der Dev-Server auf 3100. Nicht zurückstellen.
- **npm audit meldet 52 Funde im Frontend** — alle unter `react-scripts`, also
  nur beim Bauen, nichts davon in der App. Kein `npm audit fix --force`, das
  zerschießt den Build. Langfristig: Umzug von CRA auf Vite.
- **Installer ist unsigniert** — Windows SmartScreen warnt beim Start.
  Bewusste Entscheidung: Code Signing kostet 200–600 €/Jahr und lohnt für den
  kleinen Nutzerkreis nicht. Nutzer klicken einmalig
  "Weitere Informationen" → "Trotzdem ausführen".
- `launch-riot-client` prüft inzwischen mehrere Installationsorte und meldet
  Fehlschläge; unter macOS gibt es eine klare Absage statt stiller Wirkungslosigkeit.
- `App.test.js` ist noch der CRA-Standardtest und schlägt fehl.
- API-Keys werden beim Speichern gegen Henrik geprüft (`ValorantAPI.validateKey`).
  Bei Netzproblemen wird angenommen statt gesperrt, damit niemand ausgesperrt wird.
- Accounts werden per Listen-Index adressiert — nach dem Löschen zeigt ein
  offenes Modal auf den falschen Account.

## Sprache

Antworten auf Deutsch.
