package com.valorant;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class ValorantAPI {

    private static final String DEFAULT_REGION = "eu";

    public record AgentInfo(String name, String iconUrl, int count) {}

    public record FullAccountInfo(
        String rankName, String rankImageUrl, int level, String cardImageUrl,
        List<String> lastGames, int rr, List<AgentInfo> topAgents, String puuid,
        List<MatchEntry> matchHistory,
        double avgKills, double avgDeaths, double avgAssists, double kdaRatio
    ) {}

    public record MatchEntry(
        String matchId,
        String rankName,
        int rr,
        int rrChange,
        String result,
        String rankImageUrl,
        long timestamp,
        int kills,
        int deaths,
        int assists
    ) {}

    /** Ergebnis einer Key-Prüfung: gültig ja/nein plus Klartext-Begründung fürs Frontend. */
    public record KeyCheck(boolean valid, String message) {}

    /**
     * Prüft einen API-Key, BEVOR er gespeichert wird.
     *
     * Ablauf: erst die Form (billig, fängt Tippfehler und falsch eingefügten Text ab),
     * dann ein echter Aufruf gegen Henrik. Nur eine eindeutige Ablehnung (401/403)
     * gilt als ungültig — bei Netzproblemen wird der Key angenommen, damit niemand
     * ohne Internet aus seiner eigenen App ausgesperrt wird.
     */
    public static KeyCheck validateKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return new KeyCheck(false, "Kein Key eingegeben.");
        }
        String key = apiKey.trim();
        if (!key.startsWith("HDEV-")) {
            return new KeyCheck(false, "Ein Henrik-Key beginnt mit \"HDEV-\". Bitte den ganzen Key einfügen.");
        }
        if (key.length() < 20) {
            return new KeyCheck(false, "Der Key sieht unvollständig aus.");
        }

        try {
            // Beliebiger authentifizierter Endpunkt. Uns interessiert nur, ob der
            // Key abgelehnt wird — nicht, ob der abgefragte Spieler existiert.
            String url = "https://api.henrikdev.xyz/valorant/v1/account/Henrik3/EUW3";
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", key)
                .timeout(java.time.Duration.ofSeconds(10))
                .GET().build();

            HttpResponse<String> res = HttpClient.newHttpClient()
                .send(req, HttpResponse.BodyHandlers.ofString());

            int code = res.statusCode();
            if (code == 401 || code == 403) {
                return new KeyCheck(false, "Henrik hat den Key abgelehnt. Bitte prüfen.");
            }
            if (code == 429) {
                return new KeyCheck(false, "Zu viele Anfragen an Henrik. Bitte kurz warten.");
            }
            return new KeyCheck(true, "Key geprüft und gespeichert.");

        } catch (Exception e) {
            System.out.println("[ValorantAPI] Key-Prüfung nicht möglich: " + e.getMessage());
            return new KeyCheck(true, "Key gespeichert (ohne Online-Prüfung — keine Verbindung zu Henrik).");
        }
    }

    public static FullAccountInfo getFullData(String riotName, String riotTag) {
        String apiKey = Config.getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            System.out.println("[ValorantAPI] Kein API-Key gesetzt.");
            return new FullAccountInfo("Kein API-Key", null, 0, null,
                new ArrayList<>(), 0, new ArrayList<>(), "", new ArrayList<>(),
                0, 0, 0, 0);
        }
        try {
            String safeName = riotName.replace(" ", "%20");
            String safeTag = riotTag.replace(" ", "%20");

            HttpClient client = HttpClient.newHttpClient();
            Gson gson = new Gson();

            // ──────────────────────────────────────────────────────────────────
            // REQUEST 1 (parallel): /v1/account — Level, Card, PUUID, Region
            // Zuverlässig auch bei inaktiven Accounts ohne aktuelle Matches
            // ──────────────────────────────────────────────────────────────────
            CompletableFuture<HttpResponse<String>> accountFuture = CompletableFuture.supplyAsync(() -> {
                try {
                    String url = "https://api.henrikdev.xyz/valorant/v1/account/" + safeName + "/" + safeTag;
                    HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url))
                        .header("Authorization", apiKey).GET().build();
                    return client.send(req, HttpResponse.BodyHandlers.ofString());
                } catch (Exception e) { throw new RuntimeException(e); }
            });

            // ──────────────────────────────────────────────────────────────────
            // REQUEST 2 (parallel): /v1/mmr-history — Rang, RR, Match-History
            // Ersetzt den alten separaten /mmr Request komplett
            // ──────────────────────────────────────────────────────────────────
            CompletableFuture<HttpResponse<String>> mmrHistFuture = CompletableFuture.supplyAsync(() -> {
                try {
                    String url = "https://api.henrikdev.xyz/valorant/v1/mmr-history/"
                        + DEFAULT_REGION + "/" + safeName + "/" + safeTag;
                    HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url))
                        .header("Authorization", apiKey).GET().build();
                    return client.send(req, HttpResponse.BodyHandlers.ofString());
                } catch (Exception e) { throw new RuntimeException(e); }
            });

            // ──────────────────────────────────────────────────────────────────
            // REQUEST 3 (parallel): /v3/matches — Top Agents aus letzten 10 Matches
            // ──────────────────────────────────────────────────────────────────
            CompletableFuture<HttpResponse<String>> matchesFuture = CompletableFuture.supplyAsync(() -> {
                try {
                    String url = "https://api.henrikdev.xyz/valorant/v3/matches/"
                        + DEFAULT_REGION + "/" + safeName + "/" + safeTag + "?size=10";
                    HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url))
                        .header("Authorization", apiKey).GET().build();
                    return client.send(req, HttpResponse.BodyHandlers.ofString());
                } catch (Exception e) { throw new RuntimeException(e); }
            });

            // Alle 3 parallel abwarten
            CompletableFuture.allOf(accountFuture, mmrHistFuture, matchesFuture).join();

            HttpResponse<String> accountRes = accountFuture.get();
            HttpResponse<String> mmrHistRes = mmrHistFuture.get();
            HttpResponse<String> matchesRes = matchesFuture.get();

            // ── Ergebnisse aus REQUEST 1: /v1/account ────────────────────────
            int level = 0;
            String cardUrl = null;
            String puuid = "";
            String region = DEFAULT_REGION;

            if (accountRes.statusCode() == 200) {
                JsonObject accJson = gson.fromJson(accountRes.body(), JsonObject.class);
                if (accJson.has("data")) {
                    JsonObject data = accJson.getAsJsonObject("data");
                    if (data.has("account_level")) level = data.get("account_level").getAsInt();
                    if (data.has("card") && data.getAsJsonObject("card").has("small"))
                        cardUrl = data.getAsJsonObject("card").get("small").getAsString();
                    if (data.has("puuid")) puuid = data.get("puuid").getAsString();
                    if (data.has("region")) region = data.get("region").getAsString();
                }
            }

            // ── Ergebnisse aus REQUEST 2: /v1/mmr-history ────────────────────
            String rankName = "Unranked";
            String rankImageUrl = null;
            int rr = 0;
            List<String> lastGames = new ArrayList<>();
            List<MatchEntry> matchHistory = new ArrayList<>();

            if (mmrHistRes.statusCode() == 200) {
                JsonObject histJson = gson.fromJson(mmrHistRes.body(), JsonObject.class);
                if (histJson.has("data")) {
                    JsonArray dataArr = histJson.getAsJsonArray("data");
                    int limit = Math.min(dataArr.size(), 20);

                    for (int i = 0; i < limit; i++) {
                        JsonObject match = dataArr.get(i).getAsJsonObject();

                        String matchId = match.has("match_id") ? match.get("match_id").getAsString() : "";

                        int rrChange = 0;
                        String result = "D";
                        if (match.has("mmr_change_to_last_game")) {
                            rrChange = match.get("mmr_change_to_last_game").getAsInt();
                            if (rrChange > 0) result = "W";
                            else if (rrChange < 0) result = "L";
                        }

                        String matchRank = match.has("currenttierpatched") ? match.get("currenttierpatched").getAsString() : "";
                        int matchRR = match.has("ranking_in_tier") ? match.get("ranking_in_tier").getAsInt() : 0;
                        String matchRankImg = "";
                        if (match.has("images") && match.getAsJsonObject("images").has("small"))
                            matchRankImg = match.getAsJsonObject("images").get("small").getAsString();

                        long timestamp = System.currentTimeMillis() - (i * 3600000L);
                        if (match.has("date_raw")) timestamp = match.get("date_raw").getAsLong() * 1000L;

                        // Aktueller Rang = neuester Eintrag (Index 0)
                        if (i == 0) {
                            rankName = matchRank.isEmpty() ? "Unranked" : matchRank;
                            rankImageUrl = matchRankImg.isEmpty() ? null : matchRankImg;
                            rr = matchRR;
                        }

                        if (i < 10) lastGames.add(result);

                        if (!matchId.isEmpty()) {
                            matchHistory.add(new MatchEntry(matchId, matchRank, matchRR, rrChange, result, matchRankImg, timestamp, 0, 0, 0));
                        }
                    }
                    Collections.reverse(lastGames);
                    Collections.reverse(matchHistory); // Älteste zuerst
                }
            } else if (mmrHistRes.statusCode() == 404) {
                rankName = "Spieler nicht gefunden";
            }

            // ── Ergebnisse aus REQUEST 3: /v3/matches — Top Agents + KDA ─────
            List<AgentInfo> topAgents = new ArrayList<>();
            double avgKills = 0, avgDeaths = 0, avgAssists = 0, kdaRatio = 0;

            if (matchesRes.statusCode() == 200 && !puuid.isEmpty()) {
                JsonObject matchJson = gson.fromJson(matchesRes.body(), JsonObject.class);
                if (matchJson.has("data")) {
                    JsonArray dataArr = matchJson.getAsJsonArray("data");
                    Map<String, Integer> agentCounts = new HashMap<>();
                    Map<String, String> agentImages = new HashMap<>();

                    // KDA pro matchId sammeln, um sie später den MatchEntries zuzuordnen
                    Map<String, int[]> kdaByMatchId = new HashMap<>(); // [kills, deaths, assists]
                    long totalKills = 0, totalDeaths = 0, totalAssists = 0;
                    int gamesWithStats = 0;

                    for (int i = 0; i < dataArr.size(); i++) {
                        JsonObject match = dataArr.get(i).getAsJsonObject();

                        // matchId dieses Matches (für Zuordnung zur MatchEntry-Liste)
                        String thisMatchId = "";
                        if (match.has("metadata") && match.getAsJsonObject("metadata").has("matchid"))
                            thisMatchId = match.getAsJsonObject("metadata").get("matchid").getAsString();

                        if (match.has("players") && match.getAsJsonObject("players").has("all_players")) {
                            JsonArray players = match.getAsJsonObject("players").getAsJsonArray("all_players");
                            for (int p = 0; p < players.size(); p++) {
                                JsonObject player = players.get(p).getAsJsonObject();
                                if (player.has("puuid") && player.get("puuid").getAsString().equals(puuid)) {
                                    if (player.has("character")) {
                                        String agentName = player.get("character").getAsString();
                                        String agentImage = "";
                                        if (player.has("assets") && player.getAsJsonObject("assets").has("agent")
                                                && player.getAsJsonObject("assets").getAsJsonObject("agent").has("small")) {
                                            agentImage = player.getAsJsonObject("assets").getAsJsonObject("agent").get("small").getAsString();
                                        }
                                        agentCounts.put(agentName, agentCounts.getOrDefault(agentName, 0) + 1);
                                        agentImages.put(agentName, agentImage);
                                    }

                                    // ── KDA aus stats ziehen ──────────────────────
                                    if (player.has("stats")) {
                                        JsonObject stats = player.getAsJsonObject("stats");
                                        int k = stats.has("kills")   ? stats.get("kills").getAsInt()   : 0;
                                        int d = stats.has("deaths")  ? stats.get("deaths").getAsInt()  : 0;
                                        int a = stats.has("assists") ? stats.get("assists").getAsInt() : 0;

                                        if (!thisMatchId.isEmpty()) {
                                            kdaByMatchId.put(thisMatchId, new int[]{k, d, a});
                                        }
                                        totalKills += k;
                                        totalDeaths += d;
                                        totalAssists += a;
                                        gamesWithStats++;
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    // Durchschnitte berechnen
                    if (gamesWithStats > 0) {
                        avgKills   = (double) totalKills   / gamesWithStats;
                        avgDeaths  = (double) totalDeaths  / gamesWithStats;
                        avgAssists = (double) totalAssists / gamesWithStats;
                        // KDA-Ratio: (Kills + Assists) / Deaths. Deaths=0 → wie 1 behandeln (Perfekt-Spiel)
                        double deathsForRatio = totalDeaths == 0 ? 1 : totalDeaths;
                        kdaRatio = (totalKills + totalAssists) / deathsForRatio;
                    }

                    // KDA in die bestehenden MatchEntries einbauen (über matchId-Match)
                    for (int idx = 0; idx < matchHistory.size(); idx++) {
                        MatchEntry me = matchHistory.get(idx);
                        int[] kda = kdaByMatchId.get(me.matchId());
                        if (kda != null) {
                            matchHistory.set(idx, new MatchEntry(
                                me.matchId(), me.rankName(), me.rr(), me.rrChange(),
                                me.result(), me.rankImageUrl(), me.timestamp(),
                                kda[0], kda[1], kda[2]
                            ));
                        }
                    }


                    List<Map.Entry<String, Integer>> sortedAgents = new ArrayList<>(agentCounts.entrySet());
                    sortedAgents.sort((a, b) -> b.getValue().compareTo(a.getValue()));
                    for (int i = 0; i < Math.min(3, sortedAgents.size()); i++) {
                        String name = sortedAgents.get(i).getKey();
                        topAgents.add(new AgentInfo(name, agentImages.get(name), sortedAgents.get(i).getValue()));
                    }
                }
            }

            return new FullAccountInfo(rankName, rankImageUrl, level, cardUrl, lastGames, rr, topAgents, puuid, matchHistory,
                avgKills, avgDeaths, avgAssists, kdaRatio);

        } catch (Exception e) {
            System.out.println("[ValorantAPI] Fehler: " + e.getMessage());
            return new FullAccountInfo("Verbindungsfehler", null, 0, null, new ArrayList<>(), 0, new ArrayList<>(), "", new ArrayList<>(),
                0, 0, 0, 0);
        }
    }
}
