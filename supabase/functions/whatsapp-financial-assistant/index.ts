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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Handle GET request to fetch configurations (Admin only)
  if (req.method === "GET") {
    try {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Cabeçalho Authorization ausente." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Token inválido ou expirado." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Apenas administradores podem acessar as configurações." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        evolutionUrl: Deno.env.get("EVOLUTION_API_URL") || "",
        evolutionInstance: Deno.env.get("EVOLUTION_INSTANCE_NAME") || "",
        evolutionApiKey: Deno.env.get("EVOLUTION_API_KEY") || "",
        allowedPhones: Deno.env.get("ALLOWED_PHONE_NUMBER") || "",
        groupId: "120363427821554348@g.us", // current active group ID
        webhookUrl: `${supabaseUrl}/functions/v1/whatsapp-financial-assistant`,
        defaultStoreMode: "personal"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
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
    } else if (messageContent?.imageMessage?.caption) {
      textMessage = messageContent.imageMessage.caption;
    } else if (messageContent?.documentMessage?.caption) {
      textMessage = messageContent.documentMessage.caption;
    }

    const hasAudio = !!(messageContent?.audioMessage || messageContent?.documentMessage?.mimetype?.includes("audio"));
    
    if (hasAudio && evolutionUrl && evolutionApiKey && evolutionInstance && groqApiKey) {
      try {
        console.log("Audio message detected, attempting transcription...");
        const audioResp = await fetch(
          `${evolutionUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${evolutionInstance}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
            body: JSON.stringify({
              message: { key: { id: key.id } },
              convertToMp4: false,
            }),
          }
        );

        if (audioResp.ok) {
          const audioData = await audioResp.json();
          const base64Data = audioData?.base64 || audioData?.data;

          if (base64Data) {
            const binaryStr = atob(base64Data.replace(/^data:.*?;base64,/, ""));
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

            const blob = new Blob([bytes], { type: "audio/ogg" });
            const formData = new FormData();
            formData.append("file", blob, "audio.ogg");
            formData.append("model", "whisper-large-v3");

            const whisperResp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqApiKey}`,
              },
              body: formData,
            });

            if (whisperResp.ok) {
              const whisperData = await whisperResp.json();
              if (whisperData?.text) {
                textMessage = whisperData.text;
                console.log(`Transcribed audio successfully: "${textMessage}"`);
              }
            } else {
              console.error("Groq Whisper API returned error:", await whisperResp.text());
            }
          }
        }
      } catch (err: any) {
        console.error("Error transcribing audio:", err.message);
      }
    }

    // Allow image-only or audio messages through (they'll be handled later)
    const hasMediaAttachment = !!(messageContent?.imageMessage || messageContent?.documentMessage || hasAudio);
    if ((!textMessage || textMessage.trim() === "") && !hasMediaAttachment) {
      return new Response(JSON.stringify({ status: "empty_text" }), {
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

    // Admin phone numbers (all numbers belonging to the owner/admin)
    const adminPhonesEnv = Deno.env.get("ADMIN_PHONES") || allowedPhone;
    const adminPhones = adminPhonesEnv.split(",").map(n => normalizePhone(n.trim())).filter(n => n);
    const isAdmin = adminPhones.includes(normSender);

    let { data: profile } = await supabase
      .from("profiles")
      .select("user_id, store_id, display_name, phone")
      .or(`phone.ilike.%${cleanSender.slice(-8)}%,phone.ilike.%${cleanSender}%`)
      .maybeSingle();

    // If no profile found by phone, and sender is admin, use the admin profile
    if (!profile && isAdmin) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("user_id, store_id, display_name")
        .eq("user_id", Deno.env.get("ADMIN_USER_ID") || "62ea227e-d122-4709-b7cc-4a345092e7f3")
        .maybeSingle();
      profile = adminProfile;
    }

    if (!profile) {
      const { data: firstProfile } = await supabase
        .from("profiles")
        .select("user_id, store_id, display_name")
        .limit(1)
        .maybeSingle();
      profile = firstProfile;
    }

    const userId = profile?.user_id;
    const defaultStoreId = profile?.store_id;
    const activeStoreId = defaultStoreId;

    if (!userId || !defaultStoreId) {
      throw new Error("Could not find a valid user profile or store linkage in database.");
    }

    // Fetch all stores the user has access to
    let allStores: { id: string; name: string }[] = [];
    if (isAdmin) {
      const { data: storesData } = await supabase.from("stores").select("id, name");
      allStores = storesData || [];
    } else {
      const { data: storesData } = await supabase.from("stores").select("id, name").eq("id", defaultStoreId);
      allStores = storesData || [];
    }

    // Intercept report requests
    const isReportRequest = /relatorio|relatório|resumo|balanço|balanco|saldo|extrato/i.test(textMessage);
    if (isReportRequest) {
      const txt = textMessage.toLowerCase();

      // Detect which store(s) to report on
      let reportStoreIds: string[] = [];
      let storeLabel = "Todas as Lojas";
      // Check if user mentioned a specific store by partial name
      const matchedStore = allStores.find(s =>
        txt.includes(s.name.toLowerCase()) ||
        txt.includes("vila eulalia") && s.name.toLowerCase().includes("vila eulalia") ||
        txt.includes("santa luzia") && s.name.toLowerCase().includes("santa luzia") ||
        txt.includes("vila") && s.name.toLowerCase().includes("vila") ||
        txt.includes("luzia") && s.name.toLowerCase().includes("luzia")
      );
      if (matchedStore) {
        reportStoreIds = [matchedStore.id];
        storeLabel = matchedStore.name;
      } else {
        reportStoreIds = allStores.map(s => s.id);
      }

      console.log(`Generating report for stores: ${reportStoreIds.join(", ")}`);
      
      let startDate = new Date();
      let endDate = new Date();
      let dateLabel = "Últimos 30 dias";
      
      // Date filters
      if (txt.includes("hoje")) {
        startDate.setHours(0, 0, 0, 0);
        dateLabel = "Hoje";
      } else if (txt.includes("ontem")) {
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        dateLabel = "Ontem";
      } else if (txt.includes("semana")) {
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        dateLabel = "Últimos 7 dias";
      } else if (txt.includes("este mes") || txt.includes("este mês") || txt.includes("do mês") || txt.includes("do mes")) {
        startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        dateLabel = "Este Mês";
      } else {
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
      }

      // Query database - filter by multiple stores if admin
      let dbQuery = supabase
        .from("transactions")
        .select("type, amount, description, category, created_at, source_account_id, destination_account_id")
        .in("store_id", reportStoreIds)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false });

      if (dateLabel === "Ontem") {
        dbQuery = dbQuery.lte("created_at", endDate.toISOString());
      }

      const { data: txs, error: fetchErr } = await dbQuery;
      if (fetchErr) throw fetchErr;

      // Extract filter criteria
      let typeFilter = "todos"; // todos, entradas, saidas
      if (txt.includes("despesa") || txt.includes("gasto") || txt.includes("saida") || txt.includes("saída")) {
        typeFilter = "saidas";
      } else if (txt.includes("receita") || txt.includes("ganho") || txt.includes("entrada")) {
        typeFilter = "entradas";
      }

      let accountFilter = "todos"; // todos, banco, dinheiro
      if (txt.includes("banco") || txt.includes("conta")) {
        accountFilter = "banco";
      } else if (txt.includes("caixa") || txt.includes("dinheiro") || txt.includes("gaveta")) {
        accountFilter = "dinheiro";
      }

      // Filter in Memory
      let filteredTxs = txs || [];
      if (typeFilter === "entradas") {
        filteredTxs = filteredTxs.filter(t => t.type === "income");
      } else if (typeFilter === "saidas") {
        filteredTxs = filteredTxs.filter(t => t.type !== "income");
      }

      if (accountFilter === "banco") {
        filteredTxs = filteredTxs.filter(t => t.source_account_id || t.destination_account_id);
      } else if (accountFilter === "dinheiro") {
        filteredTxs = filteredTxs.filter(t => !t.source_account_id && !t.destination_account_id);
      }

      let totalIncome = 0;
      let totalExpensePj = 0;
      let totalExpensePf = 0;
      let totalProLabore = 0;
      
      const listItems: string[] = [];
      const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

      filteredTxs.forEach((t) => {
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

      const totalExpenses = totalExpensePj + totalExpensePf + totalProLabore;
      const netBalance = totalIncome - totalExpenses;

      const typeLabel = typeFilter === "entradas" ? " (Apenas Entradas)" : typeFilter === "saidas" ? " (Apenas Saídas)" : "";
      const acctLabel = accountFilter === "banco" ? " (Apenas Banco)" : accountFilter === "dinheiro" ? " (Apenas Dinheiro/Gaveta)" : "";

      const reportMessage = `📊 *Resumo Financeiro - ${dateLabel}${typeLabel}${acctLabel}*
🏪 *Loja:* ${storeLabel}
      
📈 *Receitas (Entradas):* ${fmt.format(totalIncome)}
📉 *Despesas Loja (PJ):* ${fmt.format(totalExpensePj)}
👤 *Despesas Pessoais (PF):* ${fmt.format(totalExpensePf)}
💸 *Retiradas (Pró-labore):* ${fmt.format(totalProLabore)}

━━━━━━━━━━━━━━━━━━
💰 *Saldo Líquido:* ${fmt.format(netBalance)}
━━━━━━━━━━━━━━━━━━

📝 *Últimos Lançamentos:*
${listItems.length > 0 ? listItems.join("\n") : "Nenhum lançamento encontrado para os filtros solicitados."}`;

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

    // Fetch ALL bank accounts for admin (across all stores)
    let bankAccounts: any[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("store_bank_accounts").select("id, bank_name, owner_type, store_id");
      bankAccounts = data || [];
    } else {
      const { data } = await supabase.from("store_bank_accounts").select("id, bank_name, owner_type, store_id").eq("store_id", activeStoreId);
      bankAccounts = data || [];
    }

    // Build accounts context grouped by type
    // PJ accounts are SHARED across all stores — deduplicate by bank name, keep first occurrence
    const seenPjBanks = new Set<string>();
    const pjAccountsDeduped: typeof bankAccounts = [];
    for (const a of bankAccounts.filter(a => a.owner_type === "PJ")) {
      const key = a.bank_name.toLowerCase().trim();
      if (!seenPjBanks.has(key)) {
        seenPjBanks.add(key);
        pjAccountsDeduped.push(a);
      }
    }
    const pfAccounts = bankAccounts.filter(a => a.owner_type === "PF");
    
    const accountsContext = [
      "== CONTAS PJ (Empresa — únicas, compartilhadas entre todas as lojas) ==",
      ...pjAccountsDeduped.map(a => `ID: ${a.id} | Banco: ${a.bank_name} | Tipo: PJ`),
      "",
      "== CONTAS PF (Pessoal do Itamar — única, independente de loja) ==",
      ...pfAccounts.map(a => `ID: ${a.id} | Banco: ${a.bank_name} | Tipo: PF`),
    ].join("\n");

    const storesContext = allStores.map(s => `ID: ${s.id} | Nome: ${s.name}`).join("\n");

    const categories = [
      "Alimentação", "Moradia (Aluguel/Luz)", "Transporte/Combustível", "Lazer/Viagens",
      "Saúde", "Educação", "Vestuário", "Investimentos", "Pro-labore",
      "Software/Ferramentas", "Marketing", "Estoque/Peças", "Manutenção",
      "Impostos/Taxas", "Tarifas Bancárias", "Outros"
    ];

    const systemPrompt = `Você é o Assistente Financeiro pessoal do Itamar, integrado via WhatsApp.

CONCEITOS FUNDAMENTAIS:
1. Conta PF (Pessoal) do Itamar: ÚNICA e universal. Não pertence a nenhuma loja. Não tem store_id.
2. Contas PJ (Empresa): ÚNICAS por banco — a mesma conta Itaú PJ serve para TODAS as lojas. NÃO existe "Itaú da Vila Eulalia" separado do "Itaú da Santa Luzia". A loja é definida separadamente.
3. Conta Cora (futura): será a conta dos colaboradores, para pagamentos autorizados pelo Itamar com comprovante.
4. Cada lançamento tem DOIS aspectos independentes:
   a) CONTA-FONTE: De onde saiu o dinheiro (Itaú PJ, Mercado Pago PJ, Mercado Pago PF, Cora).
   b) LOJA-ALVO: A qual loja pertence esse gasto (Vila Eulalia, Santa Luzia) — independente da conta usada.

REGRAS DE CONTA-FONTE (source_account_id):
- Padrão se não especificar: conta PF (Mercado Pago PF).
- "pj", "itaú", "itau", "conta da empresa", "conta pj" → Itaú PJ.
- "mercado pago pj", "mp pj" → Mercado Pago PJ.
- "mercado pago pf", "mp pf", "pessoal", "minha conta" → Mercado Pago PF.
- "cora", "funcionário", "colaborador" → conta Cora (se existir).
- Se mencionar "dinheiro", "gaveta", "espécie" → source_account_id = null.

TIPO DA TRANSAÇÃO:
- "expense_pf": Gastos pessoais do Itamar. SEMPRE store_id = null (não tem loja).
- "expense_pj": Gastos da empresa/loja (aluguel, internet, peças, impostos etc.).
- "income": Receita/entrada de dinheiro.
- "pro_labore": Retirada pessoal da empresa.

DETECÇÃO DA LOJA (apenas para expense_pj, income e pro_labore):
- "vila eulalia", "eulalia", "vila" → store_id = "${allStores.find(s => s.name.toLowerCase().includes("eulalia"))?.id || ""}"
- "santa luzia", "luzia", "luzia" → store_id = "${allStores.find(s => s.name.toLowerCase().includes("luzia"))?.id || ""}"
- Sem mencionar loja → store_id = "${activeStoreId}" (loja padrão)

EXEMPLOS PRÁTICOS:
- "marmita pf 15" → expense_pf, Alimentação, source = Mercado Pago PF, store_id = null
- "marmita pj 15" → expense_pf (marmita é gasto pessoal), source = Itaú PJ, store_id = null
- "gasolina 80" → expense_pf, Transporte, source = Mercado Pago PF, store_id = null
- "aluguel da loja 2000 pj" → expense_pj, source = Itaú PJ, store_id = loja padrão
- "aluguel vila eulalia 2000" → expense_pj, source = Itaú PJ, store_id = Vila Eulalia
- "internet santa luzia 150" → expense_pj, source = Itaú PJ, store_id = Santa Luzia
- "funcionário comprou peça cora 150" → expense_pj, source = Cora, store_id = loja padrão

Lojas cadastradas:
${storesContext}

Contas bancárias disponíveis:
${accountsContext}

Categorias disponíveis:
${categories.join(", ")}

Retorne APENAS o JSON (sem markdown, sem explicação):
{
  "type": "expense_pf" | "expense_pj" | "pro_labore" | "income",
  "amount": number,
  "description": "string curta descritiva",
  "category": "string",
  "source_account_id": "uuid_or_null",
  "destination_account_id": "uuid_or_null",
  "store_id": "uuid_or_null (null se expense_pf)"
}`;

    // Check if message has an image/media attached
    let receiptUrl: string | null = null;
    const hasImage = messageContent?.imageMessage || messageContent?.documentMessage;
    
    if (hasImage && evolutionUrl && evolutionApiKey && evolutionInstance) {
      try {
        // Fetch the base64 of the media using Evolution API
        const mediaResp = await fetch(
          `${evolutionUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${evolutionInstance}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
            body: JSON.stringify({
              message: { key: { id: key.id } },
              convertToMp4: false,
            }),
          }
        );

        if (mediaResp.ok) {
          const mediaData = await mediaResp.json();
          const base64Data = mediaData?.base64 || mediaData?.data;
          
          if (base64Data) {
            // Upload to Supabase Storage
            const mimeType = mediaData?.mimetype || messageContent?.imageMessage?.mimetype || "image/jpeg";
            const ext = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : "jpg";
            const fileName = `whatsapp-receipts/${userId}/${Date.now()}.${ext}`;
            
            // Decode base64 and upload
            const binaryStr = atob(base64Data.replace(/^data:.*?;base64,/, ""));
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

            const { data: uploadData } = await supabase.storage
              .from("comprovantes")
              .upload(fileName, bytes, { contentType: mimeType, upsert: true });

            if (uploadData?.path) {
              const { data: publicUrlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
              receiptUrl = publicUrlData?.publicUrl || null;
              console.log("Receipt uploaded:", receiptUrl);
            }
          }
        }
      } catch (imgErr: any) {
        console.warn("Could not process image attachment:", imgErr.message);
      }
    }

    // Also read caption from image messages as text
    if (!textMessage && hasImage) {
      textMessage = messageContent?.imageMessage?.caption || messageContent?.documentMessage?.caption || "";
    }
    if (!textMessage || textMessage.trim() === "") {
      if (receiptUrl) {
        textMessage = "comprovante enviado";
      } else {
        return new Response(JSON.stringify({ status: "empty_text" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
    
    // Determine the correct store_id for the transaction
    // Personal expenses (expense_pf) do NOT belong to any store (store_id remains null)
    const txStoreId = parsedTransaction.type === "expense_pf" ? null : (parsedTransaction.store_id || activeStoreId);

    const { data: newTx, error: txError } = await supabase
      .from("transactions")
      .insert({
        type: parsedTransaction.type,
        amount: parsedTransaction.amount,
        net_amount: parsedTransaction.amount,
        description: `[WhatsApp] ${parsedTransaction.description}`,
        category: parsedTransaction.category || "Outros",
        store_id: txStoreId,
        source_account_id: parsedTransaction.source_account_id || null,
        destination_account_id: parsedTransaction.destination_account_id || null,
        created_by: userId,
        expected_settlement_date: new Date().toISOString(),
        reconciled: false,
        receipt_url: receiptUrl,
      })
      .select()
      .single();

    if (txError) throw txError;
    console.log("Transaction created:", newTx.id);

    const isCash = !parsedTransaction.source_account_id && !parsedTransaction.destination_account_id;
    if (isCash && (parsedTransaction.type === "expense_pj" || parsedTransaction.type === "income")) {
      const { data: register } = await supabase
        .from("cash_registers" as any).select("id")
        .eq("store_id", txStoreId).eq("status", "open").maybeSingle();

      if (register) {
        await supabase.from("cash_entries" as any).insert({
          cash_register_id: (register as any).id,
          store_id: txStoreId,
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
    
    // Determine source account label
    const sourceAcct = bankAccounts.find(a => a.id === parsedTransaction.source_account_id);
    const sourceLabel = sourceAcct ? `${sourceAcct.bank_name} (${sourceAcct.owner_type})` : "Dinheiro (Gaveta)";
    
    // Determine target store label
    const targetStore = allStores.find(s => s.id === txStoreId);
    const storeLabel2 = targetStore ? targetStore.name : "—";

    const replyMessage = `✅ *Lançamento Confirmado!*

💵 *Valor:* ${formattedVal}
🏷️ *Categoria:* ${parsedTransaction.category || "Outros"}
📌 *Tipo:* ${typeLabel}
📝 *Descrição:* ${parsedTransaction.description}
🏦 *Conta Fonte:* ${sourceLabel}
🏪 *Loja:* ${storeLabel2}${receiptUrl ? "\n📎 *Comprovante:* Anexado automaticamente!" : ""}

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
