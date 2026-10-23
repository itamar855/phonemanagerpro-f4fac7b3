import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, context, image } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";
    let messages: any[] = [];

    if (type === "scan_device_screen") {
      if (!image) {
        return new Response(JSON.stringify({ error: "Imagem não fornecida para escaneamento." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const imageUrl = String(image).startsWith("data:") ? String(image) : `data:image/jpeg;base64,${image}`;

      systemPrompt = `Você é um perito em visão computacional e hardware de celulares (iOS e Android) para lojas e assistências técnicas.
Sua missão é analisar imagens da tela do celular (como 'Ajustes > Geral > Sobre' no iPhone ou 'Configurações > Sobre o telefone' no Android, ou telas de status/bateria) e extrair os dados do aparelho com máxima precisão.

Responda SEMPRE E EXCLUSIVAMENTE em formato JSON puro, sem markdown (sem \`\`\`json ou qualquer formatação adicional).
Campos esperados:
{
  "brand": "iPhone" | "Samsung" | "Xiaomi" | "Motorola" | "Huawei" | "Outro",
  "model": "Nome comercial legível (ex: iPhone 13 Pro, Galaxy S21, Redmi Note 11)",
  "model_number": "Código de modelo se visível (ex: A2638, SM-G991B, etc.)",
  "imei": "Apenas os 15 dígitos numéricos do IMEI principal sem espaços ou pontuação (ou string vazia se não visível)",
  "imei2": "Segundo IMEI se visível (ou string vazia)",
  "serial_number": "Número de série se visível (ou string vazia)",
  "capacity": "Capacidade de armazenamento em GB (ex: 64, 128, 256, 512, 1024) apenas o número ou string vazia",
  "color": "Cor do aparelho se indicada ou discernível (ou string vazia)",
  "battery_percentage": "Saúde ou porcentagem da bateria se visível (ex: 88, 100) ou string vazia",
  "detected": true,
  "notes": "Qualquer observação curta relevante (ex: Tela Sobre do iPhone identificada com sucesso)"
}

Se a imagem não contiver informações legíveis de um aparelho ou for de algo não relacionado, retorne:
{
  "detected": false,
  "error_message": "Não foi possível ler as informações. Certifique-se de que a foto está nítida e enquadra a tela 'Sobre o telefone' ou 'Ajustes > Geral > Sobre'."
}`;

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analise esta foto da tela do aparelho e extraia as informações de identificação técnica (Marca, Modelo, IMEI, Armazenamento, Bateria, etc.) no formato JSON solicitado."
            },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ]
        }
      ];
    } else if (type === "financial") {
      systemPrompt = `Você é um analista financeiro especializado em lojas de celulares no Brasil. Analise os dados fornecidos e dê insights acionáveis em português. Seja direto e prático. Use formatação markdown. Inclua:
- Análise de receitas vs despesas
- Identificação de tendências
- Sugestões de redução de custos
- Alertas sobre gastos PF excessivos
- Projeções simples`;
      userPrompt = `Analise os seguintes dados financeiros da loja:\n${JSON.stringify(context, null, 2)}`;
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    } else if (type === "stock") {
      systemPrompt = `Você é um especialista em gestão de estoque de lojas de celulares no Brasil. Analise os dados e sugira otimizações em português. Use markdown. Inclua:
- Produtos com baixa rotatividade
- Sugestões de compra baseadas em histórico
- Alertas de estoque crítico
- Otimização de preços
- ROI do estoque`;
      userPrompt = `Analise os seguintes dados de estoque e vendas:\n${JSON.stringify(context, null, 2)}`;
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    } else if (type === "legal") {
      systemPrompt = `Você é um consultor jurídico especializado em termos de serviço para assistência técnica de celulares no Brasil. Gere ou adapte termos de responsabilidade em português. Use linguagem clara mas juridicamente adequada. Inclua cláusulas sobre:
- Condição do aparelho na entrega
- Responsabilidade sobre dados
- Prazo de retirada
- Garantia do serviço
- Alterações no orçamento
- LGPD e proteção de dados`;
      userPrompt = context?.customRequest 
        ? `Adapte os termos para o seguinte cenário: ${context.customRequest}\n\nTermos atuais: ${context.currentTerms || "padrão"}`
        : `Gere termos de responsabilidade completos para uma ordem de serviço de assistência técnica de celulares. Contexto: ${JSON.stringify(context, null, 2)}`;
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    } else if (type === "qualify") {
      systemPrompt = `Você é um especialista em vendas e qualificação de leads para lojas de celulares e assistência técnica no Brasil. Analise o histórico de conversa e o perfil do lead para determinar o potencial de compra. Em português, use markdown. Forneça:
- Score de Qualificação (0-100)
- Perfil do Lead (Ex: Entusiasta, Necessidade Urgente, Pesquisa de Preço)
- Principais Interesses (Ex: iPhone 15, Troca de Tela, Acessórios)
- Objeções Identificadas
- Próximo Passo Sugerido para o vendedor
- Nome sugerido (se detectado na conversa)`;
      userPrompt = `Analise o seguinte contexto do lead e histórico de mensagens:\n${JSON.stringify(context, null, 2)}`;
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    } else {
      return new Response(JSON.stringify({ error: "Tipo inválido. Use: scan_device_screen, financial, stock, legal, qualify" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error details:", errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Verifique sua conta Lovable." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Erro na IA (${response.status}). Certifique-se de que a LOVABLE_API_KEY está configurada.` }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();

    if (type === "scan_device_screen") {
      const rawText = aiData.choices?.[0]?.message?.content || "";
      const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        return new Response(JSON.stringify({ result: parsed, raw: rawText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Failed to parse AI JSON response:", rawText, err);
        return new Response(JSON.stringify({ 
          result: { 
            detected: false, 
            error_message: "A IA processou a imagem mas não conseguiu formatar os dados. Tente uma foto mais próxima e com boa iluminação." 
          }, 
          raw: rawText 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify(aiData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
