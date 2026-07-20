import { supabase } from "@/integrations/supabase/client";

export const formatDescription = (desc: string | null) => {
  if (!desc) return "";
  const match = desc.match(/\[MISTO:(\{.*\})\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const parts = [];
      if (parsed.dinheiro > 0) parts.push(`Dinheiro: R$ ${parsed.dinheiro}`);
      if (parsed.pix > 0) parts.push(`PIX: R$ ${parsed.pix}`);
      if (parsed.cartao_credito > 0) parts.push(`Cartão: R$ ${parsed.cartao_credito}`);
      return desc.replace(match[0], `[Misto: ${parts.join(" | ")}]`);
    } catch (e) {
      return desc;
    }
  }
  return desc;
};

export const createPendingCashEntry = async (storeId: string | null, userId: string, amount: number, description: string, paymentMethod: string, retroDate?: string, referenceKey?: string) => {
  let query = supabase
    .from("cash_registers" as any)
    .select("id, store_id")
    .eq("status", "open")
    .eq("opened_by", userId);
    
  if (storeId && storeId !== "all") {
    query = query.eq("store_id", storeId);
  }

  let { data: register, error: regError } = await query.maybeSingle();

  if (regError) {
    console.error("Erro ao buscar caixa do usuário:", regError);
  }

  if (!register) {
    let fallbackQuery = supabase
      .from("cash_registers" as any)
      .select("id, store_id")
      .eq("status", "open");
      
    if (storeId && storeId !== "all") {
      fallbackQuery = fallbackQuery.eq("store_id", storeId);
    }
    
    const { data: fallbackRegister, error: fallError } = await fallbackQuery.limit(1).maybeSingle();
      
    if (fallError) {
      console.error("Erro ao buscar caixa fallback:", fallError);
    }
    register = fallbackRegister;
  }

  const registerId = register ? (register as any).id : null;

  if (registerId) {
    const actualStoreId = (register as any)?.store_id || (storeId !== "all" ? storeId : null);
    const { error: insertError } = await supabase.from("cash_entries" as any).insert({
      cash_register_id: registerId, store_id: actualStoreId,
      type: "entrada", amount, description,
      payment_method: paymentMethod, receipt_url: null, confirmed: false, created_by: userId,
      reference_id: referenceKey || null,
      ...(retroDate ? { created_at: new Date(retroDate + "T12:00:00").toISOString() } : {}),
    });
    
    if (insertError) {
      console.error("Erro ao inserir cash_entry:", insertError);
      throw new Error(insertError.message);
    }
  } else {
    console.warn("Nenhum caixa aberto encontrado para storeId:", storeId);
    throw new Error("Nenhum caixa aberto na loja atual. Abra um caixa antes de registrar a venda!");
  }
};
