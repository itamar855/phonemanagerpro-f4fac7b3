import { supabase } from "@/integrations/supabase/client";

type ErrorSeverity = "info" | "warning" | "error";

class StructuredLogger {
  private correlationId: string;

  constructor() {
    this.correlationId = crypto.randomUUID();
  }

  public getCorrelationId() {
    return this.correlationId;
  }

  public renewCorrelationId() {
    this.correlationId = crypto.randomUUID();
  }

  public async logSystemError(
    module: string,
    message: string,
    severity: ErrorSeverity = "error",
    details?: Record<string, any>
  ) {
    const payload = {
      ...details,
      correlationId: this.correlationId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    if (severity === "error") {
      console.error(`[${severity.toUpperCase()}] [${this.correlationId}] ${module}: ${message}`, payload);
    } else if (severity === "warning") {
      console.warn(`[${severity.toUpperCase()}] [${this.correlationId}] ${module}: ${message}`, payload);
    } else {
      console.info(`[${severity.toUpperCase()}] [${this.correlationId}] ${module}: ${message}`, payload);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        return;
      }

      const store_id = session.user.app_metadata?.store_id;

      if (!store_id) {
         return;
      }

      await supabase.from("error_logs" as any).insert({
        store_id,
        module,
        message,
        severity,
        details: payload
      });
    } catch (err) {
      console.error("[Logger] Falha ao registrar log de erro no banco:", err);
    }
  }

  public info(module: string, message: string, details?: Record<string, any>) {
    return this.logSystemError(module, message, "info", details);
  }

  public warn(module: string, message: string, details?: Record<string, any>) {
    return this.logSystemError(module, message, "warning", details);
  }

  public error(module: string, message: string, details?: Record<string, any>) {
    return this.logSystemError(module, message, "error", details);
  }
}

export const logger = new StructuredLogger();
export const logSystemError = logger.logSystemError.bind(logger);

