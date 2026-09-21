package com.valorant;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * App-gebundene Verschlüsselung der accounts.json.
 *
 * Schützt gegen: jemand kopiert nur die accounts.json (Cloud-Sync, USB, Backup).
 * Schützt NICHT gegen: jemand der die App selbst hat und decompiliert — das ist
 * prinzipbedingt nicht möglich, wenn die App ohne User-Passwort entschlüsseln soll.
 *
 * Verfahren: AES-256-GCM. Der Schlüssel wird zur Laufzeit per PBKDF2 aus mehreren
 * im Code verteilten Bausteinen abgeleitet, damit kein fertiger Schlüssel als
 * Klartext-String in der .jar steht (kein `strings`-Treffer).
 */
public class CryptoManager {

    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_LENGTH = 12;          // GCM-Standard: 12 Byte
    private static final int KEY_LENGTH = 256;        // AES-256
    private static final int PBKDF2_ITERATIONS = 65_536;

    // Marker am Dateianfang. Zwei Generationen, damit beim Lesen eindeutig ist,
    // welcher Schlüssel gilt — und ein Schlüssel nie auf fremde Daten angewendet wird.
    //   VMENC1 = alter, fest im Code stehender Schlüssel
    //   VMENC2 = Schlüssel aus dem Schlüsselbund des Betriebssystems
    //   VMENC3 = Schlüssel aus dem Master-Passwort des Nutzers
    static final String MAGIC = "VMENC1:";
    static final String MAGIC_V2 = "VMENC2:";
    static final String MAGIC_V3 = "VMENC3:";

    /**
     * Master-Passwort der laufenden Sitzung. Wird beim Entsperren gesetzt und
     * NIRGENDS gespeichert — weder auf der Platte noch im Schlüsselbund.
     * Genau das ist der Unterschied zum Schlüsselbund-Verfahren: Windows kann
     * diesen Schlüssel nicht herausgeben, weil es ihn nicht kennt.
     */
    private static volatile char[] sessionPassword = null;

    public static void setSessionPassword(String pw) {
        sessionPassword = pw == null ? null : pw.toCharArray();
    }

    public static void clearSessionPassword() {
        if (sessionPassword != null) java.util.Arrays.fill(sessionPassword, '\0');
        sessionPassword = null;
    }

    public static boolean hasSessionPassword() {
        return sessionPassword != null && sessionPassword.length > 0;
    }

    /**
     * Schlüssel aus dem OS-Schlüsselbund, den Electron beim Start übergibt.
     * Fehlt er (Start ohne Electron), bleibt nur der alte Weg.
     */
    private static final String MASTER_KEY = System.getenv("VM_MASTER_KEY");

    public static boolean hasMasterKey() {
        return MASTER_KEY != null && !MASTER_KEY.isBlank();
    }

    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * Leitet den App-Schlüssel ab. Die Bausteine sind absichtlich verteilt und
     * werden erst zur Laufzeit kombiniert — kein zusammenhängender Schlüssel im Code.
     */
    private static SecretKeySpec deriveKey() throws Exception {
        // Baustein 1 + 2 + 3: getrennte Teile, zur Laufzeit verkettet
        char[] passphrase = (part(1) + part(2) + part(3)).toCharArray();
        // Statisches Salt (auch verteilt). Salt muss nicht geheim sein, nur konstant.
        byte[] salt = (part(3) + part(1)).getBytes(StandardCharsets.UTF_8);
        return stretch(passphrase, salt);
    }

    /**
     * Schlüssel aus dem Schlüsselbund-Geheimnis. Dieses steht nirgends im Code —
     * es liegt im Schlüsselbund des Betriebssystems und wird nur an diesen
     * Prozess weitergereicht.
     */
    private static SecretKeySpec deriveMasterKey() throws Exception {
        if (!hasMasterKey()) {
            throw new IllegalStateException(
                "Diese Daten brauchen den Schlüssel aus dem Schlüsselbund. "
                + "Bitte die App über den Valorant Manager starten.");
        }
        byte[] salt = "valorant-manager-v2".getBytes(StandardCharsets.UTF_8);
        return stretch(MASTER_KEY.toCharArray(), salt);
    }

    private static SecretKeySpec stretch(char[] passphrase, byte[] salt) throws Exception {
        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        PBEKeySpec spec = new PBEKeySpec(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH);
        byte[] keyBytes = factory.generateSecret(spec).getEncoded();
        spec.clearPassword();
        return new SecretKeySpec(keyBytes, "AES");
    }

    // Schlüssel-Bausteine. Bewusst getrennt und unscheinbar benannt.
    private static String part(int n) {
        return switch (n) {
            case 1 -> "vM-7f3a9c";
            case 2 -> "Q1xR8tLpZ4";
            case 3 -> "kE2nB6wH0s";
            default -> "";
        };
    }

    /**
     * Verschlüsselt einen Klartext-String.
     * Nimmt automatisch den Schlüsselbund-Schlüssel, wenn einer da ist —
     * sonst den alten. Das Präfix hält fest, welcher es war.
     */
    public static String encrypt(String plaintext) throws Exception {
        // Master-Passwort hat Vorrang: wenn der Nutzer es eingeschaltet hat,
        // soll der Schlüsselbund gar nicht mehr zum Zug kommen.
        if (hasSessionPassword()) {
            byte[] salt = new byte[SALT_LENGTH];
            RANDOM.nextBytes(salt);
            return MAGIC_V3 + seal(plaintext, stretch(sessionPassword, salt), salt);
        }
        if (hasMasterKey()) {
            return MAGIC_V2 + seal(plaintext, deriveMasterKey());
        }
        return MAGIC + seal(plaintext, deriveKey());
    }

    /** Wie seal(), stellt dem Ergebnis aber das Salt voran (nur für V3 nötig). */
    private static String seal(String plaintext, SecretKeySpec key, byte[] salt) throws Exception {
        byte[] iv = new byte[IV_LENGTH];
        RANDOM.nextBytes(iv);
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        byte[] combined = new byte[salt.length + iv.length + ct.length];
        System.arraycopy(salt, 0, combined, 0, salt.length);
        System.arraycopy(iv, 0, combined, salt.length, iv.length);
        System.arraycopy(ct, 0, combined, salt.length + iv.length, ct.length);
        return Base64.getEncoder().encodeToString(combined);
    }

    /** Entschlüsselt eine V3-Datei mit einem gegebenen Passwort. */
    private static String openV3(String payload, char[] password) throws Exception {
        byte[] combined = Base64.getDecoder().decode(payload);
        if (combined.length <= SALT_LENGTH + IV_LENGTH) {
            throw new IllegalArgumentException("Datei ist unvollständig.");
        }
        byte[] salt = new byte[SALT_LENGTH];
        byte[] iv = new byte[IV_LENGTH];
        byte[] ct = new byte[combined.length - SALT_LENGTH - IV_LENGTH];
        System.arraycopy(combined, 0, salt, 0, SALT_LENGTH);
        System.arraycopy(combined, SALT_LENGTH, iv, 0, IV_LENGTH);
        System.arraycopy(combined, SALT_LENGTH + IV_LENGTH, ct, 0, ct.length);

        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, stretch(password, salt), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
    }

    /** Prüft ein Passwort gegen eine V3-Datei, ohne die Sitzung zu verändern. */
    public static String decryptWithSessionCandidate(String stored, String password) throws Exception {
        if (!stored.startsWith(MAGIC_V3)) {
            throw new IllegalArgumentException("Datei ist nicht mit einem Master-Passwort geschützt.");
        }
        return openV3(stored.substring(MAGIC_V3.length()), password.toCharArray());
    }

    private static String seal(String plaintext, SecretKeySpec key) throws Exception {
        byte[] iv = new byte[IV_LENGTH];
        RANDOM.nextBytes(iv);

        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        // IV vor den Ciphertext stellen (IV muss nicht geheim sein)
        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return Base64.getEncoder().encodeToString(combined);
    }

    /**
     * Entschlüsselt einen mit encrypt() erzeugten String.
     * Das Präfix entscheidet, welcher Schlüssel genommen wird — so wird nie
     * der falsche probiert und eine Fehlermeldung bleibt aussagekräftig.
     */
    public static String decrypt(String stored) throws Exception {
        final SecretKeySpec key;
        final String payload;

        if (stored.startsWith(MAGIC_V3)) {
            if (!hasSessionPassword()) {
                throw new IllegalStateException(
                    "Diese Daten sind mit einem Master-Passwort geschützt. Bitte entsperren.");
            }
            return openV3(stored.substring(MAGIC_V3.length()), sessionPassword);
        }
        if (stored.startsWith(MAGIC_V2)) {
            key = deriveMasterKey();
            payload = stored.substring(MAGIC_V2.length());
        } else if (stored.startsWith(MAGIC)) {
            key = deriveKey();
            payload = stored.substring(MAGIC.length());
        } else {
            throw new IllegalArgumentException("Daten sind nicht im erwarteten Format.");
        }

        byte[] combined = Base64.getDecoder().decode(payload);
        byte[] iv = new byte[IV_LENGTH];
        byte[] ciphertext = new byte[combined.length - IV_LENGTH];
        System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
        System.arraycopy(combined, IV_LENGTH, ciphertext, 0, ciphertext.length);

        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] plain = cipher.doFinal(ciphertext);
        return new String(plain, StandardCharsets.UTF_8);
    }

    // ── Export / Import ──────────────────────────────────────────────────
    // Bewusst NICHT an den Schlüsselbund gebunden: eine Exportdatei muss auf
    // einem anderen Rechner zu öffnen sein. Stattdessen ein Passwort, das der
    // Nutzer vergibt. Das Salt ist je Export zufällig und steht mit in der Datei.

    static final String MAGIC_EXPORT = "VMEXPORT1:";
    private static final int SALT_LENGTH = 16;

    /** Verschlüsselt für den Export mit einem vom Nutzer gewählten Passwort. */
    public static String encryptWithPassword(String plaintext, String password) throws Exception {
        byte[] salt = new byte[SALT_LENGTH];
        RANDOM.nextBytes(salt);
        SecretKeySpec key = stretch(password.toCharArray(), salt);

        byte[] iv = new byte[IV_LENGTH];
        RANDOM.nextBytes(iv);
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        // Reihenfolge in der Datei: Salt, dann IV, dann Inhalt
        byte[] combined = new byte[salt.length + iv.length + ciphertext.length];
        System.arraycopy(salt, 0, combined, 0, salt.length);
        System.arraycopy(iv, 0, combined, salt.length, iv.length);
        System.arraycopy(ciphertext, 0, combined, salt.length + iv.length, ciphertext.length);

        return MAGIC_EXPORT + Base64.getEncoder().encodeToString(combined);
    }

    /** Öffnet eine Exportdatei wieder. Falsches Passwort führt zu einer Ausnahme. */
    public static String decryptWithPassword(String stored, String password) throws Exception {
        String trimmed = stored.trim();
        if (!trimmed.startsWith(MAGIC_EXPORT)) {
            throw new IllegalArgumentException("Das ist keine Exportdatei des Valorant Managers.");
        }
        byte[] combined = Base64.getDecoder().decode(trimmed.substring(MAGIC_EXPORT.length()));
        if (combined.length <= SALT_LENGTH + IV_LENGTH) {
            throw new IllegalArgumentException("Exportdatei ist unvollständig.");
        }

        byte[] salt = new byte[SALT_LENGTH];
        byte[] iv = new byte[IV_LENGTH];
        byte[] ciphertext = new byte[combined.length - SALT_LENGTH - IV_LENGTH];
        System.arraycopy(combined, 0, salt, 0, SALT_LENGTH);
        System.arraycopy(combined, SALT_LENGTH, iv, 0, IV_LENGTH);
        System.arraycopy(combined, SALT_LENGTH + IV_LENGTH, ciphertext, 0, ciphertext.length);

        SecretKeySpec key = stretch(password.toCharArray(), salt);
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        // Bei falschem Passwort schlägt GCM hier fehl — genau so soll es sein
        byte[] plain = cipher.doFinal(ciphertext);
        return new String(plain, StandardCharsets.UTF_8);
    }

    /** True, wenn der Inhalt bereits verschlüsselt ist (für Migration von Klartext). */
    public static boolean isEncrypted(String content) {
        return content != null && (content.startsWith(MAGIC)
            || content.startsWith(MAGIC_V2) || content.startsWith(MAGIC_V3));
    }

    /** True, wenn diese Daten nur mit dem Master-Passwort zu öffnen sind. */
    public static boolean isPasswordProtected(String content) {
        return content != null && content.startsWith(MAGIC_V3);
    }

    /** True, wenn der Inhalt noch mit dem alten Schlüssel liegt und umgezogen werden sollte. */
    public static boolean needsUpgrade(String content) {
        // Nur der alte Code-Schlüssel wird automatisch abgelöst. V3 bleibt V3 —
        // dort entscheidet ausschliesslich der Nutzer über den Wechsel.
        return content != null && content.startsWith(MAGIC)
            && hasMasterKey() && !hasSessionPassword();
    }
}
