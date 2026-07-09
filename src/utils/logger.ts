import { supabase } from "@/integrations/supabase/client";

type ErrorSeverity = "info" | "warning" | "error";

export const logSystemError = async (
  module: string,
  message: string,
  severity: ErrorSeverity = "error",
  details?: Record<string, any>
) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.warn("[Logger] Usuário não autenticado. Erro não registrado:", message);
      return;
    }

    const store_id = session.user.app_metadata?.store_id;

    if (!store_id) {
       console.warn("[Logger] Store ID não encontrado no usuário. Erro não registrado:", message);
       return;
    }

    await supabase.from("error_logs" as any).insert({
      store_id,
      module,
      message,
      severity,
      details: details || {}
    });

  } catch (err) {
    console.error("[Logger] Falha ao registrar log de erro no banco:", err);
  }
};
