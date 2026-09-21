package com.valorant;

import java.util.ArrayList;
import java.util.List;

public class Account {
    private String riotName;
    private String riotTag;
    private String loginName;
    private String password;
    private String email;
    private String emailPassword;
    private String notes;

    private boolean isMain = false;
    private String puuid = "";
    private long lastCredentialsCopied = 0;

    private ValorantAPI.FullAccountInfo cachedData;
    private List<MatchSnapshot> matchHistory = new ArrayList<>();

    public record MatchSnapshot(
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

    public Account(String riotName, String riotTag, String loginName, String password, String email, String emailPassword, String notes) {
        this.riotName = riotName;
        this.riotTag = riotTag;
        this.loginName = loginName;
        this.password = password;
        this.email = email;
        this.emailPassword = emailPassword;
        this.notes = notes;
    }

    public int addNewMatches(List<MatchSnapshot> newMatches) {
        if (matchHistory == null) matchHistory = new ArrayList<>();
        java.util.Set<String> knownIds = new java.util.HashSet<>();
        for (MatchSnapshot m : matchHistory) knownIds.add(m.matchId());
        int added = 0;
        for (MatchSnapshot match : newMatches) {
            if (!knownIds.contains(match.matchId())) {
                matchHistory.add(match);
                knownIds.add(match.matchId());
                added++;
            }
        }
        matchHistory.sort((a, b) -> Long.compare(a.timestamp(), b.timestamp()));
        if (matchHistory.size() > 50) matchHistory = matchHistory.subList(matchHistory.size() - 50, matchHistory.size());
        return added;
    }

    public List<MatchSnapshot> getMatchHistory() { if (matchHistory == null) matchHistory = new ArrayList<>(); return matchHistory; }
    public void setMatchHistory(List<MatchSnapshot> matchHistory) { this.matchHistory = matchHistory; }

    public ValorantAPI.FullAccountInfo getCachedData() { return cachedData; }
    public void setCachedData(ValorantAPI.FullAccountInfo cachedData) { this.cachedData = cachedData; }

    public boolean isMain() { return isMain; }
    public void setMain(boolean main) { isMain = main; }

    public String getPuuid() { return puuid; }
    public void setPuuid(String puuid) { this.puuid = puuid; }

    public long getLastCredentialsCopied() { return lastCredentialsCopied; }
    public void setLastCredentialsCopied(long ts) { this.lastCredentialsCopied = ts; }

    public String getRiotName() { return riotName; }
    public void setRiotName(String riotName) { this.riotName = riotName; }

    public String getRiotTag() { return riotTag; }
    public void setRiotTag(String riotTag) { this.riotTag = riotTag; }

    public String getLoginName() { return loginName; }
    public void setLoginName(String loginName) { this.loginName = loginName; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getEmailPassword() { return emailPassword; }
    public void setEmailPassword(String emailPassword) { this.emailPassword = emailPassword; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
