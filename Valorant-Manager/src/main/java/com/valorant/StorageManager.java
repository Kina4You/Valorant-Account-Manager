package com.valorant;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class StorageManager {

    // Fester Speicherort im User-Verzeichnis: ~/.valorant-manager/accounts.json
    // Unabhängig davon, von wo das Programm gestartet wird (IntelliJ, Electron, .jar).
    private static final Path DATA_DIR =
        Paths.get(System.getProperty("user.home"), ".valorant-manager");
    private static final Path DATA_FILE = DATA_DIR.resolve("accounts.json");

    // Alte Speicherorte, von denen einmalig automatisch übernommen wird
    private static final Path LEGACY_WORKDIR = Paths.get("accounts.json");
    private static final Path LEGACY_DESKTOP =
        Paths.get(System.getProperty("user.home"), "Desktop", "accounts.json");

    private final Gson gson;

    /**
     * Schutzsperre: wird gesetzt, wenn eine vorhandene Datei NICHT gelesen werden
     * konnte (z. B. Backend ohne Electron gestartet, Schlüssel fehlt).
     * Ohne diese Sperre würde die App "0 Accounts" annehmen und beim nächsten
     * Speichern die echten Daten überschreiben.
     */
    private boolean loadFailed = false;

    /**
     * Gesetzt, wenn die Datei mit einem Master-Passwort geschützt ist und dieses
     * noch nicht eingegeben wurde. Das ist KEIN Fehler, sondern der Normalfall
     * direkt nach dem Start — die Oberfläche fragt dann danach.
     */
    private boolean lockedByPassword = false;

    public boolean isLocked() { return loadFailed; }
    public boolean isPasswordLocked() { return lockedByPassword; }

    /** "keines" | "geraet" (Schlüsselbund) | "passwort" — wie die Daten aktuell liegen. */
    public String protectionMode() {
        try {
            if (!Files.exists(DATA_FILE)) {
                return CryptoManager.hasSessionPassword() ? "passwort" : "geraet";
            }
            String head = Files.readString(DATA_FILE, StandardCharsets.UTF_8).stripLeading();
            if (head.startsWith(CryptoManager.MAGIC_V3)) return "passwort";
            return "geraet";
        } catch (Exception e) {
            return "geraet";
        }
    }

    /**
     * Versucht, mit dem angegebenen Passwort zu entsperren.
     * Bei Erfolg gilt das Passwort für die restliche Sitzung.
     */
    public boolean unlock(String password) {
        try {
            String content = Files.readString(DATA_FILE, StandardCharsets.UTF_8).trim();
            // Erst prüfen, ohne die Sitzung anzufassen — sonst stünde nach einem
            // Fehlversuch ein falsches Passwort scharf und würde beim Speichern
            // die Daten mit dem falschen Schlüssel überschreiben.
            CryptoManager.decryptWithSessionCandidate(content, password);
            CryptoManager.setSessionPassword(password);
            lockedByPassword = false;
            loadFailed = false;
            System.out.println("[Storage] Mit Master-Passwort entsperrt.");
            return true;
        } catch (Exception e) {
            System.out.println("[Storage] Entsperren fehlgeschlagen.");
            return false;
        }
    }

    /** Schaltet den Master-Passwort-Schutz ein und schreibt die Daten neu. */
    public boolean enablePassword(String password, List<Account> accounts) {
        if (loadFailed || lockedByPassword) return false;
        CryptoManager.setSessionPassword(password);
        saveAccounts(accounts);
        System.out.println("[Storage] Master-Passwort aktiviert.");
        return true;
    }

    /** Schaltet ihn wieder aus — zurück auf den Schlüsselbund des Geräts. */
    public boolean disablePassword(List<Account> accounts) {
        if (loadFailed || lockedByPassword) return false;
        CryptoManager.clearSessionPassword();
        saveAccounts(accounts);
        System.out.println("[Storage] Master-Passwort deaktiviert, zurück auf Geräteschutz.");
        return true;
    }

    // Damit der LockFilter den Sperrzustand kennt, ohne dass Spring die Instanz
    // verwalten muss (ApiServer legt sie selbst an).
    private static volatile StorageManager instance;

    public static boolean globallyLocked() {
        return instance != null && instance.lockedByPassword;
    }

    public StorageManager() {
        instance = this;
        this.gson = new GsonBuilder().setPrettyPrinting().create();
        try {
            Files.createDirectories(DATA_DIR);
            FilePermissions.ownerOnly(DATA_DIR, true);
            // Bestehende Datei aus einer älteren Version nachträglich absichern
            if (Files.exists(DATA_FILE)) restrictPermissions(DATA_FILE);
        } catch (Exception e) {
            System.out.println("[Storage] Konnte Datenordner nicht anlegen: " + e.getMessage());
        }
    }

    /**
     * Setzt die Dateirechte auf "nur Besitzer lesen/schreiben" (600).
     * Ohne das ist die Datei für alle Benutzer des Rechners lesbar — und da der
     * App-Schlüssel in der .jar steckt, wäre sie damit auch entschlüsselbar.
     */
    private static void restrictPermissions(Path file) {
        FilePermissions.ownerOnly(file);
    }

    /** Rohe Account-Liste als JSON — Grundlage für den Export. */
    public String toJson(List<Account> accounts) {
        return gson.toJson(accounts);
    }

    /** Liest eine Account-Liste aus JSON — Grundlage für den Import. */
    public List<Account> fromJson(String json) {
        Type listType = new TypeToken<ArrayList<Account>>(){}.getType();
        List<Account> accounts = gson.fromJson(json, listType);
        return accounts == null ? new ArrayList<>() : accounts;
    }

    /**
     * Legt vor einem Import eine datierte Sicherung der aktuellen Datei an.
     * Gibt den Pfad zurück oder null, wenn es nichts zu sichern gab.
     */
    public String backupCurrent() {
        try {
            if (!Files.exists(DATA_FILE)) return null;
            String stamp = java.time.LocalDateTime.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
            Path target = DATA_DIR.resolve("accounts-vor-import-" + stamp + ".json");
            Files.copy(DATA_FILE, target);
            restrictPermissions(target);
            System.out.println("[Storage] Sicherung vor Import: " + target);
            return target.toString();
        } catch (Exception e) {
            System.out.println("[Storage] Sicherung fehlgeschlagen: " + e.getMessage());
            return null;
        }
    }

    public void saveAccounts(List<Account> accounts) {
        if (lockedByPassword) {
            System.out.println("[Storage] SPEICHERN BLOCKIERT: noch nicht entsperrt.");
            return;
        }
        if (loadFailed) {
            System.out.println("[Storage] SPEICHERN BLOCKIERT: Die vorhandenen Daten "
                + "konnten nicht gelesen werden. Es wird nichts überschrieben.");
            return;
        }
        try {
            String json = gson.toJson(accounts);
            // Verschlüsseln, bevor auf die Platte geschrieben wird
            String encrypted = CryptoManager.encrypt(json);
            Files.writeString(DATA_FILE, encrypted, StandardCharsets.UTF_8);
            restrictPermissions(DATA_FILE);
            System.out.println("Accounts erfolgreich gespeichert (verschlüsselt).");
        } catch (Exception e) {
            System.out.println("Fehler beim Speichern: " + e.getMessage());
        }
    }

    // ── Freunde ───────────────────────────────────────────────────────────
    // Eigene Datei, gleiche Verschlüsselung wie accounts.json. Freunde sind
    // Account-Objekte ohne Zugangsdaten — so gelten Sync und Match-Verlauf
    // unverändert auch für sie.

    private static final Path FRIENDS_FILE = DATA_DIR.resolve("friends.json");

    /** Eigene Schutzsperre, gleiche Idee wie loadFailed bei den Accounts. */
    private boolean friendsLoadFailed = false;

    public void saveFriends(List<Account> friends) {
        if (lockedByPassword || loadFailed || friendsLoadFailed) {
            System.out.println("[Storage] Freunde nicht gespeichert: Daten gesperrt.");
            return;
        }
        try {
            String encrypted = CryptoManager.encrypt(gson.toJson(friends));
            Files.writeString(FRIENDS_FILE, encrypted, StandardCharsets.UTF_8);
            restrictPermissions(FRIENDS_FILE);
        } catch (Exception e) {
            System.out.println("[Storage] Fehler beim Speichern der Freunde: " + e.getMessage());
        }
    }

    public List<Account> loadFriends() {
        try {
            if (!Files.exists(FRIENDS_FILE)) return new ArrayList<>();
            String content = Files.readString(FRIENDS_FILE, StandardCharsets.UTF_8).trim();
            if (content.isEmpty()) return new ArrayList<>();
            List<Account> friends = fromJson(CryptoManager.decrypt(content));
            friendsLoadFailed = false;
            return friends;
        } catch (Exception e) {
            friendsLoadFailed = true;
            System.out.println("[Storage] Freunde nicht lesbar — Speichern gesperrt: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    public List<Account> loadAccounts() {
        try {
            // Quelle bestimmen: neuer Ort bevorzugt, sonst alte Orte (einmalige Übernahme)
            Path source = null;
            if (Files.exists(DATA_FILE)) {
                source = DATA_FILE;
            } else if (Files.exists(LEGACY_WORKDIR)) {
                System.out.println("[Storage] Übernehme Accounts aus altem Ort (Arbeitsverzeichnis).");
                source = LEGACY_WORKDIR;
            } else if (Files.exists(LEGACY_DESKTOP)) {
                System.out.println("[Storage] Übernehme Accounts aus altem Ort (Desktop).");
                source = LEGACY_DESKTOP;
            }

            if (source == null) {
                return new ArrayList<>();
            }

            String content = Files.readString(source, StandardCharsets.UTF_8).trim();
            if (content.isEmpty()) {
                return new ArrayList<>();
            }

            // Mit Master-Passwort geschützt, aber noch nicht entsperrt?
            // Dann sauber in den Wartezustand gehen, statt einen Fehler zu melden.
            if (CryptoManager.isPasswordProtected(content) && !CryptoManager.hasSessionPassword()) {
                lockedByPassword = true;
                System.out.println("[Storage] Daten sind mit Master-Passwort geschützt — warte auf Eingabe.");
                return new ArrayList<>();
            }

            String json;
            boolean needsResave = (source != DATA_FILE); // aus altem Ort -> neu speichern

            if (CryptoManager.isEncrypted(content)) {
                // Normalfall: verschlüsselte Datei entschlüsseln
                json = CryptoManager.decrypt(content);
                // Noch mit dem alten Schlüssel? Dann beim Speichern auf den
                // Schlüsselbund-Schlüssel umziehen.
                if (CryptoManager.needsUpgrade(content)) {
                    System.out.println("[Storage] Daten werden auf den Schlüsselbund umgestellt.");
                    needsResave = true;
                }
            } else {
                // Migration: alte Klartext-accounts.json einmalig einlesen
                System.out.println("[Storage] Klartext-Datei erkannt — wird beim "
                    + "nächsten Speichern verschlüsselt (Migration).");
                json = content;
                needsResave = true;
            }

            Type listType = new TypeToken<ArrayList<Account>>(){}.getType();
            List<Account> accounts = gson.fromJson(json, listType);
            if (accounts == null) accounts = new ArrayList<>();

            // Am neuen Ort verschlüsselt sichern (verschiebt Daten + entfernt Klartext)
            if (needsResave && !accounts.isEmpty()) {
                saveAccounts(accounts);
                System.out.println("[Storage] Accounts liegen jetzt unter: " + DATA_FILE);
            }

            loadFailed = false;
            return accounts;
        } catch (Exception e) {
            // Eine vorhandene Datei war nicht lesbar. Das ist etwas anderes als
            // "noch keine Daten da" — ab hier wird nichts mehr gespeichert,
            // damit die echten Daten unangetastet bleiben.
            loadFailed = Files.exists(DATA_FILE);
            System.out.println("Fehler beim Laden: " + e.getMessage());
            if (loadFailed) {
                System.out.println("[Storage] Vorhandene Datei nicht lesbar — "
                    + "Speichern ist gesperrt, damit nichts überschrieben wird.");
                System.out.println("[Storage] Sicherung liegt unter: " + DATA_FILE);
            }
            return new ArrayList<>();
        }
    }
}
