import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const allowedPhone = Deno.env.get("ALLOWED_PHONE_NUMBER") || "";
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || "";
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";
    const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "";
    const groqApiKey = Deno.env.get("GROQ_API_KEY") || "";

    const body = await req.json();
    console.log("Evolution API Webhook received:", JSON.stringify(body, null, 2));

    // Accept both MESSAGES_UPSERT and SEND_MESSAGE events
    const validEvents = ["messages.upsert", "send.message", "MESSAGES_UPSERT", "SEND_MESSAGE"];
    if (!validEvents.includes(body.event)) {
      return new Response(JSON.stringify({ status: "ignored_event", event: body.event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageData = body.data;
    if (!messageData) {
      return new Response(JSON.stringify({ error: "No message data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = messageData.key;
    const remoteJid = key?.remoteJid || "";
    const remoteJidAlt = key?.remoteJidAlt || "";
    const isLidFormat = remoteJid.endsWith("@lid");
    const isGroup = remoteJid.endsWith("@g.us");

    // Restrict processing to ONLY specific expense groups
    // Group 1: Original Gastos Pessoais | Group 2: The new one you tested
    const allowedGroupJids = ["120363425514605912@g.us", "120363427821554348@g.us"];
    
    if (!isGroup) {
      console.log(`Ignored private message from: ${remoteJid}`);
      return new Response(JSON.stringify({ status: "ignored_private" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isGroup && !allowedGroupJids.includes(remoteJid)) {
      console.log(`Ignored message from unrelated group: ${remoteJid}`);
      return new Response(JSON.stringify({ status: "ignored_group" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract sender JID (handles groups vs direct messages)
    let senderJid = "";
    if (isGroup) {
      const part = messageData.participant || key?.participant || "";
      const partAlt = messageData.participantAlt || key?.participantAlt || "";
      senderJid = part.endsWith("@lid") && partAlt ? partAlt : part;
    } else if (isLidFormat && remoteJidAlt) {
      senderJid = remoteJidAlt;
    } else {
      senderJid = remoteJid;
    }

    const cleanSender = senderJid.split("@")[0].replace(/\D/g, "");
    
    // Normalize both numbers to 12 digits (removing the 9th digit) to avoid formatting mismatches
    const normalizePhone = (num: string) => {
      const parsed = num.replace(/\D/g, "");
      if (parsed.length === 13 && parsed.startsWith("55")) {
        return parsed.slice(0, 4) + parsed.slice(5); // remove the 9th digit (55 + DDD + 9 + Number)
      }
      return parsed;
    };

    const normSender = normalizePhone(cleanSender);
    
    // Check if the sender is in the list of allowed numbers (comma separated)
    const allowedList = allowedPhone.split(",").map(n => normalizePhone(n.trim())).filter(n => n);
    
    const isAuthorized = (allowedList.length > 0 && allowedList.includes(normSender)) || key?.fromMe === true;

    if (!isAuthorized) {
      console.warn(`Unauthorized sender: ${cleanSender} (normalized: ${normSender}) in chat ${remoteJid}. Allowed: ${allowedList.join(", ")}`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reply to the source chat (could be the group or private chat)
    const replyTo = remoteJid;




    const messageContent = messageData.message;
    let textMessage = "";
    if (messageContent?.conversation) {
      textMessage = messageContent.conversation;
    } else if (messageContent?.extendedTextMessage?.text) {
      textMessage = messageContent.extendedTextMessage.text;
    }

    if (!textMessage || textMessage.trim() === "") {
      return new Response(JSON.stringify({ status: "empty_text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent loop from bot's own messages in groups
    if (isGroup && key?.fromMe === true) {
      console.log("Ignored group message sent by the bot itself.");
      return new Response(JSON.stringify({ status: "ignored_bot_self" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent infinite loop by ignoring the assistant's own confirmation/report replies
    if (
      textMessage.includes("Lançamento Confirmado") ||
      textMessage.includes("Lançamento registrado") ||
      textMessage.includes("Resumo Financeiro") ||
      textMessage.includes("✅") ||
      textMessage.includes("🤖") ||
      textMessage.includes("📊")
    ) {
      console.log("Ignored self confirmation/report message to prevent loop.");
      return new Response(JSON.stringify({ status: "ignored_loop_prevented" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    console.log(`Processing message from ${cleanSender}: "${textMessage}"`);

    let { data: profile } = await supabase
      .from("profiles")
      .select("user_id, store_id, display_name")
      .or(`phone.ilike.%${cleanSender.slice(-8)}%,phone.ilike.%${cleanSender}%`)
      .maybeSingle();

    if (!profile) {
      const { data: firstProfile } = await supabase
        .from("profiles")
        .select("user_id, store_id, display_name")
        .limit(1)
        .maybeSingle();
      profile = firstProfile;
    }

       const userId = profile?.user_id;
    const activeStoreId = profile?.store_id;

    if (!userId || !activeStoreId) {
      throw new Error("Could not find a valid user profile or store linkage in database.");
    }

    // Intercept report requests
    const isReportRequest = /relatorio|relatório|resumo|balanço|balanco|saldo|extrato/i.test(textMessage);
    if (isReportRequest) {
      console.log(`Generating report for store: ${activeStoreId}`);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: txs, error: fetchErr } = await supabase
        .from("transactions")
        .select("type, amount, description, category, created_at")
        .eq("store_id", activeStoreId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });
        
      if (fetchErr) throw fetchErr;

      let totalIncome = 0;
      let totalExpensePj = 0;
      let totalExpensePf = 0;
      let totalProLabore = 0;
      
      const listItems: string[] = [];
      const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

      if (txs && txs.length > 0) {
        txs.forEach((t) => {
          const amt = Number(t.amount) || 0;
          if (t.type === "income") {
            totalIncome += amt;
          } else if (t.type === "expense_pj") {
            totalExpensePj += amt;
          } else if (t.type === "expense_pf") {
            totalExpensePf += amt;
          } else if (t.type === "pro_labore") {
            totalProLabore += amt;
          }
          
          if (listItems.length < 5) {
            const dateStr = new Date(t.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const cleanDesc = (t.description || "").replace("[WhatsApp] ", "");
            const prefix = t.type === "income" ? "🟢" : "🔴";
            listItems.push(`${prefix} *${dateStr}* - ${cleanDesc}: ${fmt.format(amt)}`);
          }
        });
      }

      const totalExpenses = totalExpensePj + totalExpensePf + totalProLabore;
      const netBalance = totalIncome - totalExpenses;

      const reportMessage = `📊 *Resumo Financeiro (Últimos 30 dias)*
      
📈 *Receitas (Entradas):* ${fmt.format(totalIncome)}
📉 *Despesas Loja (PJ):* ${fmt.format(totalExpensePj)}
👤 *Despesas Pessoais (PF):* ${fmt.format(totalExpensePf)}
💸 *Retiradas (Pró-labore):* ${fmt.format(totalProLabore)}

━━━━━━━━━━━━━━━━━━
💰 *Saldo Líquido:* ${fmt.format(netBalance)}
━━━━━━━━━━━━━━━━━━

📝 *Últimos Lançamentos:*
${listItems.length > 0 ? listItems.join("\n") : "Nenhum lançamento nos últimos 30 dias."}`;

      if (evolutionUrl && evolutionApiKey && evolutionInstance) {
        const sendUrl = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${evolutionInstance}`;
        await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": evolutionApiKey },
          body: JSON.stringify({
            number: replyTo,
            text: reportMessage
          })
        });
      }

      return new Response(JSON.stringify({ status: "success", type: "report" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: bankAccounts } = await supabase
      .from("store_bank_accounts")
      .select("id, bank_name, owner_type")
      .eq("store_id", activeStoreId);

    const accountsContext = (bankAccounts || []).map(
      (a) => `ID: ${a.id} | Nome: ${a.bank_name} | Tipo: ${a.owner_type || "PJ"}`
    ).join("\n");

    const categories = [
      "Alimentação", "Moradia (Aluguel/Luz)", "Transporte/Combustível", "Lazer/Viagens",
      "Saúde", "Educação", "Vestuário", "Investimentos", "Pro-labore",
      "Software/Ferramentas", "Marketing", "Estoque/Peças", "Manutenção",
      "Impostos/Taxas", "Tarifas Bancárias", "Outros"
    ];

    const systemPrompt = `Você é um Assistente Financeiro integrado por WhatsApp para um lojista e reparador de celulares. 
Sua tarefa é analisar a mensagem do usuário sobre um gasto, receita ou retirada e convertê-la em um JSON estruturado.

Contas bancárias cadastradas no sistema:
${accountsContext || "Nenhuma conta cadastrada"}

Categorias suportadas:
${categories.join(", ")}

Tipos válidos:
- "expense_pf": Despesas pessoais do proprietário.
- "expense_pj": Despesas comerciais da loja.
- "pro_labore": Retirada de pró-labore do proprietário.
- "income": Receita extra.

Regras:
1. Associe o banco mencionado ao ID correspondente. Se não encontrar, use null.
2. Para despesas, preencha "source_account_id". Para receitas, preencha "destination_account_id".
3. Classifique em uma das categorias listadas.
4. Gere uma descrição curta e limpa.

Retorne apenas o JSON (sem markdown):
{
  "type": "expense_pf" | "expense_pj" | "pro_labore" | "income",
  "amount": number,
  "description": "string",
  "category": "string",
  "source_account_id": "uuid_or_null",
  "destination_account_id": "uuid_or_null"
}`;

    // Call Groq API (free tier, OpenAI-compatible)
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Mensagem: "${textMessage}"` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API Error: ${await groqResponse.text()}`);
    }

    const groqData = await groqResponse.json();
    const modelOutputText = groqData.choices?.[0]?.message?.content;
    if (!modelOutputText) throw new Error("Groq returned empty classification.");

    const parsedTransaction = JSON.parse(modelOutputText.trim());

    const { data: newTx, error: txError } = await supabase
      .from("transactions")
      .insert({
        type: parsedTransaction.type,
        amount: parsedTransaction.amount,
        net_amount: parsedTransaction.amount,
        description: `[WhatsApp] ${parsedTransaction.description}`,
        category: parsedTransaction.category || "Outros",
        store_id: activeStoreId,
        source_account_id: parsedTransaction.source_account_id || null,
        destination_account_id: parsedTransaction.destination_account_id || null,
        created_by: userId,
        expected_settlement_date: new Date().toISOString(),
        reconciled: false,
      })
      .select()
      .single();

    if (txError) throw txError;
    console.log("Transaction created:", newTx.id);

    const isCash = !parsedTransaction.source_account_id && !parsedTransaction.destination_account_id;
    if (isCash && (parsedTransaction.type === "expense_pj" || parsedTransaction.type === "income")) {
      const { data: register } = await supabase
        .from("cash_registers" as any).select("id")
        .eq("store_id", activeStoreId).eq("status", "open").maybeSingle();

      if (register) {
        await supabase.from("cash_entries" as any).insert({
          cash_register_id: (register as any).id,
          store_id: activeStoreId,
          type: parsedTransaction.type === "income" ? "entrada" : "saida",
          amount: parsedTransaction.amount,
          description: `[WhatsApp] ${parsedTransaction.description}`,
          payment_method: "dinheiro",
          confirmed: false,
          created_by: userId,
        } as any);
      }
    }

    const formattedVal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsedTransaction.amount);
    const typeLabel = parsedTransaction.type === "expense_pf" ? "Despesa Pessoal (PF)" :
      parsedTransaction.type === "expense_pj" ? "Despesa da Loja (PJ)" :
      parsedTransaction.type === "pro_labore" ? "Retirada (Pró-labore)" : "Receita";

    const replyMessage = `✅ *Lançamento Confirmado!*

💵 *Valor:* ${formattedVal}
🏷️ *Categoria:* ${parsedTransaction.category || "Outros"}
📌 *Tipo:* ${typeLabel}
📝 *Descrição:* ${parsedTransaction.description}
🏦 *Conta:* ${parsedTransaction.source_account_id || parsedTransaction.destination_account_id ? "Conta Bancária" : "Dinheiro (Gaveta)"}

Lançamento registrado no sistema! 🚀`;

    if (evolutionUrl && evolutionApiKey && evolutionInstance) {
      const sendUrl = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${evolutionInstance}`;
      console.log(`Sending reply to ${cleanSender} via ${sendUrl}`);
      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": evolutionApiKey },
        body: JSON.stringify({
          number: replyTo,
          text: replyMessage
        })
      });
      const sendBody = await sendRes.text();
      console.log(`Evolution send status: ${sendRes.status} | Body: ${sendBody}`);
    }

    return new Response(JSON.stringify({ status: "success", transactionId: newTx.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
