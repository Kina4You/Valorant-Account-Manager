package com.valorant;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Verwaltet die lokale Konfiguration (v.a. den Henrik-API-Key).
 * Datei liegt unter ~/.valorant-manager/config.json — NICHT im Projektordner,
 * damit sie nicht versehentlich in Git/in die .jar wandert.
 */
public class Config {

    private static final Path CONFIG_DIR =
        Paths.get(System.getProperty("user.home"), ".valorant-manager");
    private static final Path CONFIG_FILE = CONFIG_DIR.resolve("config.json");

    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    // In-Memory Cache, damit nicht bei jedem Request die Datei gelesen wird
    private static String cachedApiKey = null;

    /** Liefert den gespeicherten API-Key oder null, wenn noch keiner gesetzt ist. */
    public static synchronized String getApiKey() {
        if (cachedApiKey != null) return cachedApiKey;
        try {
            if (!Files.exists(CONFIG_FILE)) return null;
            String content = Files.readString(CONFIG_FILE);
            JsonObject obj = gson.fromJson(content, JsonObject.class);
            if (obj != null && obj.has("apiKey")) {
                String key = obj.get("apiKey").getAsString();
                if (key != null && !key.isBlank()) {
                    cachedApiKey = key.trim();
                    return cachedApiKey;
                }
            }
        } catch (Exception e) {
            System.out.println("[Config] Fehler beim Laden: " + e.getMessage());
        }
        return null;
    }

    /** Speichert den API-Key lokal. */
    public static synchronized void setApiKey(String apiKey) {
        try {
            Files.createDirectories(CONFIG_DIR);
            JsonObject obj = new JsonObject();
            obj.addProperty("apiKey", apiKey.trim());
            Files.writeString(CONFIG_FILE, gson.toJson(obj));

            // Nur der Besitzer darf lesen/schreiben — auch unter Windows
            FilePermissions.ownerOnly(CONFIG_FILE);

            cachedApiKey = apiKey.trim();
            System.out.println("[Config] API-Key gespeichert.");
        } catch (Exception e) {
            System.out.println("[Config] Fehler beim Speichern: " + e.getMessage());
        }
    }

    /** True, wenn ein nutzbarer API-Key vorhanden ist. */
    public static boolean hasApiKey() {
        String key = getApiKey();
        return key != null && !key.isBlank();
    }
}
