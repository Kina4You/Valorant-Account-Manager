import { useState, useEffect, useCallback } from "react";
import * as api from "./api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── Rank → Hex-Farbe ───────────────────────────────
function rankColor(rank) {
  if (!rank) return "#ffffff";
  const r = rank.toLowerCase();
  if (r.includes("iron"))      return "#5a5a5a";
  if (r.includes("bronze"))    return "#cd7f32";
  if (r.includes("silver"))    return "#c0c0c0";
  if (r.includes("gold"))      return "#ffd700";
  if (r.includes("platinum"))  return "#40e0d0";
  if (r.includes("diamond"))   return "#b489c4";
  if (r.includes("ascendant")) return "#2e8b57";
  if (r.includes("immortal"))  return "#dc143c";
  if (r.includes("radiant"))   return "#fffacd";
  return "#9ca3af";
}

// ─── Erklärungs-Hinweis ──────────────────────────────
// Kleiner Pfeil neben einer Einstellung. Beim Überfahren erscheint die
// Erklärung kurz, beim Anklicken bleibt sie stehen — damit man in Ruhe lesen
// kann, ohne die Maus still halten zu müssen.
function InfoHint({ title, children, width = 280 }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;

  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 6 }}>
      <button
        type="button"
        aria-label={`Erklärung: ${title}`}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={(e) => { e.preventDefault(); setPinned(p => !p); }}
        style={{
          width: 16, height: 16, borderRadius: "50%", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: open ? "rgba(255,70,85,0.2)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${open ? "rgba(255,70,85,0.6)" : "rgba(255,255,255,0.18)"}`,
          color: open ? "#ff4655" : "#9ca3af",
          fontSize: 10, lineHeight: 1, padding: 0,
          transition: "all 0.15s ease",
        }}
      >
        ➜
      </button>

      {open && (
        <span
          role="tooltip"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: "absolute", left: 22, top: -6, zIndex: 20000, width,
            background: "#15151d",
            border: "1px solid rgba(255,70,85,0.35)",
            borderRadius: 8, padding: "10px 12px",
            boxShadow: "0 6px 28px rgba(0,0,0,0.65)",
            fontSize: 11.5, lineHeight: 1.55, color: "#d1d5db",
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 500,
            textAlign: "left", cursor: "default",
          }}
        >
          <span style={{
            display: "block", fontFamily: "'Space Mono', monospace",
            fontSize: 9, letterSpacing: 1.5, color: "#ff4655", marginBottom: 5,
          }}>
            {title.toUpperCase()}
          </span>
          {children}
          {pinned && (
            <span
              onClick={() => { setPinned(false); setHover(false); }}
              style={{ display: "block", marginTop: 8, fontSize: 10, color: "#6b7280", cursor: "pointer" }}
            >
              Schliessen ✕
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// ─── Toast Notification ─────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = { success: "#22c55e", error: "#ff4655", info: "#60a5fa" };
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      padding: "12px 20px",
      background: "#0d0d14",
      border: `1px solid ${colors[type] || colors.info}`,
      borderLeft: `3px solid ${colors[type] || colors.info}`,
      borderRadius: 8, color: "#e8e8e8",
      fontSize: 13, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600,
      letterSpacing: 0.5,
      boxShadow: `0 4px 24px rgba(0,0,0,0.5)`,
      animation: "slideIn 0.2s ease",
    }}>
      {message}
    </div>
  );
}

// ─── Add/Edit Modal ──────────────────────────────────
function AccountModal({ account, index, onClose, onSave }) {
  const isEdit = account != null;
  const [form, setForm] = useState({
    riotName: account?.riotName ?? "",
    riotTag: account?.riotTag ?? "",
    loginName: account?.loginName ?? "",
    password: "",
    email: "",
    emailPassword: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  // Bei Edit: Zugangsdaten vom Backend laden
  useEffect(() => {
    if (isEdit && index != null && !credentialsLoaded) {
      api.getCredentials(index).then((creds) => {
        setForm(f => ({
          ...f,
          loginName: creds.loginName ?? f.loginName,
          email: creds.email ?? "",
          notes: creds.notes ?? "",
        }));
        setCredentialsLoaded(true);
      }).catch(() => setCredentialsLoaded(true));
    }
  }, [isEdit, index, credentialsLoaded]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.riotName.trim() || !form.riotTag.trim()) return;
    setLoading(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "riotName", label: "RIOT NAME", placeholder: "z.B. PhantomKing" },
    { key: "riotTag", label: "RIOT TAG", placeholder: "z.B. EUW" },
    { key: "loginName", label: "LOGIN", placeholder: "Benutzername / E-Mail" },
    { key: "password", label: isEdit ? "PASSWORT (leer = unverändert)" : "PASSWORT", placeholder: "••••••••", type: "password" },
    { key: "email", label: "E-MAIL", placeholder: "email@example.com" },
    { key: "emailPassword", label: "E-MAIL PASSWORT", placeholder: "••••••••", type: "password" },
    { key: "notes", label: "NOTIZEN", placeholder: "Freitext...", multiline: true },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(8px)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(480px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto", background: "#0d0d14",
        border: "1px solid rgba(255,70,85,0.35)",
        borderRadius: 12, padding: "28px 32px",
        boxShadow: "0 0 80px rgba(255,70,85,0.1)",
        animation: "fadeUp 0.2s ease"
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 24, letterSpacing: 3, color: "#fff", marginBottom: 20
        }}>
          {isEdit ? "ACCOUNT BEARBEITEN" : "NEUEN ACCOUNT"}
          {!isEdit && <div style={{ fontSize: 14, color: "#4b5563", letterSpacing: 2, fontFamily: "'Rajdhani', sans-serif" }}>HINZUFÜGEN</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fields.map(({ key, label, placeholder, type, multiline }) => (
            <div key={key}>
              <label style={{
                fontSize: 9, color: "#4b5563", letterSpacing: 2,
                fontFamily: "'Space Mono', monospace", display: "block", marginBottom: 4
              }}>{label}</label>
              {multiline ? (
                <textarea
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  rows={3}
                  style={inputStyle}
                />
              ) : (
                <input
                  type={type || "text"}
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtnStyle}>ABBRECHEN</button>
          <button onClick={handleSubmit} disabled={loading} style={saveBtnStyle}>
            {loading ? "SPEICHERT..." : "SPEICHERN"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ────────────────────────────
function DeleteModal({ name, onConfirm, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(8px)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(360px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto", background: "#0d0d14",
        border: "1px solid rgba(255,70,85,0.3)",
        borderRadius: 12, padding: "28px 32px",
        animation: "fadeUp 0.2s ease"
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2, color: "#fff", marginBottom: 8 }}>
          ACCOUNT LÖSCHEN?
        </div>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24, lineHeight: 1.6 }}>
          <span style={{ color: "#ff4655" }}>{name}</span> wird unwiderruflich gelöscht.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtnStyle}>ABBRECHEN</button>
          <button onClick={onConfirm} style={{ ...saveBtnStyle, background: "rgba(255,70,85,0.2)", borderColor: "rgba(255,70,85,0.5)" }}>
            LÖSCHEN
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Credentials Panel ───────────────────────────────
function CredentialsTab({ index, riotName, riotTag }) {
  const [creds, setCreds] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api.getCredentials(index).then(setCreds).catch(() => {});
  }, [index]);

  const copy = async (key, value) => {
    if (window.electron) {
      await window.electron.copyToClipboard(value);
    } else {
      navigator.clipboard.writeText(value);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggle = (key) => setRevealed(r => ({ ...r, [key]: !r[key] }));

  if (!creds) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#4b5563" }}>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12 }}>LADE...</span>
    </div>
  );

  const fields = [
    { key: "riotId", label: "RIOT ID", value: `${riotName}#${riotTag}`, sensitive: false },
    { key: "loginName", label: "LOGIN", value: creds.loginName, sensitive: false },
    { key: "password", label: "PASSWORT", value: creds.password, sensitive: true },
    { key: "email", label: "E-MAIL", value: creds.email, sensitive: false },
    { key: "emailPassword", label: "E-MAIL PASSWORT", value: creds.emailPassword, sensitive: true },
    { key: "notes", label: "NOTIZEN", value: creds.notes, sensitive: false },
  ].filter(f => f.value);

  return (
    <div>
      <div style={{
        background: "rgba(255,165,0,0.05)", border: "1px solid rgba(255,165,0,0.2)",
        borderRadius: 8, padding: "10px 16px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 10
      }}>
        <span style={{ fontSize: 14 }}>⚠</span>
        <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 500 }}>
          Zugangsdaten sind nur lokal gespeichert. Nie teilen!
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 540 }}>
        {fields.map(({ key, label, value, sensitive }) => (
          <div key={key} style={{
            display: "flex", alignItems: "center",
            padding: "12px 16px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8, gap: 12
          }}>
            <span style={{
              fontSize: 9, color: "#4b5563", letterSpacing: 2,
              fontFamily: "'Space Mono', monospace", width: 140, minWidth: 84, flexShrink: 1
            }}>{label}</span>
            <span style={{
              flex: 1, fontSize: 13, color: "#9ca3af",
              fontFamily: "'Space Mono', monospace",
              wordBreak: "break-all"
            }}>
              {sensitive && !revealed[key]
                ? "•".repeat(Math.min((value || "").length, 12))
                : (value || "—")}
            </span>
            {sensitive && (
              <button onClick={() => toggle(key)} style={iconBtnStyle}>
                {revealed[key] ? "🙈" : "👁"}
              </button>
            )}
            <button onClick={() => copy(key, value)} style={{
              ...iconBtnStyle,
              background: copied === key ? "rgba(34,197,94,0.1)" : undefined,
              color: copied === key ? "#22c55e" : undefined
            }}>
              {copied === key ? "✓" : "COPY"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Rank-Verlauf Graph ──────────────────────────────
function RankGraph({ matchHistory }) {
  const [range, setRange] = useState("all"); // day | week | month | year | all

  const now = Date.now();
  const ranges = {
    day:   { label: "TAG",    ms: 24 * 3600e3 },
    week:  { label: "WOCHE",  ms: 7 * 24 * 3600e3 },
    month: { label: "MONAT",  ms: 30 * 24 * 3600e3 },
    year:  { label: "JAHR",   ms: 365 * 24 * 3600e3 },
    all:   { label: "ALLE",   ms: Infinity },
  };

  const history = (matchHistory || [])
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  // Nach Zeitraum filtern
  const cutoff = ranges[range].ms === Infinity ? 0 : now - ranges[range].ms;
  const filtered = history.filter(m => m.timestamp >= cutoff);

  // Kumulativen RR-Verlauf aufbauen (Summe der rrChange über die Zeit)
  let cumulative = 0;
  const points = filtered.map((m, i) => {
    cumulative += (m.rrChange || 0);
    return {
      i,
      cumulative,
      rrChange: m.rrChange || 0,
      result: m.result,
      date: new Date(m.timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
      timestamp: m.timestamp,
    };
  });

  const netChange = points.length ? points[points.length - 1].cumulative : 0;
  const wins = filtered.filter(m => m.result === "W").length;
  const losses = filtered.filter(m => m.result === "L").length;

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "16px 18px", marginBottom: 16,
    }}>
      {/* Header mit Filtern */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#4b5563", fontFamily: "'Space Mono', monospace" }}>
          RR-VERLAUF
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {Object.entries(ranges).map(([key, r]) => (
            <button key={key} onClick={() => setRange(key)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 9, letterSpacing: 1,
              fontFamily: "'Space Mono', monospace", fontWeight: 700,
              background: range === key ? "rgba(255,70,85,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${range === key ? "rgba(255,70,85,0.4)" : "rgba(255,255,255,0.07)"}`,
              color: range === key ? "#ff4655" : "#6b7280",
              transition: "all 0.15s ease",
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Zusammenfassung */}
      <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>NETTO</span>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif",
            color: netChange > 0 ? "#22c55e" : netChange < 0 ? "#ef4444" : "#6b7280" }}>
            {netChange > 0 ? "+" : ""}{netChange} RR
          </div>
        </div>
        <div>
          <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>W / L</span>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", color: "#e8e8e8" }}>
            <span style={{ color: "#22c55e" }}>{wins}</span>
            <span style={{ color: "#4b5563" }}> / </span>
            <span style={{ color: "#ef4444" }}>{losses}</span>
          </div>
        </div>
      </div>

      {/* Graph */}
      {points.length >= 2 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 9, fontFamily: "monospace" }}
              axisLine={{ stroke: "rgba(255,255,255,0.07)" }} tickLine={false} minTickGap={20} />
            <YAxis tick={{ fill: "#4b5563", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#0d0d14", border: "1px solid rgba(255,70,85,0.3)",
                borderRadius: 6, fontSize: 12, fontFamily: "'Space Mono', monospace" }}
              labelStyle={{ color: "#9ca3af" }}
              formatter={(value, name, props) => {
                const c = props.payload.rrChange;
                return [`${value} RR (${c > 0 ? "+" : ""}${c})`, "Kumulativ"];
              }}
            />
            <Line type="monotone" dataKey="cumulative" stroke="#ff4655" strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props;
                const color = payload.result === "W" ? "#22c55e" : payload.result === "L" ? "#ef4444" : "#6b7280";
                return <circle cx={cx} cy={cy} r={3} fill={color} stroke="#0a0a0f" strokeWidth={1} />;
              }}
              activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#4b5563", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
          {filtered.length === 0 ? "Keine Matches in diesem Zeitraum" : "Zu wenige Matches für einen Verlauf"}
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────
function OverviewTab({ account, data, onSync, syncing }) {
  if (!data) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 16 }}>
      <div style={{ color: "#4b5563", fontSize: 13, fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>
        KEINE DATEN GELADEN
      </div>
      {/* flex:"0 0 auto" wie beim Knopf im leeren Zustand: in dieser Spalte
          wuerde das flex:1 aus saveBtnStyle den Knopf senkrecht strecken. */}
      <button
        onClick={onSync}
        disabled={syncing}
        style={{ ...saveBtnStyle, flex: "0 0 auto", padding: "11px 22px" }}
      >
        {syncing ? "SYNCHRONISIERT..." : "JETZT SYNCHRONISIEREN"}
      </button>
    </div>
  );

  const winRate = data.lastGames?.length
    ? Math.round(data.lastGames.filter(g => g === "W").length / data.lastGames.length * 100)
    : 0;

  const streakCount = (() => {
    if (!data.lastGames?.length) return 0;
    const last = data.lastGames[data.lastGames.length - 1];
    let n = 0;
    for (let i = data.lastGames.length - 1; i >= 0; i--) {
      if (data.lastGames[i] === last) n++; else break;
    }
    return last === "W" ? n : -n;
  })();

  const kdaRatio = typeof data.kdaRatio === "number" ? data.kdaRatio : 0;
  const hasKda = (data.avgKills || 0) + (data.avgDeaths || 0) + (data.avgAssists || 0) > 0;

  const stats = [
    { label: "RANK", value: data.rankName || "Unranked", sub: `${data.rr || 0} RR`, color: rankColor(data.rankName) },
    { label: "LEVEL", value: data.level || 0, sub: "Account Level", color: "#60a5fa" },
    { label: "STREAK",
      value: streakCount > 0 ? `${streakCount}W` : streakCount < 0 ? `${Math.abs(streakCount)}L` : "—",
      sub: "aktuell", color: streakCount > 0 ? "#22c55e" : streakCount < 0 ? "#ef4444" : "#6b7280" },
    { label: "WINRATE", value: `${winRate}%`, sub: `${data.lastGames?.length || 0} Matches`, color: winRate >= 50 ? "#22c55e" : "#f59e0b" },
    { label: "KDA",
      value: hasKda ? kdaRatio.toFixed(2) : "—",
      sub: hasKda
        ? `${data.avgKills.toFixed(1)} / ${data.avgDeaths.toFixed(1)} / ${data.avgAssists.toFixed(1)}`
        : "keine Match-Daten",
      color: kdaRatio >= 1.3 ? "#22c55e" : kdaRatio >= 1.0 ? "#f59e0b" : "#ef4444" },
  ];

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8, padding: "14px 16px",
            transition: "all 0.2s ease",
          }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "#4b5563", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* RR-Verlauf Graph */}
      <RankGraph matchHistory={account?.matchHistory} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Last Games */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#4b5563", fontFamily: "'Space Mono', monospace", marginBottom: 12 }}>
            LETZTE MATCHES
          </div>
          {data.lastGames?.length ? (
            <div style={{ display: "flex", gap: 5 }}>
              {data.lastGames.map((g, i) => (
                <div key={i} style={{
                  flex: 1, height: 34, borderRadius: 4,
                  background: g === "W" ? "rgba(255,70,85,0.2)" : g === "L" ? "rgba(55,65,81,0.5)" : "rgba(107,114,128,0.3)",
                  border: `1px solid ${g === "W" ? "rgba(255,70,85,0.45)" : "rgba(55,65,81,0.8)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700,
                  color: g === "W" ? "#ff4655" : "#6b7280",
                  fontFamily: "'Space Mono', monospace"
                }}>{g}</div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#4b5563", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>Keine Matches gefunden</div>
          )}
        </div>

        {/* Top Agents */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#4b5563", fontFamily: "'Space Mono', monospace", marginBottom: 12 }}>
            TOP AGENTS
          </div>
          {data.topAgents?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.topAgents.map((ag, i) => (
                <div key={ag.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {ag.iconUrl ? (
                    <img src={ag.iconUrl} alt={ag.name} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid rgba(255,70,85,0.2)" }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(255,70,85,0.1)", border: "1px solid rgba(255,70,85,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>?</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db" }}>{ag.name}</span>
                      <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>{ag.count}x</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        background: i === 0 ? "#ff4655" : i === 1 ? "#dc2626" : "#991b1b",
                        width: `${(ag.count / data.topAgents[0].count) * 100}%`,
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#4b5563", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>Keine Daten</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── API-Key Dialog (Erststart-blockierend + Einstellungen) ──
function ApiKeyManager({ mode, onSaved, onClose }) {
  // mode: "setup" = blockierender Erststart, "settings" = wechselbar/schließbar
  const isSetup = mode === "setup";
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!key.trim()) { setError("Bitte einen API-Key eingeben."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await api.setApiKey(key.trim());
      if (res?.configured) {
        onSaved();
      } else {
        // Begründung kommt aus der Prüfung im Backend
        setError(res?.message || "Key wurde abgelehnt. Bitte prüfen.");
      }
    } catch (e) {
      setError(e?.message || "Backend nicht erreichbar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(5,5,9,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(440px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto", background: "#0d0d14",
        border: "1px solid rgba(255,70,85,0.25)", borderRadius: 12,
        padding: "28px 28px 24px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: "#ff4655", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
          {isSetup ? "ERSTEINRICHTUNG" : "API-KEY WECHSELN"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e8e8e8", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 10 }}>
          Henrik API-Key
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 16 }}>
          {isSetup
            ? "Damit der Manager Valorant-Daten laden kann, brauchst du einen persönlichen API-Key. Er wird beim Speichern einmal gegen Henrik geprüft und danach nur lokal abgelegt."
            : "Hier kannst du deinen API-Key ersetzen. Der neue Key überschreibt den bisherigen."}
        </div>

        <input
          type="text"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="HDEV-xxxxxxxx-xxxx-xxxx-..."
          autoFocus
          onKeyDown={e => { if (e.key === "Enter") save(); }}
          style={{ ...inputStyle, marginBottom: 10, fontFamily: "'Space Mono', monospace", fontSize: 12 }}
        />

        {error && (
          <div style={{ fontSize: 11, color: "#ff4655", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
            {error}
          </div>
        )}

        <a
          href="https://docs.henrikdev.xyz/authentication-and-authorization"
          onClick={e => {
            // Im echten Browser öffnen statt in einem Fenster ohne Adresszeile
            e.preventDefault();
            window.electron?.openExternal(e.currentTarget.href);
          }}
          style={{ fontSize: 11, color: "#60a5fa", textDecoration: "none", display: "inline-block", marginBottom: 18, cursor: "pointer" }}
        >
          → Key bei Henrik anfragen (öffnet im Browser)
        </a>

        <div style={{ display: "flex", gap: 10 }}>
          {!isSetup && (
            <button onClick={onClose} style={cancelBtnStyle}>ABBRECHEN</button>
          )}
          <button onClick={save} disabled={saving} style={saveBtnStyle}>
            {saving ? "PRÜFT KEY..." : isSetup ? "SPEICHERN & STARTEN" : "KEY SPEICHERN"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sicherung: Export & Import ──────────────────────
// Wozu das nötig ist: die normale Ablage ist an den Schlüsselbund dieses
// Rechners gebunden. Auf einem neuen PC wäre sie nicht lesbar. Diese Datei
// hängt stattdessen an einem Passwort und übersteht damit den Umzug.
function BackupManager({ onClose, onImported, showToast }) {
  const [tab, setTab] = useState("export"); // export | import
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const doExport = async () => {
    if (pw.length < 8) { setError("Mindestens 8 Zeichen."); return; }
    if (pw !== pw2) { setError("Die beiden Passwörter stimmen nicht überein."); return; }
    setBusy(true); setError("");
    try {
      const res = await api.exportAccounts(pw);
      if (!res?.success) { setError(res?.message || "Export fehlgeschlagen."); return; }
      const saved = await window.electron?.saveExport(res.content);
      if (saved?.canceled) { setError(""); return; }
      if (!saved?.ok) { setError(saved?.error || "Datei konnte nicht geschrieben werden."); return; }
      showToast(`${res.count} Accounts gesichert.`);
      onClose();
    } catch (e) {
      setError(e?.message || "Backend nicht erreichbar.");
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!pw) { setError("Bitte das Passwort der Sicherung eingeben."); return; }
    setBusy(true); setError("");
    try {
      const file = await window.electron?.openImport();
      if (file?.canceled) { setError(""); return; }
      if (!file?.ok) { setError(file?.error || "Datei konnte nicht gelesen werden."); return; }
      const res = await api.importAccounts(pw, file.content);
      if (!res?.success) { setError(res?.message || "Import fehlgeschlagen."); return; }
      showToast(`${res.count} Accounts übernommen.`);
      onImported();
      onClose();
    } catch (e) {
      setError(e?.message || "Backend nicht erreichbar.");
    } finally { setBusy(false); }
  };

  const isExport = tab === "export";
  const tabStyle = (active) => ({
    flex: 1, padding: "8px 0", cursor: "pointer", fontSize: 10, letterSpacing: 2,
    fontFamily: "'Space Mono', monospace",
    background: active ? "rgba(255,70,85,0.12)" : "transparent",
    color: active ? "#ff4655" : "#6b7280",
    border: "1px solid " + (active ? "rgba(255,70,85,0.3)" : "rgba(255,255,255,0.08)"),
    borderRadius: 5,
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(5,5,9,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(440px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto", background: "#0d0d14",
        border: "1px solid rgba(255,70,85,0.25)", borderRadius: 12,
        padding: "28px 28px 24px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: "#ff4655", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
          SICHERUNG
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e8e8e8", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 14 }}>
          Accounts sichern & umziehen
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => { setTab("export"); setError(""); }} style={tabStyle(isExport)}>SICHERN</button>
          <button onClick={() => { setTab("import"); setError(""); }} style={tabStyle(!isExport)}>EINLESEN</button>
        </div>

        <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 16 }}>
          {isExport
            ? "Schreibt alle Accounts in eine Datei, die mit deinem Passwort geschützt ist. Nur damit kommst du auf einem neuen Rechner wieder an die Daten — bewahre beides getrennt auf."
            : "Liest eine Sicherung ein. Achtung: die aktuellen Accounts werden dabei ersetzt. Eine Kopie des jetzigen Stands wird vorher automatisch abgelegt."}
        </div>

        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder={isExport ? "Passwort vergeben (min. 8 Zeichen)" : "Passwort der Sicherung"}
          autoFocus
          onKeyDown={e => { if (e.key === "Enter" && !isExport) doImport(); }}
          style={{ ...inputStyle, marginBottom: 10, fontSize: 13 }}
        />
        {isExport && (
          <input
            type="password"
            value={pw2}
            onChange={e => setPw2(e.target.value)}
            placeholder="Passwort wiederholen"
            onKeyDown={e => { if (e.key === "Enter") doExport(); }}
            style={{ ...inputStyle, marginBottom: 10, fontSize: 13 }}
          />
        )}

        {isExport && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 12, lineHeight: 1.5 }}>
            ⚠ Dieses Passwort lässt sich nicht zurücksetzen. Ohne es ist die Datei wertlos.
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: "#ff4655", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={cancelBtnStyle}>SCHLIESSEN</button>
          <button onClick={isExport ? doExport : doImport} disabled={busy} style={saveBtnStyle}>
            {busy ? "MOMENT..." : isExport ? "DATEI SPEICHERN" : "DATEI WÄHLEN"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Schutz-Einstellung (Master-Passwort) ────────────
// Wird sowohl bei der Ersteinrichtung als auch später in den Einstellungen
// angezeigt — damit die Erklärung an beiden Stellen dieselbe ist.
function SecuritySection({ status, onChanged, showToast }) {
  const isOn = status?.mode === "passwort";
  const [mode, setMode] = useState(null); // null | "enable" | "disable" | "change"
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setMode(null); setPw(""); setPw2(""); setError(""); };

  const run = async (fn, okMsg) => {
    setBusy(true); setError("");
    try {
      const res = await fn();
      if (!res?.success) { setError(res?.message || "Hat nicht geklappt."); return; }
      showToast(res.message || okMsg);
      reset();
      onChanged();
    } catch (e) {
      setError(e?.message || "Backend nicht erreichbar.");
    } finally { setBusy(false); }
  };

  const doEnable = () => {
    if (pw.length < 8) { setError("Mindestens 8 Zeichen."); return; }
    if (pw !== pw2) { setError("Die beiden Eingaben stimmen nicht überein."); return; }
    run(() => api.enableMasterPassword(pw), "Master-Passwort aktiv.");
  };
  const doDisable = () => {
    if (!pw) { setError("Bitte das aktuelle Master-Passwort eingeben."); return; }
    run(() => api.disableMasterPassword(pw), "Master-Passwort entfernt.");
  };
  const doChange = () => {
    if (pw2.length < 8) { setError("Das neue Passwort braucht mindestens 8 Zeichen."); return; }
    run(() => api.changeMasterPassword(pw, pw2), "Master-Passwort geändert.");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>
          MASTER-PASSWORT
        </span>
        <InfoHint title="Master-Passwort" width={320}>
          <b style={{ color: "#e8e8e8" }}>Aus (Standard):</b> Der Schlüssel für deine
          Accounts liegt im Schlüsselbund von Windows. Bequem — die App startet ohne
          Nachfrage. Nachteil: jedes Programm, das unter deinem Windows-Konto läuft,
          kann Windows um diesen Schlüssel bitten.
          <br /><br />
          <b style={{ color: "#e8e8e8" }}>Ein:</b> Der Schlüssel entsteht erst aus deinem
          eingetippten Passwort und wird nirgends gespeichert. Windows kann ihn nicht
          herausgeben, weil es ihn nicht kennt. Dafür musst du ihn bei jedem Start eingeben.
          <br /><br />
          <span style={{ color: "#f59e0b" }}>Vergisst du das Passwort, sind die Accounts
          verloren</span> — es sei denn, du hast eine Sicherung.
        </InfoHint>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderRadius: 8,
        background: isOn ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isOn ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
        marginBottom: mode ? 12 : 0,
      }}>
        <div>
          <div style={{ fontSize: 13, color: "#e8e8e8", fontWeight: 600 }}>
            {isOn ? "Eingeschaltet" : "Ausgeschaltet"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
            {isOn
              ? "Beim Start wird nach dem Passwort gefragt."
              : "Der Schutz hängt am Gerät — kein Passwort nötig."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isOn ? (
            <>
              <button onClick={() => { reset(); setMode("change"); }} style={smallBtnStyle}>ÄNDERN</button>
              <button onClick={() => { reset(); setMode("disable"); }} style={smallBtnStyle}>AUSSCHALTEN</button>
            </>
          ) : (
            <button onClick={() => { reset(); setMode("enable"); }} style={{ ...smallBtnStyle, color: "#ff4655", borderColor: "rgba(255,70,85,0.4)" }}>
              EINSCHALTEN
            </button>
          )}
        </div>
      </div>

      {mode && (
        <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {mode === "enable" && (
            <>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus
                placeholder="Master-Passwort (min. 8 Zeichen)" style={{ ...inputStyle, marginBottom: 8 }} />
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doEnable(); }}
                placeholder="Wiederholen" style={{ ...inputStyle, marginBottom: 8 }} />
              <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 10, lineHeight: 1.5 }}>
                ⚠ Es gibt keine Wiederherstellung. Lege dir vorher eine Sicherung an (Knopf ⤓).
              </div>
            </>
          )}
          {mode === "disable" && (
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") doDisable(); }}
              placeholder="Aktuelles Master-Passwort" style={{ ...inputStyle, marginBottom: 10 }} />
          )}
          {mode === "change" && (
            <>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus
                placeholder="Bisheriges Passwort" style={{ ...inputStyle, marginBottom: 8 }} />
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doChange(); }}
                placeholder="Neues Passwort (min. 8 Zeichen)" style={{ ...inputStyle, marginBottom: 10 }} />
            </>
          )}

          {error && (
            <div style={{ fontSize: 11, color: "#ff4655", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={cancelBtnStyle}>ABBRECHEN</button>
            <button disabled={busy} style={saveBtnStyle}
              onClick={mode === "enable" ? doEnable : mode === "disable" ? doDisable : doChange}>
              {busy ? "MOMENT..." : "BESTÄTIGEN"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Oberflächengröße ────────────────────────────────
// Bei ungewöhnlichen Auflösungen oder hoher Windows-Skalierung wirkt die
// Oberfläche schnell zu gross oder zu klein. Der Wert bleibt gespeichert und
// wird beim nächsten Start wieder gesetzt.
const ZOOM_KEY = "vm-zoom";
const ZOOM_STUFEN = [0.8, 0.9, 1.0, 1.1, 1.25];

export function leseZoom() {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(v) && v >= 0.7 && v <= 1.4 ? v : 1;
  } catch {
    return 1; // privater Modus o. ä. — dann eben Standardgrösse
  }
}

function ZoomSection({ showToast }) {
  const [zoom, setZoom] = useState(leseZoom);

  const setze = async (wert) => {
    setZoom(wert);
    try { localStorage.setItem(ZOOM_KEY, String(wert)); } catch { }
    await window.electron?.setZoom(wert);
    showToast(`Oberflächengröße: ${Math.round(wert * 100)} %`);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>
          OBERFLÄCHENGRÖSSE
        </span>
        <InfoHint title="Oberflächengröße" width={300}>
          Vergrössert oder verkleinert alles im Fenster — Schrift, Knöpfe,
          Abstände.
          <br /><br />
          Nützlich bei ungewöhnlichen Bildschirmauflösungen oder wenn Windows
          auf 125 % oder 150 % skaliert. Dann wirkt die Oberfläche sonst
          schnell zu gross.
          <br /><br />
          Die Einstellung bleibt gespeichert und gilt ab dem nächsten Start
          automatisch.
        </InfoHint>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        padding: "10px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      }}>
        {ZOOM_STUFEN.map(stufe => {
          const aktiv = Math.abs(zoom - stufe) < 0.001;
          return (
            <button key={stufe} onClick={() => setze(stufe)} style={{
              ...smallBtnStyle,
              color: aktiv ? "#ff4655" : "#d1d5db",
              borderColor: aktiv ? "rgba(255,70,85,0.5)" : "rgba(255,255,255,0.14)",
              background: aktiv ? "rgba(255,70,85,0.12)" : "rgba(255,255,255,0.05)",
            }}>
              {Math.round(stufe * 100)} %
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Aktualisierung ──────────────────────────────────
// Holt neue Fassungen direkt aus den GitHub-Releases. Der Nutzer entscheidet
// in jedem Schritt: suchen, herunterladen, neu starten.
function UpdateSection({ showToast }) {
  const [zustand, setZustand] = useState("unbekannt"); // unbekannt|suche|aktuell|verfuegbar|laedt|bereit|fehler
  const [version, setVersion] = useState(null);
  const [prozent, setProzent] = useState(0);
  const [meldung, setMeldung] = useState("");

  // Auf Meldungen aus dem Hauptprozess hören
  useEffect(() => {
    const ab = window.electron?.onUpdateStatus?.((d) => {
      if (d.zustand === "laedt") setProzent(d.prozent ?? 0);
      if (d.version) setVersion(d.version);
      if (d.zustand === "fehler") setMeldung(d.meldung || "");
      setZustand(d.zustand);
    });
    return ab; // beim Schliessen wieder abmelden
  }, []);

  const suchen = async () => {
    setZustand("suche"); setMeldung("");
    const r = await window.electron?.updatePruefen();
    if (!r?.ok) { setZustand("fehler"); setMeldung(r?.grund || "Suche fehlgeschlagen."); return; }
    // Der genaue Zustand kommt gleich als Meldung vom Hauptprozess
  };

  const laden = async () => {
    setZustand("laedt"); setProzent(0);
    const r = await window.electron?.updateLaden();
    if (!r?.ok) { setZustand("fehler"); setMeldung(r?.grund || "Herunterladen fehlgeschlagen."); }
  };

  const installieren = async () => {
    showToast("App startet neu...");
    await window.electron?.updateInstallieren();
  };

  const text = {
    unbekannt: "Noch nicht nachgesehen.",
    suche: "Suche läuft...",
    aktuell: "Du hast die neueste Fassung.",
    verfuegbar: `Version ${version} ist verfügbar.`,
    laedt: `Wird heruntergeladen... ${prozent} %`,
    bereit: `Version ${version} ist fertig geladen.`,
    fehler: meldung || "Es hat nicht geklappt.",
  }[zustand];

  const farbe = zustand === "fehler" ? "#ff4655"
    : (zustand === "verfuegbar" || zustand === "bereit") ? "#22c55e" : "#9ca3af";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>
          AKTUALISIERUNG
        </span>
        <InfoHint title="Aktualisierung" width={320}>
          Sucht auf GitHub nach einer neueren Fassung und lädt sie herunter.
          Du musst nichts neu installieren — beim Neustart ersetzt sich die App
          selbst.
          <br /><br />
          Es passiert nichts ungefragt: Suchen, Herunterladen und Neustarten
          bestätigst du jeweils selbst. Deine Accounts bleiben dabei unberührt,
          sie liegen ausserhalb des Programmordners.
          <br /><br />
          <span style={{ color: "#f59e0b" }}>Im Entwicklungsmodus nicht
          verfügbar</span> — dort gibt es keine installierte App, die sich
          ersetzen liesse.
        </InfoHint>
      </div>

      <div style={{
        padding: "10px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 11, color: farbe, lineHeight: 1.5 }}>{text}</div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {(zustand === "verfuegbar") && (
              <button onClick={laden} style={{ ...smallBtnStyle, color: "#22c55e", borderColor: "rgba(34,197,94,0.4)" }}>
                HERUNTERLADEN
              </button>
            )}
            {(zustand === "bereit") && (
              <button onClick={installieren} style={{ ...smallBtnStyle, color: "#22c55e", borderColor: "rgba(34,197,94,0.4)" }}>
                NEU STARTEN
              </button>
            )}
            {zustand !== "laedt" && zustand !== "bereit" && (
              <button onClick={suchen} disabled={zustand === "suche"} style={smallBtnStyle}>
                {zustand === "suche" ? "SUCHT..." : "SUCHEN"}
              </button>
            )}
          </div>
        </div>

        {zustand === "laedt" && (
          <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ width: `${prozent}%`, height: "100%", background: "#22c55e", transition: "width 0.2s ease" }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grundeinstellungen ──────────────────────────────
// Erscheint einmalig nach der Ersteinrichtung und ist später jederzeit über
// das Zahnrad erreichbar. Jede Einstellung hat einen Erklärungs-Pfeil.
function BasicSettings({ status, onChanged, showToast, onOpenBackup, onOpenApiKey, setupMode, onFinish, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(5,5,9,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(520px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto",
        background: "#0d0d14", border: "1px solid rgba(255,70,85,0.25)",
        borderRadius: 12, padding: "28px 28px 24px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: "#ff4655", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
          {setupMode ? "SCHRITT 2 VON 2 — GRUNDEINSTELLUNGEN" : "EINSTELLUNGEN"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e8e8e8", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 6 }}>
          {setupMode ? "Fast fertig" : "Einstellungen"}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.55, marginBottom: 20 }}>
          {setupMode
            ? "Diese Einstellungen kannst du jederzeit über das Zahnrad ändern. Die Pfeile neben den Überschriften erklären, was eine Einstellung bewirkt — zum Festhalten anklicken."
            : "Die Pfeile ➜ erklären jede Einstellung. Überfahren zeigt die Erklärung, Anklicken hält sie fest."}
        </div>

        {/* Aktualisierung */}
        {!setupMode && (
          <div style={{ marginBottom: 22 }}>
            <UpdateSection showToast={showToast} />
          </div>
        )}

        {/* Schutz der Accounts */}
        <div style={{ marginBottom: 22 }}>
          <SecuritySection status={status} onChanged={onChanged} showToast={showToast} />
        </div>

        {/* Oberflächengröße */}
        <div style={{ marginBottom: 22 }}>
          <ZoomSection showToast={showToast} />
        </div>

        {/* Sicherung */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>
              SICHERUNG
            </span>
            <InfoHint title="Sicherung" width={320}>
              Schreibt alle Accounts in eine Datei, die mit einem eigenen Passwort
              geschützt ist. Nötig für zwei Fälle:
              <br /><br />
              <b style={{ color: "#e8e8e8" }}>Umzug:</b> Die normale Ablage ist an diesen
              Rechner gebunden. Auf einem neuen PC kommst du nur über diese Datei wieder
              an deine Accounts.
              <br /><br />
              <b style={{ color: "#e8e8e8" }}>Notfall:</b> Falls du das Master-Passwort
              vergisst oder Windows neu aufsetzt.
            </InfoHint>
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5, paddingRight: 10 }}>
              Accounts in eine passwortgeschützte Datei schreiben oder eine
              vorhandene Sicherung einlesen.
            </div>
            <button onClick={onOpenBackup} style={smallBtnStyle}>ÖFFNEN</button>
          </div>
        </div>

        {/* API-Key */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>
              HENRIK API-KEY
            </span>
            <InfoHint title="API-Key" width={300}>
              Dein persönlicher Zugang zur Henrik-API, über die Rang, RR und
              Match-Verlauf geladen werden. Ohne gültigen Key bleiben diese
              Anzeigen leer — die gespeicherten Zugangsdaten funktionieren
              trotzdem weiter.
              <br /><br />
              Der Key wird nur lokal abgelegt und beim Speichern einmal geprüft.
            </InfoHint>
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Hinterlegt und geprüft.</div>
            <button onClick={onOpenApiKey} style={smallBtnStyle}>WECHSELN</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {setupMode ? (
            <button onClick={onFinish} style={{ ...saveBtnStyle, width: "100%" }}>
              LOS GEHT'S
            </button>
          ) : (
            <button onClick={onClose} style={{ ...cancelBtnStyle, width: "100%" }}>
              SCHLIESSEN
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Entsperr-Bildschirm ─────────────────────────────
// Erscheint beim Start, wenn ein Master-Passwort gesetzt ist.
function UnlockScreen({ onUnlocked }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!pw) { setError("Bitte das Master-Passwort eingeben."); return; }
    setBusy(true); setError("");
    try {
      const res = await api.unlockWithPassword(pw);
      if (!res?.success) { setError(res?.message || "Falsches Passwort."); setPw(""); return; }
      onUnlocked();
    } catch (e) {
      setError(e?.message || "Backend nicht erreichbar.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000, background: "#08080d",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(400px, calc(100vw - 32px))", maxHeight: "88vh", overflowY: "auto", background: "#0d0d14", border: "1px solid rgba(255,70,85,0.25)",
        borderRadius: 12, padding: "30px 28px 24px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: "#ff4655", fontFamily: "'Space Mono', monospace", marginBottom: 8 }}>
          GESPERRT
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#e8e8e8", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 12 }}>
          Master-Passwort
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.55, marginBottom: 16 }}>
          Deine Accounts sind mit einem Master-Passwort verschlüsselt. Ohne dieses
          Passwort kann sie niemand öffnen — auch die App selbst nicht.
        </div>

        <input type="password" value={pw} autoFocus
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Master-Passwort" style={{ ...inputStyle, marginBottom: 10 }} />

        {error && (
          <div style={{ fontSize: 11, color: "#ff4655", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
            {error}
          </div>
        )}

        <button onClick={submit} disabled={busy} style={{ ...saveBtnStyle, width: "100%" }}>
          {busy ? "PRÜFT..." : "ENTSPERREN"}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────
export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null); // null | "add" | "edit" | "delete"
  const [syncing, setSyncing] = useState({});
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  // API-Key-Status: null = wird noch geprüft, false = fehlt (Setup), true = vorhanden
  const [apiKeyReady, setApiKeyReady] = useState(null);
  const [showKeySettings, setShowKeySettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  // Schutz-Zustand: null = noch unbekannt
  const [security, setSecurity] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [setupStep2, setSetupStep2] = useState(false);

  const showToast = (message, type = "success") => setToast({ message, type });

  // Accounts laden
  const loadAccounts = useCallback(async () => {
    try {
      const data = await api.getAccounts();
      // Index hinzufügen (Backend gibt -1 zurück, wir setzen ihn hier)
      const indexed = data.map((acc, i) => ({ ...acc, index: i }));
      setAccounts(indexed);
      if (!selected && indexed.length > 0) setSelected(indexed[0]);
      else if (selected) {
        const updated = indexed.find(a => a.riotName === selected.riotName && a.riotTag === selected.riotTag);
        if (updated) setSelected(updated);
      }
    } catch (err) {
      showToast("Backend nicht erreichbar", "error");
    }
  }, [selected]);

  // Schutzstatus neu einlesen (nach Ein-/Ausschalten des Master-Passworts)
  const refreshSecurity = useCallback(async () => {
    try {
      const sec = await api.getSecurityStatus();
      setSecurity(sec);
      return sec;
    } catch {
      setSecurity({ mode: "geraet", locked: false, broken: false });
      return null;
    }
  }, []);

  // Gespeicherte Oberflächengröße gleich beim Start anwenden
  useEffect(() => {
    const z = leseZoom();
    if (z !== 1) window.electron?.setZoom(z);
  }, []);

  useEffect(() => {
    (async () => {
      // Reihenfolge ist wichtig: solange gesperrt, liefert das Backend auf
      // alles andere 423 — erst entsperren, dann laden.
      const sec = await refreshSecurity();
      if (sec?.locked) return;
      try {
        const status = await api.getApiKeyStatus();
        setApiKeyReady(!!status?.configured);
        if (status?.configured) loadAccounts();
      } catch {
        // Backend nicht erreichbar — Setup-Dialog würde eh nicht funktionieren,
        // aber wir zeigen ihn, damit der User nicht vor leerer App sitzt
        setApiKeyReady(false);
      }
    })();
  }, []);

  // Nach dem Entsperren: alles nachladen
  const handleUnlocked = async () => {
    await refreshSecurity();
    try {
      const status = await api.getApiKeyStatus();
      setApiKeyReady(!!status?.configured);
      if (status?.configured) await loadAccounts();
    } catch {
      setApiKeyReady(false);
    }
  };

  // Account synchronisieren
  const handleSync = async (index) => {
    setSyncing(s => ({ ...s, [index]: true }));
    try {
      const res = await api.syncAccount(index);
      if (res.success) {
        showToast("Synchronisierung erfolgreich!");
        await loadAccounts();
      } else {
        showToast(res.message || "Sync fehlgeschlagen", "error");
      }
    } catch {
      showToast("Sync fehlgeschlagen", "error");
    } finally {
      setSyncing(s => ({ ...s, [index]: false }));
    }
  };

  // Alle synchronisieren
  const handleSyncAll = async () => {
    for (const acc of accounts) {
      await handleSync(acc.index);
    }
  };

  // Account erstellen
  const handleCreate = async (form) => {
    await api.createAccount(form);
    showToast("Account erstellt!");
    await loadAccounts();
  };

  // Account bearbeiten
  const handleEdit = async (form) => {
    await api.updateAccount(selected.index, form);
    showToast("Account aktualisiert!");
    await loadAccounts();
  };

  // Account löschen
  const handleDelete = async () => {
    await api.deleteAccount(selected.index);
    setSelected(null);
    setModal(null);
    showToast("Account gelöscht", "info");
    await loadAccounts();
  };

  // Als Main markieren
  const handleSetMain = async (index) => {
    await api.setMainAccount(index);
    showToast("Main Account gesetzt!");
    await loadAccounts();
  };

  // Riot Client starten
  const handleLogin = async () => {
    if (window.electron) {
      const res = await window.electron.launchRiotClient();
      // Sagt jetzt, warum es nicht geklappt hat, statt stumm nichts zu tun
      if (res && !res.ok) showToast(res.message || "Riot Client konnte nicht gestartet werden.", "error");
    } else {
      showToast("Nur in der Desktop-App verfügbar", "info");
    }
  };

  const filtered = accounts.filter(a =>
    `${a.riotName}${a.riotTag}${a.loginName}`.toLowerCase().includes(search.toLowerCase())
  );

  const data = selected?.cachedData;
  const rc = rankColor(data?.rankName);

  // Solange der Key-Status geprüft wird: kurzer Ladezustand
  // Gesperrt? Dann zuerst das Master-Passwort abfragen — vor allem anderen.
  if (security?.locked) {
    return <UnlockScreen onUnlocked={handleUnlocked} />;
  }

  if (apiKeyReady === null) {
    return (
      <div style={{
        background: "#0a0a0f",
        minHeight: "100vh", color: "#6b7280", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: 2,
      }}>
        LÄDT...
      </div>
    );
  }

  // Kein Key vorhanden → blockierender Erststart-Dialog
  if (apiKeyReady === false) {
    return (
      <div style={{ background: "#0a0a0f", minHeight: "100vh" }}>
        <ApiKeyManager
          mode="setup"
          onSaved={async () => {
            setApiKeyReady(true);
            await refreshSecurity();
            loadAccounts();
            showToast("API-Key gespeichert!");
            // Schritt 2 der Ersteinrichtung: Grundeinstellungen
            setSetupStep2(true);
          }}
        />
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'Rajdhani', 'sans-serif'",
      background: "#0a0a0f", minHeight: "100vh",
      color: "#e8e8e8", display: "flex", flexDirection: "column",
      userSelect: "none",
    }}>
      <style>{`
        /* Schriften kommen aus public/fonts.css — kein Aufruf nach aussen */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ff4655; border-radius: 2px; }
        input, textarea { font-family: 'Rajdhani', sans-serif; }
        button { font-family: 'Rajdhani', sans-serif; cursor: pointer; border: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .card-hover { transition: all 0.18s ease; }
        .card-hover:hover { background: rgba(255,70,85,0.06) !important; border-color: rgba(255,70,85,0.2) !important; }
        .tab-btn::after {
          content: ''; position: absolute; bottom: 0; left: 0; right: 0;
          height: 2px; background: #ff4655;
          transform: scaleX(0); transition: transform 0.2s ease;
        }
        .tab-btn.active::after { transform: scaleX(1); }
      `}</style>

      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)",
        width: 700, height: 400,
        background: "radial-gradient(ellipse, rgba(255,70,85,0.06) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0
      }} />

      {/* ── TITLEBAR (custom, für Electron frame:false) ── */}
      <div style={{
        height: 40, display: "flex", alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "rgba(8,8,13,0.98)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        WebkitAppRegion: "drag", // Electron: Fenster ziehen
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, WebkitAppRegion: "no-drag" }}>
          <div style={{
            width: 22, height: 22, background: "#ff4655",
            clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#fff"
          }}>V</div>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 3, color: "#fff" }}>
            VALORANT MANAGER
          </span>
        </div>

        {/* Fenster-Controls */}
        <div style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" }}>
          {[
            { label: "—", action: () => window.electron?.minimize() },
            { label: "⬜", action: () => window.electron?.maximize() },
            { label: "✕", action: () => window.electron?.close(), red: true },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} style={{
              width: 28, height: 22, background: "transparent",
              borderRadius: 4, fontSize: 11, color: "#6b7280",
              transition: "all 0.15s ease",
            }}
              onMouseEnter={e => {
                e.target.style.background = btn.red ? "#ff4655" : "rgba(255,255,255,0.1)";
                e.target.style.color = "#fff";
              }}
              onMouseLeave={e => {
                e.target.style.background = "transparent";
                e.target.style.color = "#6b7280";
              }}
            >{btn.label}</button>
          ))}
        </div>
      </div>

      {/* ── HEADER ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 52,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10,10,15,0.9)", backdropFilter: "blur(12px)",
        position: "sticky", top: 40, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
            animation: "pulse-dot 2s infinite",
            boxShadow: "0 0 6px #22c55e"
          }} />
          <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "'Space Mono', monospace" }}>
            {accounts.length} ACCOUNTS
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suchen..."
            style={{
              ...inputStyle, width: 180, padding: "6px 12px",
              fontSize: 12, background: "rgba(255,255,255,0.04)"
            }}
          />
          <button onClick={handleSyncAll} style={{
            padding: "6px 14px",
            background: "rgba(255,70,85,0.1)", border: "1px solid rgba(255,70,85,0.3)",
            borderRadius: 4, color: "#ff4655", fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
          }}>
            ↻ ALLE SYNC
          </button>
          <button onClick={() => setShowBackup(true)} title="Accounts sichern / einlesen" style={{
            padding: "6px 12px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4, color: "#6b7280", fontSize: 13, marginRight: 6,
          }}>
            ⤓
          </button>

          <button onClick={() => { refreshSecurity(); setShowSettings(true); }} title="Einstellungen" style={{
            padding: "6px 12px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4, color: "#6b7280", fontSize: 13,
          }}>
            ⚙
          </button>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1, overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: "clamp(180px, 22vw, 248px)", borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          background: "rgba(8,8,13,0.8)", flexShrink: 0,
        }}>
          <div style={{ padding: "12px 12px 6px" }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: "#374151", fontFamily: "'Space Mono', monospace" }}>
              ACCOUNTS
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
            {filtered.map((acc) => {
              const isActive = selected?.index === acc.index;
              const d = acc.cachedData;
              return (
                <div
                  key={acc.index}
                  className="card-hover"
                  onClick={() => { setSelected(acc); setTab("overview"); }}
                  style={{
                    borderRadius: 6, padding: "10px 12px", marginBottom: 3,
                    background: isActive ? "rgba(255,70,85,0.1)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(255,70,85,0.3)" : "transparent"}`,
                    cursor: "pointer", position: "relative", overflow: "hidden",
                    borderLeft: isActive ? "3px solid #ff4655" : "3px solid transparent",
                    transition: "all 0.18s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    {/* Profile image or letter avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${acc.isMain ? "#ff4655" : "rgba(255,255,255,0.08)"}`,
                      overflow: "hidden",
                      boxShadow: acc.isMain ? "0 0 10px rgba(255,70,85,0.2)" : "none",
                    }}>
                      {d?.cardImageUrl ? (
                        <img src={d.cardImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{
                          width: "100%", height: "100%",
                          background: "linear-gradient(135deg, #1a1a2e, #0f0f1a)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 15, fontWeight: 700, color: acc.isMain ? "#ff4655" : "#6b7280"
                        }}>{acc.riotName[0]}</div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e8e8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {acc.riotName}
                        </span>
                        {acc.isMain && (
                          <span style={{
                            fontSize: 7, padding: "1px 4px",
                            background: "rgba(255,70,85,0.2)", border: "1px solid rgba(255,70,85,0.4)",
                            borderRadius: 2, color: "#ff4655", letterSpacing: 1,
                            fontFamily: "'Space Mono', monospace", flexShrink: 0
                          }}>MAIN</span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {d?.rankImageUrl && <img src={d.rankImageUrl} alt="" style={{ width: 14, height: 14 }} />}
                        <span style={{ fontSize: 11, color: rankColor(d?.rankName), fontWeight: 600 }}>
                          {d?.rankName || "—"}
                        </span>
                        <span style={{ fontSize: 10, color: "#374151" }}>#{acc.riotTag}</span>
                      </div>
                    </div>

                    {/* Sync indicator */}
                    {syncing[acc.index] && (
                      <div style={{ fontSize: 14, animation: "spin 1s linear infinite" }}>↻</div>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div style={{ padding: "20px 12px", color: "#374151", fontSize: 12, fontFamily: "'Space Mono', monospace", textAlign: "center" }}>
                {search ? "KEINE TREFFER" : "KEIN ACCOUNT"}
              </div>
            )}
          </div>

          {/* Add Button */}
          <div style={{ padding: 10 }}>
            <button
              onClick={() => setModal("add")}
              style={{
                width: "100%", padding: "9px",
                background: "transparent", border: "1px dashed rgba(255,255,255,0.1)",
                borderRadius: 6, color: "#4b5563", fontSize: 12, fontWeight: 600,
                letterSpacing: 1, transition: "all 0.18s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#ff4655";
                e.currentTarget.style.color = "#ff4655";
                e.currentTarget.style.background = "rgba(255,70,85,0.05)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "#4b5563";
                e.currentTarget.style.background = "transparent";
              }}
            >
              + ACCOUNT HINZUFÜGEN
            </button>
          </div>
        </aside>

        {/* ── DETAIL PANEL ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selected ? (
            <div key={selected.index} style={{ display: "flex", flexDirection: "column", height: "100%", animation: "fadeUp 0.2s ease" }}>

              {/* Hero */}
              <div style={{
                padding: "20px 28px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: `linear-gradient(to right, rgba(255,70,85,0.04), transparent)`,
                position: "relative"
              }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                  background: `linear-gradient(to bottom, transparent, ${rc}, transparent)`
                }} />

                <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 60, height: 60, borderRadius: 10, flexShrink: 0,
                    border: `2px solid ${selected.isMain ? "#ff4655" : "rgba(255,255,255,0.1)"}`,
                    overflow: "hidden",
                    boxShadow: selected.isMain ? "0 0 20px rgba(255,70,85,0.25)" : "none",
                  }}>
                    {data?.cardImageUrl ? (
                      <img src={data.cardImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        background: "linear-gradient(135deg, #1a1a2e, #0f0f1a)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 24, fontWeight: 700, color: selected.isMain ? "#ff4655" : "#9ca3af"
                      }}>{selected.riotName[0]}</div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, letterSpacing: 2, color: "#fff", lineHeight: 1 }}>
                        {selected.riotName}
                      </h1>
                      <span style={{ fontSize: 15, color: "#374151" }}>#{selected.riotTag}</span>
                      {selected.isMain && (
                        <span style={{
                          fontSize: 8, padding: "2px 7px",
                          background: "rgba(255,70,85,0.15)", border: "1px solid rgba(255,70,85,0.5)",
                          borderRadius: 2, color: "#ff4655", letterSpacing: 2,
                          fontFamily: "'Space Mono', monospace"
                        }}>MAIN</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {data?.rankImageUrl && <img src={data.rankImageUrl} alt="" style={{ width: 22, height: 22 }} />}
                      <span style={{ fontSize: 14, fontWeight: 600, color: rc }}>
                        {data?.rankName || "Unranked"}
                      </span>
                      {data?.rr != null && (
                        <>
                          <span style={{ color: "#374151", fontSize: 11 }}>|</span>
                          <span style={{ fontSize: 12, fontFamily: "'Space Mono', monospace", color: data.rr > 50 ? "#22c55e" : "#f59e0b" }}>
                            {data.rr} RR
                          </span>
                        </>
                      )}
                      {data?.level != null && (
                        <>
                          <span style={{ color: "#374151", fontSize: 11 }}>|</span>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>
                            LVL <span style={{ color: "#9ca3af", fontFamily: "'Space Mono', monospace" }}>{data.level}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {[
                      { label: "LOGIN", color: "#ff4655", bg: "rgba(255,70,85,0.15)", border: "rgba(255,70,85,0.4)", action: handleLogin },
                      { label: syncing[selected.index] ? "SYNC..." : "SYNC", color: "#9ca3af", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", action: () => handleSync(selected.index) },
                      { label: "EDIT", color: "#9ca3af", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", action: () => setModal("edit") },
                      !selected.isMain && { label: "★ MAIN", color: "#ffd700", bg: "rgba(255,215,0,0.07)", border: "rgba(255,215,0,0.25)", action: () => handleSetMain(selected.index) },
                      { label: "✕", color: "#ef4444", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.25)", action: () => setModal("delete") },
                    ].filter(Boolean).map(btn => (
                      <button key={btn.label} onClick={btn.action} disabled={syncing[selected.index] && btn.label.includes("SYNC")} style={{
                        padding: "7px 14px", background: btn.bg,
                        border: `1px solid ${btn.border}`, borderRadius: 4,
                        color: btn.color, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                        transition: "all 0.15s ease",
                      }}
                        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                      >{btn.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{
                display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)",
                padding: "0 28px", background: "rgba(8,8,13,0.5)"
              }}>
                {["overview", "credentials"].map(t => (
                  <button
                    key={t} className={`tab-btn ${tab === t ? "active" : ""}`}
                    onClick={() => setTab(t)}
                    style={{
                      position: "relative", padding: "10px 18px",
                      background: "none", border: "none",
                      fontSize: 11, fontWeight: 700, letterSpacing: 2,
                      textTransform: "uppercase",
                      color: tab === t ? "#ff4655" : "#4b5563",
                      transition: "color 0.15s ease",
                    }}
                  >{t}</button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
                {tab === "overview" && (
                  <OverviewTab
                    account={selected}
                    data={data}
                    onSync={() => handleSync(selected.index)}
                    syncing={syncing[selected.index]}
                  />
                )}
                {tab === "credentials" && (
                  <CredentialsTab index={selected.index} riotName={selected.riotName} riotTag={selected.riotTag} />
                )}
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 16, color: "#374151"
            }}>
              <div style={{ fontSize: 40 }}>⬅</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: 2 }}>
                ACCOUNT AUSWÄHLEN
              </div>
              {/* flex:"0 0 auto" hebt das flex:1 aus saveBtnStyle auf. In den
                  Dialogen steht der Knopf in einer Zeile (dort teilt flex:1 die
                  Breite auf) — hier in einer Spalte, wo es ihn ueber die ganze
                  Fensterhoehe strecken wuerde. */}
              <button
                onClick={() => setModal("add")}
                style={{ ...saveBtnStyle, flex: "0 0 auto", padding: "11px 22px" }}
              >
                + ERSTEN ACCOUNT ANLEGEN
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ── MODALS ── */}
      {modal === "add" && (
        <AccountModal onClose={() => setModal(null)} onSave={handleCreate} />
      )}
      {modal === "edit" && selected && (
        <AccountModal
          account={selected} index={selected.index}
          onClose={() => setModal(null)} onSave={handleEdit}
        />
      )}
      {modal === "delete" && selected && (
        <DeleteModal
          name={`${selected.riotName}#${selected.riotTag}`}
          onConfirm={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      {/* API-Key in den Einstellungen wechseln */}
      {showKeySettings && (
        <ApiKeyManager
          mode="settings"
          onClose={() => setShowKeySettings(false)}
          onSaved={() => { setShowKeySettings(false); showToast("API-Key aktualisiert!"); }}
        />
      )}

      {/* Grundeinstellungen — Ersteinrichtung (Schritt 2) und Zahnrad */}
      {(setupStep2 || showSettings) && (
        <BasicSettings
          status={security}
          setupMode={setupStep2}
          onChanged={refreshSecurity}
          showToast={showToast}
          onOpenBackup={() => setShowBackup(true)}
          onOpenApiKey={() => setShowKeySettings(true)}
          onFinish={() => setSetupStep2(false)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Sicherung: Export & Import */}
      {showBackup && (
        <BackupManager
          onClose={() => setShowBackup(false)}
          onImported={() => { setSelected(null); loadAccounts(); }}
          showToast={showToast}
        />
      )}

      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Shared Styles ───────────────────────────────────
const inputStyle = {
  width: "100%", padding: "9px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, color: "#e8e8e8",
  fontSize: 13, outline: "none", resize: "vertical",
};

// Kleiner Knopf für Einstellungs-Zeilen (EINSCHALTEN / ÄNDERN / ...)
const smallBtnStyle = {
  padding: "5px 10px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 5, color: "#d1d5db",
  fontSize: 9, letterSpacing: 1.2, cursor: "pointer",
  fontFamily: "'Space Mono', monospace",
};

const cancelBtnStyle = {
  flex: 1, padding: "10px",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#6b7280", fontSize: 12, letterSpacing: 2, fontWeight: 700,
  cursor: "pointer",
};

const saveBtnStyle = {
  flex: 1, padding: "10px",
  background: "rgba(255,70,85,0.15)", border: "1px solid rgba(255,70,85,0.4)",
  borderRadius: 6, color: "#ff4655", fontSize: 12, letterSpacing: 2, fontWeight: 700,
  cursor: "pointer",
};

const iconBtnStyle = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 4, padding: "3px 8px", color: "#6b7280",
  fontSize: 10, letterSpacing: 0.5, fontFamily: "'Space Mono', monospace",
  cursor: "pointer", transition: "all 0.15s ease",
};
