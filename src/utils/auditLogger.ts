import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "./logger";

export type AuditAction = 
  | "CREATE_SALE" 
  | "UPDATE_OS_STATUS" 
  | "UPDATE_PRODUCT_PRICE" 
  | "CREATE_RECORD"
  | "UPDATE_RECORD"
  | "DELETE_RECORD" 
  | "LOGIN" 
  | "TRANSFER_STOCK";

export const logAction = async (
  action: AuditAction,
  entityType?: string,
  entityId?: string,
  oldValues?: any,
  newValues?: any,
  storeId?: string | null
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-12a-f]{12}$/i.test(str);
    let finalStoreId = (storeId && isUUID(storeId)) ? storeId : null;
    
    if (!finalStoreId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      finalStoreId = profile?.store_id;
    }

    const _meta = {
      correlationId: logger.getCorrelationId(),
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };

    const { error } = await supabase.from("audit_logs").insert({
      user_id: user.id,
      store_id: finalStoreId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_state: oldValues,
      after_state: newValues ? { ...newValues, _meta } : { _meta },
    } as any);

    if (error) {
      console.error("Audit Log Error:", error);
      toast.error("Erro ao gravar Auditoria: " + error.message);
    }
  } catch (error: any) {
    console.error("Failed to log action:", error);
  }
};
