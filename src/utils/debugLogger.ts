import { untypedDb } from "@/integrations/supabase/untyped";

// ============================================================
// CellManagerPro — Debug Logger
// Sistema centralizado de logs com buffer em memória,
// persistência no Supabase e exportação para JSON.
// ============================================================

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  stackTrace?: string;
  page?: string;
  userId?: string;
  storeId?: string;
}

const MAX_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];
let logCounter = 0;

// ── Cores para o console ────────────────────────────────────
const LEVEL_STYLES: Record<LogLevel, string> = {
  DEBUG: "color:#8B8B8B;font-weight:normal",
  INFO:  "color:#3B82F6;font-weight:bold",
  WARN:  "color:#F59E0B;font-weight:bold",
  ERROR: "color:#EF4444;font-weight:bold",
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  DEBUG: "🔍",
  INFO:  "ℹ️",
  WARN:  "⚠️",
  ERROR: "❌",
};

// ── Helpers ─────────────────────────────────────────────────
function getPage(): string {
  try {
    return window.location.pathname;
  } catch {
    return "unknown";
  }
}

function getUserId(): string | undefined {
  try {
    const raw = localStorage.getItem("sb-hzrqtolfbwnmmeliazmh-auth-token");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user?.id;
    }
  } catch { /* ignore */ }
  return undefined;
}

function getStoreId(): string | undefined {
  try {
    return localStorage.getItem("cellmanager-active-store-id") ?? undefined;
  } catch {
    return undefined;
  }
}

function generateId(): string {
  return `log_${Date.now()}_${++logCounter}`;
}

// ── Core log function ───────────────────────────────────────
function log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
  const entry: LogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    page: getPage(),
    userId: getUserId(),
    storeId: getStoreId(),
  };

  if (error?.stack) {
    entry.stackTrace = error.stack;
  }

  // Buffer circular
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Console output
  const icon = LEVEL_ICONS[level];
  const style = LEVEL_STYLES[level];
  const ts = new Date(entry.timestamp).toLocaleTimeString("pt-BR");

  if (level === "ERROR") {
    console.error(`${icon} %c[${level}]%c ${ts} — ${message}`, style, "", context ?? "", error ?? "");
  } else if (level === "WARN") {
    console.warn(`${icon} %c[${level}]%c ${ts} — ${message}`, style, "", context ?? "");
  } else {
    console.log(`${icon} %c[${level}]%c ${ts} — ${message}`, style, "", context ?? "");
  }

  // Persistir erros críticos no Supabase (fire-and-forget)
  if (level === "ERROR") {
    persistLog(entry).catch(() => {/* silently fail */});
  }

  return entry;
}

// ── Persistência no Supabase ────────────────────────────────
async function persistLog(entry: LogEntry): Promise<void> {
  try {
    await untypedDb.from("debug_logs").insert({
      level: entry.level,
      message: entry.message,
      context: {
        ...entry.context,
        page: entry.page,
        userId: entry.userId,
        storeId: entry.storeId,
      },
      stack_trace: entry.stackTrace ?? null,
    });
  } catch {
    // Se falhar, não faz nada — não queremos loops de erro
  }
}

// ── API Pública ─────────────────────────────────────────────
export const debugLogger = {
  debug(message: string, context?: Record<string, unknown>) {
    return log("DEBUG", message, context);
  },

  info(message: string, context?: Record<string, unknown>) {
    return log("INFO", message, context);
  },

  warn(message: string, context?: Record<string, unknown>) {
    return log("WARN", message, context);
  },

  error(message: string, context?: Record<string, unknown>, error?: Error) {
    return log("ERROR", message, context, error);
  },

  /** Retorna todos os logs no buffer (mais recentes por último) */
  getLogs(): LogEntry[] {
    return [...logBuffer];
  },

  /** Retorna apenas logs de um nível específico */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return logBuffer.filter(l => l.level === level);
  },

  /** Limpa o buffer de logs */
  clear() {
    logBuffer.length = 0;
    logCounter = 0;
  },

  /** Exporta todos os logs como JSON para download */
  exportLogs(): string {
    const exportData = {
      exportedAt: new Date().toISOString(),
      appVersion: import.meta.env.VITE_APP_VERSION ?? "dev",
      supabaseProject: import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "unknown",
      userAgent: navigator.userAgent,
      logs: logBuffer,
    };
    return JSON.stringify(exportData, null, 2);
  },

  /** Baixa os logs como arquivo JSON */
  downloadLogs() {
    const data = this.exportLogs();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cellmanager-debug-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Conta logs por nível */
  getCounts(): Record<LogLevel, number> {
    const counts: Record<LogLevel, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
    logBuffer.forEach(l => { counts[l.level]++; });
    return counts;
  },
};

// ── Global Error Handlers ───────────────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    debugLogger.error("Uncaught Error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    }, event.error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    debugLogger.error("Unhandled Promise Rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    }, reason instanceof Error ? reason : undefined);
  });
}

export default debugLogger;
