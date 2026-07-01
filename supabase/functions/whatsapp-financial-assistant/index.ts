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
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";

    // Parse incoming request
    const body = await req.json();
    console.log("Evolution API Webhook received:", JSON.stringify(body, null, 2));

    // We only care about messages.upsert
    if (body.event !== "messages.upsert") {
      return new Response(JSON.stringify({ status: "ignored_event" }), {
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
    const cleanSender = remoteJid.split("@")[0].replace(/\D/g, "");

    // Safety validation
    const cleanAllowed = allowedPhone.replace(/\D/g, "");
    if (!cleanAllowed || cleanSender !== cleanAllowed) {
      console.warn(`Unauthorized message sender: ${cleanSender}. Allowed: ${cleanAllowed}`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text conversation
    const messageContent = messageData.message;
    let textMessage = "";
    if (messageContent?.conversation) {
      textMessage = messageContent.conversation;
    } else if (messageContent?.extendedTextMessage?.text) {
      textMessage = messageContent.extendedTextMessage.text;
    }

    if (!textMessage || textMessage.trim() === "") {
      console.log("Empty text message. Ignored.");
      return new Response(JSON.stringify({ status: "empty_text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing message from ${cleanSender}: "${textMessage}"`);

    // Fetch user details for creator uuid
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

    // Fetch store bank accounts for context mapping
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

Aqui estão as contas bancárias atuais cadastradas no sistema:
${accountsContext || "Nenhuma conta cadastrada"}

Aqui estão as categorias de transações suportadas:
${categories.join(", ")}

Tipos de movimentações válidos:
- "expense_pf": Despesas pessoais do proprietário (ex: almoço, luz da casa dele, lazer pessoal).
- "expense_pj": Despesas comerciais da loja (ex: compra de peças, ferramentas, aluguel da loja, marketing).
- "pro_labore": Retirada de pró-labore do proprietário da conta PJ da loja para uso pessoal.
- "income": Receita extra ou vendas gerais não registradas pelo PDV convencional.

Regras de Classificação:
1. Sempre tente associar a conta mencionada na mensagem (ex: "nubank", "inter", "caixa", "banco do brasil") ao ID da conta fornecido no contexto de contas. Se nenhuma conta corresponder, deixe "source_account_id" ou "destination_account_id" como null.
2. Identifique o valor numérico. Remova símbolos de moeda.
3. Classifique a categoria estritamente em uma das categorias permitidas listadas acima.
4. Gere uma descrição curta e limpa (ex: "Almoço de hoje", "Compra de telas para estoque").
5. Para despesas (expense_pf, expense_pj, pro_labore), preencha o "source_account_id" com o ID da conta de onde saiu o dinheiro. O "destination_account_id" deve ser null.
6. Para receitas (income), preencha o "destination_account_id" com o ID da conta onde entrou o dinheiro. O "source_account_id" deve ser null.

Retorne estritamente um JSON no seguinte formato (sem caracteres markdown de bloco de código):
{
  "type": "expense_pf" | "expense_pj" | "pro_labore" | "income",
  "amount": number,
  "description": "string",
  "category": "string",
  "source_account_id": "string_uuid_or_null",
  "destination_account_id": "string_uuid_or_null"
}`;

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: `Mensagem do usuário: "${textMessage}"` }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const modelOutputText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("Gemini parsed output:", modelOutputText);

    if (!modelOutputText) {
      throw new Error("Gemini returned an empty classification.");
    }

    const parsedTransaction = JSON.parse(modelOutputText.trim());

    // Insert into supabase transactions table
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

    if (txError) {
      throw txError;
    }

    console.log("Transaction created successfully:", newTx.id);

    // If it's cash (no account associated) and is a PJ expense/income, let's create a pending cash entry in the open drawer
    const isCash = !parsedTransaction.source_account_id && !parsedTransaction.destination_account_id;
    if (isCash && (parsedTransaction.type === "expense_pj" || parsedTransaction.type === "income")) {
      // Find open cash register
      const { data: register } = await supabase
        .from("cash_registers" as any)
        .select("id")
        .eq("store_id", activeStoreId)
        .eq("status", "open")
        .maybeSingle();

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
        console.log("Pending cash entry registered.");
      }
    }

    // Format positive reply message
    const formattedVal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsedTransaction.amount);
    const typeLabel = parsedTransaction.type === "expense_pf" ? "Despesa Pessoal (PF)" :
                      parsedTransaction.type === "expense_pj" ? "Despesa da Loja (PJ)" :
                      parsedTransaction.type === "pro_labore" ? "Retirada (Pró-labore)" : "Receita (DRE)";

    const replyMessage = `✅ *Lançamento Confirmado!*

💵 *Valor:* ${formattedVal}
🏷️ *Categoria:* ${parsedTransaction.category || "Outros"}
📌 *Tipo:* ${typeLabel}
📝 *Descrição:* ${parsedTransaction.description}
🏦 *Banco/Destino:* ${parsedTransaction.source_account_id ? "Conta Origem" : parsedTransaction.destination_account_id ? "Conta Destino" : "Dinheiro (Gaveta)"}

O lançamento já consta no seu fluxo financeiro! 🚀`;

    // Reply via Evolution API
    if (evolutionUrl && evolutionApiKey && evolutionInstance) {
      const sendUrl = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${evolutionInstance}`;
      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey
        },
        body: JSON.stringify({
          number: cleanSender,
          options: {
            delay: 1000,
            presence: "composing"
          },
          textMessage: {
            text: replyMessage
          }
        })
      });

      if (!sendRes.ok) {
        console.error("Failed to send WhatsApp message via Evolution API:", await sendRes.text());
      } else {
        console.log("Confirmation WhatsApp message sent successfully!");
      }
    }

    return new Response(JSON.stringify({ status: "success", transactionId: newTx.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Fatal error in whatsapp-financial-assistant Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
