-- Leitura. Mensagens diretas da instância (páginas RID_DE..RID_ATE) desde DESDE que não estão no CRM.
-- Sem conteúdo nem número completo (só 4 últimos dígitos). "vai_reenviar" = entra no 07.
-- Parâmetros: RID_DE, RID_ATE, DESDE
with recs as (
  select distinct on (x->'key'->>'id') x, to_timestamp((x->>'messageTimestamp')::bigint) ts
    from net._http_response h, jsonb_array_elements(case when h.status_code = 200 then coalesce(h.content::jsonb->'messages'->'records', '[]'::jsonb) else '[]'::jsonb end) x
   where h.id between __RID_DE__ and __RID_ATE__
),
diretas as (
  select x, ts, split_part(coalesce(nullif(x->'key'->>'remoteJidAlt', ''), x->'key'->>'remoteJid'), '@', 1) num
    from recs
   where ts >= '__DESDE__'::timestamptz
     and x->'key'->>'remoteJid' not like '%@g.us' and x->'key'->>'remoteJid' not like '%@broadcast'
     and x->'key'->>'remoteJid' not like '%@newsletter'
),
falta as (
  select d.*,
         exists (select 1 from profiles p where p.phone is not null and crm_phone_key(p.phone) = crm_phone_key(d.num)) equipe,
         x->>'messageType' in ('templateMessage', 'associatedChildMessage', 'albumMessage', 'protocolMessage', 'reactionMessage') tipo_fora
    from diretas d
   where not exists (select 1 from crm_messages m where m.external_id = d.x->'key'->>'id')
)
select 'resumo' linha,
       (select count(*) from diretas) diretas, (select count(*) from falta) faltando,
       (select count(*) from falta where not equipe and not tipo_fora) vai_reenviar,
       null::text hora, null::text de_mim, null::text tipo, null::text fim, null::text motivo
union all
select 'msg', null, null, null,
       to_char(ts at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), x->'key'->>'fromMe', x->>'messageType', right(num, 4),
       case when equipe then 'equipe (fora do CRM por desenho)'
            when tipo_fora then 'tipo ignorado por desenho'
            when x->'key'->>'remoteJid' like '%@lid' and coalesce(x->'key'->>'remoteJidAlt', '') = '' then '@lid sem número (vai para crm_lid_pending)'
            else 'vai reenviar' end
  from falta
order by linha desc, hora;
