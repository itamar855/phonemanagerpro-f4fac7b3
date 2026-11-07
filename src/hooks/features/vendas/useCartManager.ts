import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createPendingCashEntry } from "@/lib/services/salesService";
import { gerarNotaFiscalInterna, type NotaFiscalData } from "@/utils/notaFiscalInterna";

type Accessory = { id: string; store_id: string; name: string; category: string; brand: string | null; quantity: number; cost_price: number; sale_price: number | null };
type CartItem = { acc: Accessory; qty: number; price: number };

const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const useCartManager = (
  accessories: Accessory[],
  activeStoreId: string | null,
  user: any,
  setLoading: (loading: boolean) => void,
  fetchData: () => void,
  stores: any[]
) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [accSearch, setAccSearch] = useState("");
  const [pdvOpen, setPdvOpen] = useState(false);
  const [pdvPayment, setPdvPayment] = useState({ cash: "", card: "", pix: "", customer: "", cpfCnpj: "", store_id: "" });
  
  const isPdvSubmitting = useRef(false);

  const filteredAcc = accessories.filter(a => a.name.toLowerCase().includes(accSearch.toLowerCase()) || (a.brand && a.brand.toLowerCase().includes(accSearch.toLowerCase())));

  const addToCart = (acc: Accessory) => {
    setCart(prev => {
      const ex = prev.find(i => i.acc.id === acc.id);
      if (ex) return prev.map(i => i.acc.id === acc.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { acc, qty: 1, price: acc.sale_price ?? acc.cost_price }];
    });
  };

  const updateCartQty = (id: string, qty: number) => qty <= 0 ? setCart(p => p.filter(i => i.acc.id !== id)) : setCart(p => p.map(i => i.acc.id === id ? { ...i, qty } : i));
  const updateCartPrice = (id: string, price: number) => setCart(p => p.map(i => i.acc.id === id ? { ...i, price } : i));
  
  const resetPdv = () => { setCart([]); setPdvPayment({ cash: "", card: "", pix: "", customer: "", cpfCnpj: "", store_id: activeStoreId || "" }); setAccSearch(""); };

  const handlePdvSubmit = async (
    gerarNotinha = false,
    pdvCash: number,
    pdvCard: number,
    pdvPix: number,
    pdvTroco: number,
    cartTotal: number,
    subtotal?: number,
    discount?: number,
    discountType?: "fixed" | "percent"
  ) => {
    if (!user || cart.length === 0 || !activeStoreId) return;
    if (isPdvSubmitting.current) return;
    
    const storeToUse = (activeStoreId === "all" && pdvPayment.store_id) ? pdvPayment.store_id : activeStoreId;
    if (storeToUse === "all") {
      toast.error("Por favor, selecione a Loja da Venda antes de registrar!");
      return;
    }
    
    isPdvSubmitting.current = true;
    setLoading(true);
    try {
      // 1. Validar e atualizar estoque de cada item no banco de dados
      for (const item of cart) {
        const { data: currentAcc, error: fetchErr } = await supabase
          .from("accessories" as any)
          .select("quantity, name")
          .eq("id", item.acc.id)
          .single() as any;

        if (fetchErr || !currentAcc) {
          throw new Error(`Acessório ${item.acc.name} não encontrado no estoque.`);
        }

        const currentQty = Number(currentAcc.quantity || 0);
        if (currentQty < item.qty) {
          throw new Error(`Estoque insuficiente para "${currentAcc.name}". Disponível: ${currentQty}, solicitado: ${item.qty}.`);
        }

        const newQty = Math.max(0, currentQty - item.qty);
        const { error: accError } = await supabase
          .from("accessories" as any)
          .update({ quantity: newQty })
          .eq("id", item.acc.id);
        
        if (accError) throw new Error(`Erro ao atualizar estoque de ${item.acc.name}: ${accError.message}`);
      }

      const discountLabel = discount && discount > 0 ? ` (Desc: ${formatCurrency(discount)})` : "";
      const desc = `PDV: ${cart.map(i => `${i.qty}x ${i.acc.name}`).join(", ")}${discountLabel}${pdvPayment.customer ? ` → ${pdvPayment.customer}` : ""}`;
      let txIdForNote: string | undefined = undefined;
      const pdvMetadata = {
        cart: cart.map(i => ({ id: i.acc.id, qty: i.qty, price: i.price })),
        subtotal: subtotal ?? cartTotal,
        discount: discount ?? 0,
        discount_type: discountType ?? "fixed",
      };

      // Garante que uma falha ao lançar no caixa nunca deixe uma transação órfã:
      // se createPendingCashEntry lançar erro, desfaz a transação recém-criada
      // antes de propagar o erro, para que a venda nunca fique "meio salva".
      const createCashEntryOrRollback = async (
        amount: number, description: string, method: string, txId: string | undefined
      ) => {
        try {
          await createPendingCashEntry(storeToUse, user.id, amount, description, method, undefined, txId);
        } catch (cashErr: any) {
          if (txId) {
            await supabase.from("transactions").delete().eq("id", txId);
          }
          throw new Error(
            `Venda NÃO registrada: falha ao lançar no caixa (${cashErr.message || "erro desconhecido"}). Tente novamente.`
          );
        }
      };

      const cashAmount = pdvCash - pdvTroco;
      const paymentsCount = [cashAmount > 0, pdvCard > 0, pdvPix > 0].filter(Boolean).length;

      if (paymentsCount > 1) {
        // Mixed payment consolidation
        const descMisto = `${desc} [MISTO:{"dinheiro":${cashAmount > 0 ? cashAmount : 0},"pix":${pdvPix},"cartao_credito":${pdvCard}}]`;
        const { data: tx, error: txError } = await supabase.from("transactions").insert({
          type: "income", category: "acessorio", amount: cartTotal, description: descMisto, store_id: storeToUse, created_by: user.id, metadata: pdvMetadata
        }).select().single();
        if (txError) throw txError;
        if (tx) txIdForNote = tx.id;
        if (cashAmount > 0) await createCashEntryOrRollback(cashAmount, `${desc} (Parte em Dinheiro)`, "dinheiro", txIdForNote);
        if (pdvCard > 0) await createCashEntryOrRollback(pdvCard, `${desc} (Parte em Cartão)`, "cartao_credito", txIdForNote);
        if (pdvPix > 0) await createCashEntryOrRollback(pdvPix, `${desc} (Parte em PIX)`, "pix", txIdForNote);
      } else {
        if (pdvCash === 0 && pdvCard === 0 && pdvPix === 0) {
          const { data: tx, error: txError } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: cartTotal, description: desc, store_id: storeToUse, created_by: user.id, metadata: pdvMetadata }).select().single();
          if (txError) throw txError;
          txIdForNote = tx?.id;
          await createCashEntryOrRollback(cartTotal, desc, "dinheiro", txIdForNote);
        } else {
          if (pdvCash > 0) {
            if (cashAmount > 0) {
              const { data: tx, error: txError } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: cashAmount, description: `${desc} [Dinheiro]`, store_id: storeToUse, created_by: user.id, metadata: pdvMetadata }).select().single();
              if (txError) throw txError;
              if (!txIdForNote && tx) txIdForNote = tx.id;
              await createCashEntryOrRollback(cashAmount, desc, "dinheiro", tx?.id);
            }
          }
          if (pdvCard > 0) {
            const { data: tx, error: txError } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: pdvCard, description: `${desc} [Cartão]`, store_id: storeToUse, created_by: user.id, metadata: pdvMetadata }).select().single();
            if (txError) throw txError;
            if (!txIdForNote && tx) txIdForNote = tx.id;
            await createCashEntryOrRollback(pdvCard, desc, "cartao_credito", tx?.id);
          }
          if (pdvPix > 0) {
            const { data: tx, error: txError } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: pdvPix, description: `${desc} [PIX]`, store_id: storeToUse, created_by: user.id, metadata: pdvMetadata }).select().single();
            if (txError) throw txError;
            if (!txIdForNote && tx) txIdForNote = tx.id;
            await createCashEntryOrRollback(pdvPix, desc, "pix", tx?.id);
          }
        }
      }

      if (gerarNotinha && txIdForNote) {
        try {
          const storeMap = new Map(stores.map(s => [s.id, s]));
          const store = storeMap.get(storeToUse) as any;
          const numeroNota = `PDV-${txIdForNote.slice(0, 8).toUpperCase()}`;
          const data: NotaFiscalData = {
            numeroNota,
            dataVenda: new Date().toLocaleString("pt-BR"),
            lojaNome: store?.name ?? "Loja",
            lojaCnpj: store?.cnpj,
            lojaEndereco: store?.address,
            lojaTelefone: store?.phone,
            lojaWhatsapp: store?.whatsapp,
            lojaInstagram: store?.instagram,
            lojaLogoUrl: store?.logo_url,
            clienteNome: pdvPayment.customer || undefined,
            clienteCpf: pdvPayment.cpfCnpj || undefined,
            produtoNome: "Venda Rápida (Acessórios)",
            produtoMarca: "",
            observacoes: cart.map(i => `${i.qty}x ${i.acc.name} (${formatCurrency(i.price)})`).join("\n"),
            valorVenda: cartTotal,
            subtotal: subtotal && discount && discount > 0 ? subtotal : undefined,
            desconto: discount && discount > 0 ? discount : undefined,
            valorDinheiro: pdvCash > 0 ? pdvCash : undefined,
            valorCartao: pdvCard > 0 ? pdvCard : undefined,
            valorPix: pdvPix > 0 ? pdvPix : undefined,
          };
          const doc = await gerarNotaFiscalInterna(data);
          doc.save(`notinha-${numeroNota}.pdf`);
          toast.success("Notinha gerada com sucesso!");
        } catch (e) {
          console.error(e);
          toast.error("Venda registrada, mas falha ao gerar notinha.");
        }
      }

      toast.success("Venda rápida registrada!"); setPdvOpen(false); resetPdv(); fetchData();
    } catch (err: any) { 
      toast.error(err.message || "Erro"); 
    } finally {
      isPdvSubmitting.current = false;
      setLoading(false);
    }
  };

  return {
    cart, setCart,
    accSearch, setAccSearch,
    pdvOpen, setPdvOpen,
    pdvPayment, setPdvPayment,
    filteredAcc, addToCart, updateCartQty, updateCartPrice, resetPdv,
    handlePdvSubmit
  };
};
