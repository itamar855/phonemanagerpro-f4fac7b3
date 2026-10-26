import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const createPendingCashEntry = async (
  storeId: string,
  userId: string,
  amount: number,
  description: string,
  paymentMethod = "dinheiro",
  receiptUrl: string | null = null,
  referenceId: string | null = null,
  confirmed = false
) => {
  if (!storeId || amount <= 0) return;
  
  let query = supabase
    .from("cash_registers" as any)
    .select("id, store_id")
    .eq("status", "open")
    .eq("opened_by", userId);
    
  if (storeId !== "all") {
    query = query.eq("store_id", storeId);
  }

  let { data: register, error: regError } = await query.maybeSingle();

  if (regError) {
    console.error("Erro ao buscar caixa do usuário (OS):", regError);
  }

  if (!register) {
    let fallbackQuery = supabase
      .from("cash_registers" as any)
      .select("id, store_id")
      .eq("status", "open");
      
    if (storeId !== "all") {
      fallbackQuery = fallbackQuery.eq("store_id", storeId);
    }
    
    const { data: fallbackRegister, error: fallError } = await fallbackQuery.limit(1).maybeSingle();
      
    if (fallError) {
      console.error("Erro ao buscar caixa fallback (OS):", fallError);
    }
    register = fallbackRegister;
  }
  
  const registerId = register ? (register as any).id : null;

  if (registerId) {
    const actualStoreId = (register as any)?.store_id || (storeId !== "all" ? storeId : null);
    const isCash = paymentMethod === "dinheiro";
    const isConfirmed = Boolean(confirmed) || isCash;

    const { error: insertError } = await supabase.from("cash_entries" as any).insert({
      cash_register_id: registerId,
      store_id: actualStoreId,
      type: "entrada",
      amount,
      description,
      payment_method: paymentMethod,
      receipt_url: receiptUrl || null,
      confirmed: isConfirmed,
      created_by: userId,
      reference_id: referenceId || null,
    } as any);
    
    if (insertError) {
      console.error("Erro ao inserir cash_entry (OS):", insertError);
      toast.error("Erro ao registrar no caixa: " + insertError.message);
    }
  } else {
    console.warn("Nenhum caixa aberto encontrado para storeId:", storeId);
    toast.error("Aviso: Nenhum caixa aberto na loja atual. O valor da OS não foi para o caixa!");
  }
};
