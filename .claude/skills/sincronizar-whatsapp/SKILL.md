---
name: sincronizar-whatsapp
description: Confere se o WhatsApp das lojas do CellManagerPro está recebendo e sincroniza com o CRM as mensagens que ficaram só na Evolution API (reenvio seguro em modo replay no whatsapp-webhook, sem acionar IA nem avisos). Use sempre que o usuário disser que mensagens não chegaram ou sumiram do CRM, que o inbox está vazio ou atrasado, pedir para "sincronizar", "puxar", "recuperar" ou "importar" mensagens do WhatsApp, testar se o WhatsApp está recebendo, depois de reconectar uma instância por QR Code, depois de um aviso do vigia ("parou de receber mensagens"), ou quando uma loja nova for conectada — mesmo que ele não fale em Evolution ou replay.
---

# Sincronizar mensagens do WhatsApp com o CRM

O CRM recebe as mensagens das lojas pela Evolution API → `whatsapp-webhook` → `crm_ingest_message`.
Quando o webhook não entrega (webhook não configurado, servidor fora, IO do Supabase estrangulado), a
mensagem fica só na Evolution. Esta skill acha essas mensagens e as reenvia ao webhook em **modo replay**:
grava no CRM com mídia e transcrição, mas **sem** IA, etiquetas, aviso no celular nem assistente da equipe.

Ela também detecta o **"zumbi"**: a instância mostra `open` e envia, mas não recebe nada (nem grupos).
Isso não se resolve daqui — só com o celular da loja (desconectar + ler o QR de novo).

## Por que tanto cuidado

- **Clientes reais.** Reenviar pelo caminho normal do webhook faria a IA (que pode estar no piloto
  automático) responder mensagens de horas atrás, e mandaria um aviso no celular da equipe para cada uma.
  Por isso só existe o reenvio com `replay: true` + segredo interno; nunca poste no webhook sem eles.
- **Segredos.** A chave da Evolution, o segredo do webhook e o do cron ficam no banco (`whatsapp_config`,
  resposta do `webhook/find`, Vault). Os scripts usam esses valores **dentro do SQL** (pg_net) e nunca os
  devolvem. Não escreva consultas que imprimam `api_key`, `headers` do webhook ou `decrypted_secret`,
  nem conteúdo de mensagem ou número completo — os scripts mostram só os 4 últimos dígitos.
- **Produção.** Nunca `db push`. Leitura roda com `--read-only`. Escrita (`--write`) só nos passos
  marcados e quando o pedido do usuário cobre isso ("sincroniza", "testa o recebimento"). Avise antes
  se o reenvio for muito maior que o esperado (centenas) ou se for criar muitos contatos novos.
- **Depende do PR #51** (`checkReplay` em `supabase/functions/whatsapp-webhook/auth.ts`). Se o webhook
  responder 401 a um replay, confira se essa versão está publicada.

## Como rodar os scripts

Da raiz do repositório:

```bash
bash .claude/skills/sincronizar-whatsapp/scripts/run.sh 01-diagnostico.sql DESDE="2026-11-19 00:00-03"
bash .claude/skills/sincronizar-whatsapp/scripts/run.sh 02-sondar.sql --write
```

`run.sh` troca cada `__CHAVE__` do SQL pelo valor e chama `npx supabase db query --remote`.
Os passos com pg_net são em duas etapas: um script **enfileira** pedidos e devolve `rid`s; outro **lê**
`net._http_response` por esses `rid`s alguns segundos depois. Anote os `rid`s de cada instância — os
pedidos de instâncias diferentes têm faixas diferentes e não podem se misturar. Respostas ficam
guardadas por algumas horas: `pendente` logo depois do pedido é "ainda não chegou" (espere uns segundos
e leia de novo); horas depois é "expirou" (enfileire de novo, não reaproveite rids antigos).

`DESDE` é o início da janela, com fuso: `2026-11-19 00:00-03` (hoje inteiro em Brasília) ou a hora em
que o problema começou. Sem indicação do usuário, use o início do dia de hoje.

## Roteiro

1. **Diagnóstico** — `01-diagnostico.sql DESDE=…` (leitura). Instâncias ativas, última checagem do
   vigia (`whatsapp_watchdog`) e contagem do CRM por loja. Já mostra quem está atrás.

2. **Sondar as instâncias** — `02-sondar.sql --write`, depois `03-ler-sondagem.sql RIDS=…`. Para cada
   uma: estado (`open`/`close`/`connecting`), webhook (habilitado, URL do `whatsapp-webhook`, eventos
   `MESSAGES_UPSERT`/`MESSAGES_UPDATE`/`CONNECTION_UPDATE`, cabeçalho `x-evolution-webhook-secret`,
   **quando foi alterado**) e dono do número (`instance_id` serve para conferir as páginas).
   Webhook alterado depois do início da janela explica tudo que veio antes dele.

3. **Buscar as mensagens** — por instância, `04-paginas.sql --write CONFIG_ID=… PAG_DE=1 PAG_ATE=30`,
   depois `05-cobertura.sql RID_DE=… RID_ATE=… DESDE=…`. Repita com as páginas seguintes até
   `cobre_desde = true`. Referência: loja movimentada com grupos faz ~3.000 mensagens/dia (~60 páginas).

4. **Comparar com o CRM** — `06-faltando.sql RID_DE=<1ª> RID_ATE=<última> DESDE=…` (leitura), com a
   faixa de rids **de todas as páginas daquela instância**. Mostra o resumo e cada mensagem que falta com
   o motivo previsto. Grupos ficam fora (o CRM não guarda grupos).

5. **Reenviar 1 de teste** — `07-reenviar.sql --write … TESTE=true` e `08-resultado.sql`. Espere
   `success` com `crm.message_id`. Confira no banco que caiu na loja certa com o horário original.
   Se vier 401, pare (segredo/versão do webhook) — não tente outro caminho.

6. **Reenviar o resto** — `07-reenviar.sql --write … TESTE=false`, `08-resultado.sql` com a nova faixa, e
   `06-faltando.sql` de novo para ver o que sobrou. Faça cada instância com os seus próprios
   `CONFIG_ID`, `WEBHOOK_RID` e faixa de páginas.

7. **Testar o recebimento** (pedido explícito, suspeita de zumbi ou depois de reconectar):
   - Sinal de zumbi: estado `open`, envios recentes da loja, mas nenhuma mensagem recebida — **nem de
     grupo** — há muito tempo num horário em que a loja costuma ter movimento.
   - Com 2+ instâncias: `09-teste-cruzado.sql --write DONO_RIDS=…` (cada loja manda um texto para a
     outra; os números viram contato ignorado "outra loja" para não virar lead). Espere ~1 min,
     busque a página 1 de cada (`04` com `PAG_DE=1 PAG_ATE=1`) e rode
     `10-teste-cruzado-ler.sql RIDS=… DONO_RIDS=… DESDE=<enviado_em com fuso>`. Confira duas vezes
     antes de concluir que não chegou.
   - Com 1 instância só: peça ao usuário para mandar uma mensagem do celular pessoal e confira a página 1.

## O que sobra e é normal

| Sobra | Por quê |
|---|---|
| Mensagens de/para celulares da equipe (`profiles.phone`) | assistente da equipe, avisos do vigia/distribuição: fora do CRM por desenho |
| `templateMessage`, `albumMessage`, `associatedChildMessage`, localização | sem suporte no CRM (as fotos de um álbum entram como `imageMessage`) |
| `success` com `crm.skipped` / `unknown_contact` | enviada pela loja para quem não é contato daquela loja: o CRM não cria contato por mensagem enviada |
| `@lid` sem `remoteJidAlt` | vai para `crm_lid_pending` e entra sozinha quando o número aparecer |

Mensagens que chegaram durante um zumbi **nunca chegaram à Evolution**: não há o que sincronizar. Depois
de reconectar, o WhatsApp às vezes entrega atrasado o que ficou na fila — rode a skill de novo.

## Quando é zumbi (ou `close`)

Diga ao usuário, com o celular da loja na mão: CRM → Configurações → Canais → **Desconectar** →
**Conectar (QR Code)** → ler o QR → **Configurar webhook**. Reiniciar a instância não resolve. O usuário
pode achar que está tudo bem porque o celular recebe normalmente: explique que o celular é o aparelho
principal e quem para de receber é a Evolution (aparelho conectado, como o WhatsApp Web).

## Relatório para o usuário (português, sem segredos nem números completos)

Comece pela conclusão ("as duas estão recebendo" / "a Santa Luzia parou de receber às 16:49"). Depois:
- por loja: estado, última mensagem recebida, webhook ok ou não (e desde quando);
- sincronização: quantas reenviadas e gravadas, de que horário a que horário, áudios/imagens;
- o que ficou de fora e por quê (tabela acima, em uma linha cada);
- o que o usuário precisa fazer, se precisar (reconectar por QR).

Registre incidentes novos em `ARCHITECTURE_BRAIN.md` §14 (data, causa, quantas mensagens).
