package com.valorant;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.concurrent.*;

@SpringBootApplication
@RestController
@RequestMapping("/api")
// Bewusst KEIN @CrossOrigin mehr. Die Oberfläche spricht das Backend nicht
// mehr selbst an, sondern über den Electron-Hauptprozess (IPC). Ohne
// CORS-Freigabe kann ein Browser eine Antwort nicht auslesen — selbst wenn er
// den Port fände.
public class ApiServer {

    private final StorageManager storage = new StorageManager();
    private List<Account> accounts;
    private final ExecutorService apiExecutor = Executors.newSingleThreadExecutor();

    public static void main(String[] args) {
        SpringApplication.run(ApiServer.class, args);
        System.out.println("╔══════════════════════════════════════╗");
        System.out.println("║  VALORANT MANAGER — API SERVER       ║");
        System.out.println("║  Port wird beim Start zugeteilt      ║");
        System.out.println("╚══════════════════════════════════════╝");
    }

    @jakarta.annotation.PostConstruct
    public void init() {
        accounts = storage.loadAccounts();
        System.out.println("[Server] " + accounts.size() + " Accounts geladen.");
        if (!Config.hasApiKey()) {
            System.out.println("[Server] WARNUNG: Kein API-Key gesetzt. "
                + "Bitte im Frontend einen Henrik-API-Key hinterlegen.");
        }
    }

    // ── API-Key-Verwaltung ────────────────────────────────────────────────
    @GetMapping("/config/api-key/status")
    public ResponseEntity<ApiKeyStatus> apiKeyStatus() {
        return ResponseEntity.ok(new ApiKeyStatus(Config.hasApiKey()));
    }

    @PostMapping("/config/api-key")
    public ResponseEntity<ApiKeyStatus> setApiKey(@RequestBody ApiKeyRequest req) {
        // Erst prüfen, dann speichern — sonst merkt der Nutzer einen Tippfehler
        // erst viel später daran, dass gar keine Daten mehr geladen werden.
        ValorantAPI.KeyCheck check = ValorantAPI.validateKey(req.apiKey());
        if (!check.valid()) {
            return ResponseEntity.ok(new ApiKeyStatus(false, check.message()));
        }
        Config.setApiKey(req.apiKey());
        return ResponseEntity.ok(new ApiKeyStatus(true, check.message()));
    }

    // ── Master-Passwort (optionaler Zusatzschutz) ─────────────────────────
    // Ohne: Der Schlüssel liegt im Schlüsselbund des Geräts. Bequem, aber jedes
    //       Programm mit deinen Benutzerrechten kann ihn dort abholen.
    // Mit:  Der Schlüssel entsteht erst aus dem eingetippten Passwort und steht
    //       nirgends auf der Platte. Dafür Eingabe bei jedem Start.

    @GetMapping("/security/status")
    public ResponseEntity<SecurityStatus> securityStatus() {
        return ResponseEntity.ok(new SecurityStatus(
            storage.protectionMode(),
            storage.isPasswordLocked(),
            storage.isLocked()
        ));
    }

    @PostMapping("/security/unlock")
    public ResponseEntity<SimpleResult> unlock(@RequestBody PasswordRequest req) {
        if (req.password() == null || req.password().isEmpty()) {
            return ResponseEntity.ok(new SimpleResult(false, "Bitte das Master-Passwort eingeben."));
        }
        if (!storage.unlock(req.password())) {
            return ResponseEntity.ok(new SimpleResult(false, "Falsches Master-Passwort."));
        }
        accounts = storage.loadAccounts();
        System.out.println("[Server] Entsperrt, " + accounts.size() + " Accounts geladen.");
        return ResponseEntity.ok(new SimpleResult(true, accounts.size() + " Accounts geladen."));
    }

    @PostMapping("/security/enable-password")
    public ResponseEntity<SimpleResult> enablePassword(@RequestBody PasswordRequest req) {
        if (req.password() == null || req.password().length() < 8) {
            return ResponseEntity.ok(new SimpleResult(false,
                "Das Master-Passwort braucht mindestens 8 Zeichen."));
        }
        if ("passwort".equals(storage.protectionMode())) {
            return ResponseEntity.ok(new SimpleResult(false, "Ist bereits eingeschaltet."));
        }
        if (!storage.enablePassword(req.password(), accounts)) {
            return ResponseEntity.ok(new SimpleResult(false, "Nicht möglich — Daten sind gesperrt."));
        }
        return ResponseEntity.ok(new SimpleResult(true,
            "Master-Passwort aktiv. Ab dem nächsten Start wird danach gefragt."));
    }

    @PostMapping("/security/disable-password")
    public ResponseEntity<SimpleResult> disablePassword(@RequestBody PasswordRequest req) {
        if (!"passwort".equals(storage.protectionMode())) {
            return ResponseEntity.ok(new SimpleResult(false, "Ist gar nicht eingeschaltet."));
        }
        // Zur Sicherheit noch einmal das aktuelle Passwort verlangen
        if (req.password() == null || !storage.unlock(req.password())) {
            return ResponseEntity.ok(new SimpleResult(false, "Falsches Master-Passwort."));
        }
        if (!storage.disablePassword(accounts)) {
            return ResponseEntity.ok(new SimpleResult(false, "Nicht möglich."));
        }
        return ResponseEntity.ok(new SimpleResult(true,
            "Master-Passwort entfernt. Der Schutz hängt wieder am Gerät."));
    }

    @PostMapping("/security/change-password")
    public ResponseEntity<SimpleResult> changePassword(@RequestBody ChangePasswordRequest req) {
        if (!"passwort".equals(storage.protectionMode())) {
            return ResponseEntity.ok(new SimpleResult(false, "Es ist kein Master-Passwort gesetzt."));
        }
        if (req.newPassword() == null || req.newPassword().length() < 8) {
            return ResponseEntity.ok(new SimpleResult(false, "Das neue Passwort braucht mindestens 8 Zeichen."));
        }
        if (req.oldPassword() == null || !storage.unlock(req.oldPassword())) {
            return ResponseEntity.ok(new SimpleResult(false, "Das bisherige Passwort stimmt nicht."));
        }
        storage.enablePassword(req.newPassword(), accounts);
        return ResponseEntity.ok(new SimpleResult(true, "Master-Passwort geändert."));
    }

    // ── Export / Import ───────────────────────────────────────────────────
    // Zweck: Umzug auf einen anderen Rechner. Die normale accounts.json hängt
    // am Schlüsselbund und ist woanders nicht lesbar — der Export dagegen ist
    // mit einem selbst gewählten Passwort geschützt und damit portabel.

    @PostMapping("/export")
    public ResponseEntity<ExportResponse> exportAccounts(@RequestBody PasswordRequest req) {
        if (req.password() == null || req.password().length() < 8) {
            return ResponseEntity.ok(new ExportResponse(false,
                "Bitte ein Passwort mit mindestens 8 Zeichen wählen.", null, 0));
        }
        try {
            String json = storage.toJson(accounts);
            String blob = CryptoManager.encryptWithPassword(json, req.password());
            System.out.println("[Export] " + accounts.size() + " Accounts exportiert.");
            return ResponseEntity.ok(new ExportResponse(true,
                accounts.size() + " Accounts exportiert.", blob, accounts.size()));
        } catch (Exception e) {
            System.out.println("[Export] Fehler: " + e.getMessage());
            return ResponseEntity.ok(new ExportResponse(false, "Export fehlgeschlagen.", null, 0));
        }
    }

    @PostMapping("/import")
    public ResponseEntity<ImportResponse> importAccounts(@RequestBody ImportRequest req) {
        if (req.password() == null || req.password().isBlank()) {
            return ResponseEntity.ok(new ImportResponse(false, "Bitte das Passwort eingeben.", 0, null));
        }
        if (req.content() == null || req.content().isBlank()) {
            return ResponseEntity.ok(new ImportResponse(false, "Die Datei ist leer.", 0, null));
        }
        List<Account> imported;
        try {
            String json = CryptoManager.decryptWithPassword(req.content(), req.password());
            imported = storage.fromJson(json);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(new ImportResponse(false, e.getMessage(), 0, null));
        } catch (Exception e) {
            // GCM schlägt bei falschem Passwort fehl — das ist der häufigste Fall
            return ResponseEntity.ok(new ImportResponse(false,
                "Falsches Passwort oder beschädigte Datei.", 0, null));
        }
        if (imported.isEmpty()) {
            return ResponseEntity.ok(new ImportResponse(false,
                "Die Datei enthält keine Accounts — es wurde nichts geändert.", 0, null));
        }

        // Erst sichern, dann ersetzen. Ohne Sicherung wäre ein versehentlicher
        // Import nicht rückgängig zu machen.
        String backup = storage.backupCurrent();
        accounts.clear();
        accounts.addAll(imported);
        storage.saveAccounts(accounts);
        System.out.println("[Import] " + imported.size() + " Accounts übernommen.");
        return ResponseEntity.ok(new ImportResponse(true,
            imported.size() + " Accounts übernommen.", imported.size(), backup));
    }

    @GetMapping("/accounts")
    public ResponseEntity<List<AccountDTO>> getAccounts() {        List<AccountDTO> dtos = new java.util.ArrayList<>();
        for (int i = 0; i < accounts.size(); i++) {
            dtos.add(AccountDTO.from(accounts.get(i), i));
        }
        return ResponseEntity.ok(dtos);
    }

    @PostMapping("/accounts")
    public ResponseEntity<AccountDTO> createAccount(@RequestBody AccountCreateRequest req) {
        Account acc = new Account(
            req.riotName(), req.riotTag(),
            req.loginName(), req.password(),
            req.email(), req.emailPassword(),
            req.notes()
        );
        accounts.add(acc);
        storage.saveAccounts(accounts);
        return ResponseEntity.status(HttpStatus.CREATED).body(AccountDTO.from(acc, accounts.size() - 1));
    }

    @PutMapping("/accounts/{index}")
    public ResponseEntity<AccountDTO> updateAccount(@PathVariable int index, @RequestBody AccountCreateRequest req) {
        if (index < 0 || index >= accounts.size()) return ResponseEntity.notFound().build();
        Account acc = accounts.get(index);
        acc.setRiotName(req.riotName());
        acc.setRiotTag(req.riotTag());
        acc.setLoginName(req.loginName());
        if (req.password() != null && !req.password().isBlank()) acc.setPassword(req.password());
        if (req.email() != null) acc.setEmail(req.email());
        if (req.emailPassword() != null && !req.emailPassword().isBlank()) acc.setEmailPassword(req.emailPassword());
        if (req.notes() != null) acc.setNotes(req.notes());
        storage.saveAccounts(accounts);
        return ResponseEntity.ok(AccountDTO.from(acc, index));
    }

    @DeleteMapping("/accounts/{index}")
    public ResponseEntity<Void> deleteAccount(@PathVariable int index) {
        if (index < 0 || index >= accounts.size()) return ResponseEntity.notFound().build();
        accounts.remove(index);
        storage.saveAccounts(accounts);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/accounts/{index}/sync")
    public ResponseEntity<SyncResponse> syncAccount(@PathVariable int index) {
        if (index < 0 || index >= accounts.size()) return ResponseEntity.notFound().build();
        Account acc = accounts.get(index);
        try {
            Future<ValorantAPI.FullAccountInfo> future = apiExecutor.submit(() ->
                ValorantAPI.getFullData(acc.getRiotName(), acc.getRiotTag())
            );
            ValorantAPI.FullAccountInfo info = future.get(30, TimeUnit.SECONDS);
            if (info != null) {
                acc.setCachedData(info);
                if (info.puuid() != null && !info.puuid().isEmpty()) acc.setPuuid(info.puuid());

                // Neue Matches hinzufügen — Duplikate werden automatisch übersprungen
                if (info.matchHistory() != null && !info.matchHistory().isEmpty()) {
                    List<Account.MatchSnapshot> snapshots = info.matchHistory().stream()
                        .map(m -> new Account.MatchSnapshot(
                            m.matchId(), m.rankName(), m.rr(),
                            m.rrChange(), m.result(), m.rankImageUrl(), m.timestamp(),
                            m.kills(), m.deaths(), m.assists()
                        )).toList();

                    int newMatches = acc.addNewMatches(snapshots);
                    System.out.println("[Sync] " + newMatches + " neue Matches für " + acc.getRiotName());
                }

                storage.saveAccounts(accounts);
                return ResponseEntity.ok(new SyncResponse(true, "Erfolgreich", info));
            }
        } catch (TimeoutException e) {
            return ResponseEntity.ok(new SyncResponse(false, "Timeout", null));
        } catch (Exception e) {
            System.out.println("[Sync] Fehler: " + e.getMessage());
        }
        return ResponseEntity.ok(new SyncResponse(false, "Sync fehlgeschlagen", null));
    }

    @PostMapping("/accounts/{index}/main")
    public ResponseEntity<Void> setMain(@PathVariable int index) {
        if (index < 0 || index >= accounts.size()) return ResponseEntity.notFound().build();
        for (int i = 0; i < accounts.size(); i++) accounts.get(i).setMain(i == index);
        storage.saveAccounts(accounts);
        return ResponseEntity.ok().build();
    }

    // POST statt GET: der Aufruf verändert etwas (Zeitstempel wird gespeichert),
    // und abrufende Anfragen sollen nichts verändern.
    @PostMapping("/accounts/{index}/credentials")
    public ResponseEntity<CredentialsDTO> getCredentials(@PathVariable int index) {
        if (index < 0 || index >= accounts.size()) return ResponseEntity.notFound().build();
        Account acc = accounts.get(index);
        // Timestamp setzen wenn Credentials abgerufen werden
        acc.setLastCredentialsCopied(System.currentTimeMillis());
        storage.saveAccounts(accounts);
        System.out.println("[Credentials] Kopiert für: " + acc.getRiotName());
        return ResponseEntity.ok(new CredentialsDTO(
            acc.getLoginName(), acc.getPassword(),
            acc.getEmail(), acc.getEmailPassword(), acc.getNotes()
        ));
    }

    public record AccountDTO(
        int index, String riotName, String riotTag, String loginName,
        boolean isMain, String puuid, ValorantAPI.FullAccountInfo cachedData,
        List<Account.MatchSnapshot> matchHistory, long lastCredentialsCopied
    ) {
        public static AccountDTO from(Account acc, int index) {
            return new AccountDTO(index, acc.getRiotName(), acc.getRiotTag(),
                acc.getLoginName(), acc.isMain(), acc.getPuuid(),
                acc.getCachedData(), acc.getMatchHistory(), acc.getLastCredentialsCopied());
        }
    }

    public record AccountCreateRequest(String riotName, String riotTag, String loginName,
                                        String password, String email, String emailPassword, String notes) {}
    public record SyncResponse(boolean success, String message, ValorantAPI.FullAccountInfo data) {}
    public record CredentialsDTO(String loginName, String password,
                                  String email, String emailPassword, String notes) {}
    public record ApiKeyStatus(boolean configured, String message) {
        public ApiKeyStatus(boolean configured) { this(configured, null); }
    }
    public record ApiKeyRequest(String apiKey) {}
    public record PasswordRequest(String password) {}
    public record ChangePasswordRequest(String oldPassword, String newPassword) {}
    public record SimpleResult(boolean success, String message) {}
    public record SecurityStatus(String mode, boolean locked, boolean broken) {}
    public record ExportResponse(boolean success, String message, String content, int count) {}
    public record ImportRequest(String password, String content) {}
    public record ImportResponse(boolean success, String message, int count, String backupPath) {}
}
