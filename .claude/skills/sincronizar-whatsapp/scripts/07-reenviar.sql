-- ESCRITA (--write): reenvia ao whatsapp-webhook, em modo REPLAY, as mensagens que o 06 marcou
-- como "vai reenviar". Replay = grava no CRM (mídia e transcrição inclusive) SEM IA, etiquetas,
-- aviso no celular nem assistente da equipe. Exige x-crm-internal = segredo do cron (Vault).
-- Parâmetros:
--   RID_DE, RID_ATE   páginas da instância (04)      DESDE        início da janela
--   CONFIG_ID         instância                       WEBHOOK_RID  rid do "webhook" dessa instância (02)
--   TESTE             true = só 1 (de preferência um texto enviado pela loja); false = todas
with cfg as (select instance_name from whatsapp_config where id = '__CONFIG_ID__'),
recs as (
  select distinct on (x->'key'->>'id') x, to_timestamp((x->>'messageTimestamp')::bigint) ts
    from net._http_response h, jsonb_array_elements(case when h.status_code = 200 then coalesce(h.content::jsonb->'messages'->'records', '[]'::jsonb) else '[]'::jsonb end) x
   where h.id between __RID_DE__ and __RID_ATE__
),
cand as (
  select x, ts from recs
   where ts >= '__DESDE__'::timestamptz
     and x->'key'->>'remoteJid' not like '%@g.us' and x->'key'->>'remoteJid' not like '%@broadcast'
     and x->'key'->>'remoteJid' not like '%@newsletter'
     and x->>'messageType' not in ('templateMessage', 'associatedChildMessage', 'albumMessage', 'protocolMessage', 'reactionMessage')
     and not exists (select 1 from crm_messages m where m.external_id = x->'key'->>'id')
     and not exists (select 1 from profiles p where p.phone is not null
                      and crm_phone_key(p.phone) = crm_phone_key(split_part(coalesce(nullif(x->'key'->>'remoteJidAlt', ''), x->'key'->>'remoteJid'), '@', 1)))
   order by (__TESTE__ and x->'key'->>'fromMe' = 'true' and x->>'messageType' = 'conversation') desc, ts
   limit case when __TESTE__ then 1 end
),
sent as (
  select x, net.http_post(
           url := 'https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/whatsapp-webhook',
           headers := jsonb_build_object('Content-Type', 'application/json',
             'x-evolution-webhook-secret', (select content::jsonb->'headers'->>'x-evolution-webhook-secret' from net._http_response where id = __WEBHOOK_RID__),
             'x-crm-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
           body := jsonb_build_object('event', 'messages.upsert', 'instance', (select instance_name from cfg), 'data', x, 'replay', true),
           timeout_milliseconds := 60000) rid
    from cand
)
select count(*) enviados, min(rid) rid_de, max(rid) rid_ate,
       string_agg(x->'key'->>'id', ',') filter (where __TESTE__) external_id_teste
  from sent;
