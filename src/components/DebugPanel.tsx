import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import debugLogger, { type LogEntry, type LogLevel } from "@/utils/debugLogger";

// ============================================================
// CellManagerPro — Debug Panel
// Painel de diagnóstico in-app visível apenas para admins.
// Mostra logs, status de conexão, e informações do sistema.
// ============================================================

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "#6b7280",
  INFO: "#3b82f6",
  WARN: "#f59e0b",
  ERROR: "#ef4444",
};

type DbHealthStatus = "checking" | "healthy" | "degraded" | "error";

interface DbTableHealth {
  name: string;
  status: "ok" | "error";
  rows?: number;
  error?: string;
  ms?: number;
}

const DebugPanel = () => {
  const { user, userRole, activeStoreId } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"logs" | "system" | "health">("logs");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel | "ALL">("ALL");
  const [dbHealth, setDbHealth] = useState<DbHealthStatus>("checking");
  const [tableHealth, setTableHealth] = useState<DbTableHealth[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);


  const refreshLogs = useCallback(() => {
    const allLogs = debugLogger.getLogs();
    setLogs([...allLogs].reverse());
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshLogs();
      const interval = setInterval(refreshLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen, refreshLogs]);

  const checkDbHealth = async () => {
    setIsCheckingHealth(true);
    setDbHealth("checking");
    const tables = ["products", "stores", "sales", "customers", "accessories", "user_roles", "profiles", "transactions"];
    const results: DbTableHealth[] = [];

    for (const table of tables) {
      const start = performance.now();
      try {
        const { count, error } = await supabase.from(table as any).select("*", { count: "exact", head: true });
        const ms = Math.round(performance.now() - start);
        if (error) {
          results.push({ name: table, status: "error", error: error.message, ms });
        } else {
          results.push({ name: table, status: "ok", rows: count ?? 0, ms });
        }
      } catch (e) {
        results.push({ name: table, status: "error", error: e.message, ms: Math.round(performance.now() - start) });
      }
    }

    setTableHealth(results);
    const hasError = results.some(r => r.status === "error");
    setDbHealth(hasError ? "degraded" : "healthy");
    setIsCheckingHealth(false);

    debugLogger.info("Health check completed", {
      status: hasError ? "degraded" : "healthy",
      tables: results.map(r => `${r.name}:${r.status}`).join(", "),
    });
  };

  const filteredLogs = filterLevel === "ALL" ? logs : logs.filter(l => l.level === filterLevel);
  const counts = debugLogger.getCounts();

  const healthIcon = {
    checking: "🔄",
    healthy: "🟢",
    degraded: "🟡",
    error: "🔴",
  };

  // Apenas admins podem ver o painel
  if (userRole !== "admin") return null;

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          border: "none",
          background: counts.ERROR > 0
            ? "linear-gradient(135deg, #ef4444, #dc2626)"
            : "linear-gradient(135deg, #6366f1, #4f46e5)",
          color: "#fff",
          fontSize: "1.3rem",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => {
          (e.currentTarget).style.transform = "scale(1.1)";
        }}
        onMouseLeave={e => {
          (e.currentTarget).style.transform = "scale(1)";
        }}
        title="Debug Panel"
      >
        🐛
        {counts.ERROR > 0 && (
          <span style={{
            position: "absolute",
            top: "-4px",
            right: "-4px",
            background: "#ef4444",
            color: "#fff",
            fontSize: "0.65rem",
            fontWeight: 700,
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #1a1a2e",
          }}>
            {counts.ERROR > 9 ? "9+" : counts.ERROR}
          </span>
        )}
      </button>

      {/* Painel */}
      {isOpen && (
        <div style={{
          position: "fixed",
          bottom: "80px",
          right: "20px",
          width: "420px",
          maxHeight: "70vh",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(15,15,30,0.97)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          color: "#e2e8f0",
        }}>
          {/* Header */}
          <div style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>🐛 Debug Panel</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => debugLogger.downloadLogs()} style={smallBtnStyle} title="Exportar Logs">
                📥
              </button>
              <button onClick={() => { debugLogger.clear(); refreshLogs(); }} style={smallBtnStyle} title="Limpar Logs">
                🗑️
              </button>
              <button onClick={() => setIsOpen(false)} style={smallBtnStyle}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            {(["logs", "system", "health"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "0.6rem",
                  border: "none",
                  background: activeTab === tab ? "rgba(99,102,241,0.15)" : "transparent",
                  color: activeTab === tab ? "#818cf8" : "#64748b",
                  fontSize: "0.8rem",
                  fontWeight: activeTab === tab ? 600 : 400,
                  cursor: "pointer",
                  borderBottom: activeTab === tab ? "2px solid #818cf8" : "2px solid transparent",
                  textTransform: "capitalize",
                }}
              >
                {tab === "logs" ? `📋 Logs (${logs.length})` : tab === "system" ? "⚙️ Sistema" : `${healthIcon[dbHealth]} Saúde`}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", padding: "0.75rem" }}>
            {activeTab === "logs" && (
              <>
                {/* Filtros */}
                <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  {(["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setFilterLevel(level)}
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "6px",
                        border: filterLevel === level ? "1px solid #818cf8" : "1px solid rgba(255,255,255,0.1)",
                        background: filterLevel === level ? "rgba(99,102,241,0.2)" : "transparent",
                        color: level === "ALL" ? "#e2e8f0" : LEVEL_COLORS[level],
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {level} {level !== "ALL" ? `(${counts[level]})` : ""}
                    </button>
                  ))}
                </div>

                {/* Log entries */}
                {filteredLogs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#64748b", padding: "2rem 0", fontSize: "0.85rem" }}>
                    Nenhum log encontrado
                  </div>
                ) : (
                  filteredLogs.map(entry => (
                    <div
                      key={entry.id}
                      style={{
                        padding: "0.5rem 0.6rem",
                        marginBottom: "0.35rem",
                        borderRadius: "8px",
                        background: entry.level === "ERROR" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
                        borderLeft: `3px solid ${LEVEL_COLORS[entry.level]}`,
                        fontSize: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                        <span style={{ color: LEVEL_COLORS[entry.level], fontWeight: 600 }}>
                          {entry.level}
                        </span>
                        <span style={{ color: "#475569", fontSize: "0.65rem" }}>
                          {new Date(entry.timestamp).toLocaleTimeString("pt-BR")} · {entry.page}
                        </span>
                      </div>
                      <div style={{ color: "#cbd5e1", wordBreak: "break-word" }}>
                        {entry.message}
                      </div>
                      {entry.context && Object.keys(entry.context).length > 0 && (
                        <pre style={{
                          fontSize: "0.65rem",
                          color: "#64748b",
                          marginTop: "0.3rem",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}>
                          {JSON.stringify(entry.context, null, 1)}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === "system" && (
              <div style={{ fontSize: "0.8rem" }}>
                <InfoRow label="User ID" value={user?.id ?? "N/A"} />
                <InfoRow label="Email" value={user?.email ?? "N/A"} />
                <InfoRow label="Role" value={userRole ?? "N/A"} />
                <InfoRow label="Store ID" value={activeStoreId ?? "N/A"} />
                <InfoRow label="Supabase URL" value={import.meta.env.VITE_SUPABASE_URL ?? "N/A"} />
                <InfoRow label="Project ID" value={import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "N/A"} />
                <InfoRow label="Ambiente" value={import.meta.env.DEV ? "Desenvolvimento" : "Produção"} />
                <InfoRow label="User Agent" value={navigator.userAgent.substring(0, 60) + "..."} />
                <InfoRow label="Timestamp" value={new Date().toLocaleString("pt-BR")} />
                <InfoRow label="Logs em memória" value={`${logs.length} / 200`} />
                <InfoRow label="Erros capturados" value={String(counts.ERROR)} highlight={counts.ERROR > 0} />
              </div>
            )}

            {activeTab === "health" && (
              <div>
                <button
                  onClick={checkDbHealth}
                  disabled={isCheckingHealth}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "10px",
                    border: "none",
                    background: isCheckingHealth ? "#374151" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    cursor: isCheckingHealth ? "not-allowed" : "pointer",
                    marginBottom: "1rem",
                  }}
                >
                  {isCheckingHealth ? "🔄 Verificando..." : "🏥 Verificar Saúde do DB"}
                </button>

                {tableHealth.length > 0 && (
                  <>
                    <div style={{
                      textAlign: "center",
                      padding: "0.5rem",
                      marginBottom: "0.75rem",
                      borderRadius: "8px",
                      background: dbHealth === "healthy" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                      color: dbHealth === "healthy" ? "#22c55e" : "#f59e0b",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}>
                      {healthIcon[dbHealth]} {dbHealth === "healthy" ? "Tudo Saudável" : "Problemas Detectados"}
                    </div>

                    {tableHealth.map(t => (
                      <div
                        key={t.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.4rem 0.6rem",
                          marginBottom: "0.25rem",
                          borderRadius: "6px",
                          background: t.status === "ok" ? "rgba(255,255,255,0.03)" : "rgba(239,68,68,0.08)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span style={{ color: "#cbd5e1" }}>
                          {t.status === "ok" ? "✅" : "❌"} {t.name}
                        </span>
                        <span style={{ color: "#64748b" }}>
                          {t.status === "ok" ? `${t.rows} rows · ${t.ms}ms` : t.error?.substring(0, 30)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// ── Sub-components ──────────────────────────────────────────
const smallBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#94a3b8",
  width: "32px",
  height: "32px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.85rem",
};

const InfoRow = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    padding: "0.45rem 0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  }}>
    <span style={{ color: "#64748b", fontWeight: 500 }}>{label}</span>
    <span style={{
      color: highlight ? "#ef4444" : "#cbd5e1",
      fontWeight: highlight ? 700 : 400,
      maxWidth: "60%",
      textAlign: "right",
      wordBreak: "break-all",
      fontSize: "0.75rem",
    }}>
      {value}
    </span>
  </div>
);

export default DebugPanel;
