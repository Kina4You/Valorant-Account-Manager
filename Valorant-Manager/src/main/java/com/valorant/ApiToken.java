package com.valorant;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

/**
 * Gemeinsames Geheimnis zwischen Electron und diesem Backend.
 *
 * Warum: Der Server lauscht auf localhost ohne Anmeldung. Ohne Token könnte
 * jede beliebige Webseite im Browser des Nutzers die Zugangsdaten auslesen
 * (CORS steht auf "*"). Mit Token scheitert das — eine fremde Seite kennt es nicht.
 *
 * Herkunft des Tokens:
 *  1. Umgebungsvariable VM_API_TOKEN — so startet Electron das Backend.
 *  2. Kein Token gesetzt (z. B. Start aus IntelliJ): es wird eines erzeugt und
 *     nach ~/.valorant-manager/session-token geschrieben (Rechte 600).
 *     Der Schutz bleibt damit in JEDEM Fall aktiv, nie stillschweigend offen.
 */
public final class ApiToken {

    private static final Path TOKEN_FILE =
        Paths.get(System.getProperty("user.home"), ".valorant-manager", "session-token");

    private static final String token = resolve();

    private ApiToken() { }

    private static String resolve() {
        String fromEnv = System.getenv("VM_API_TOKEN");
        if (fromEnv != null && !fromEnv.isBlank()) {
            System.out.println("[Auth] Token von Electron übernommen.");
            return fromEnv.trim();
        }

        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        String generated = HexFormat.of().formatHex(raw);
        try {
            Files.createDirectories(TOKEN_FILE.getParent());
            Files.writeString(TOKEN_FILE, generated, StandardCharsets.UTF_8);
            FilePermissions.ownerOnly(TOKEN_FILE);
            System.out.println("[Auth] Kein VM_API_TOKEN gesetzt — eigenes Token erzeugt: " + TOKEN_FILE);
        } catch (Exception e) {
            System.out.println("[Auth] Token konnte nicht geschrieben werden: " + e.getMessage());
        }
        return generated;
    }

    /** Zeitkonstanter Vergleich, damit sich das Token nicht Zeichen für Zeichen erraten lässt. */
    public static boolean matches(String candidate) {
        if (candidate == null) return false;
        return MessageDigest.isEqual(
            candidate.trim().getBytes(StandardCharsets.UTF_8),
            token.getBytes(StandardCharsets.UTF_8));
    }
}
