-- Leitura. Depois do 09, busque de novo a página 1 de cada instância (04 com PAG_DE=1 PAG_ATE=1)
-- e veja se cada uma RECEBEU o teste da outra. Parâmetros: RIDS (as páginas 1 novas), DONO_RIDS, DESDE (hora do envio)
with owners as (
  select split_part(h.content::jsonb->0->>'ownerJid', '@', 1) num, h.content::jsonb->0->>'id' instance_id, h.content::jsonb->0->>'name' nome
    from net._http_response h where h.id in (__DONO_RIDS__)
),
recs as (
  select x, to_timestamp((x->>'messageTimestamp')::bigint) ts
    from net._http_response h, jsonb_array_elements(coalesce(h.content::jsonb->'messages'->'records', '[]'::jsonb)) x
   where h.id in (__RIDS__)
)
select o.nome instancia,
       bool_or(r.x->'key'->>'fromMe' = 'true') enviou_o_teste,
       bool_or(r.x->'key'->>'fromMe' = 'false') recebeu_o_teste,
       to_char(max(r.ts) filter (where r.x->'key'->>'fromMe' = 'false') at time zone 'America/Sao_Paulo', 'HH24:MI:SS') recebido_as
  from owners o
  left join recs r on r.x->>'instanceId' = o.instance_id and r.ts >= '__DESDE__'::timestamptz
       and crm_phone_key(split_part(coalesce(nullif(r.x->'key'->>'remoteJidAlt', ''), r.x->'key'->>'remoteJid'), '@', 1))
           in (select crm_phone_key(o2.num) from owners o2 where o2.instance_id <> o.instance_id)
 group by o.nome;
