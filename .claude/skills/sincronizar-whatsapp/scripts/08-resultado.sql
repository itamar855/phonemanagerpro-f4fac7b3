-- Leitura. Respostas do webhook aos reenvios (07). Parâmetros: RID_DE, RID_ATE
-- success + crm.message_id = gravada | success + crm.skipped/unknown_contact = enviada a quem não é
-- contato (correto) | ignored/unsupported_message = tipo sem suporte | 401 = segredo do cron/webhook
with g as (select generate_series(__RID_DE__, __RID_ATE__) id),
r as (select g.id, h.status_code, h.error_msg,
             case when h.content ~ '^\s*\{' then h.content::jsonb end j
        from g left join net._http_response h on h.id = g.id)
select coalesce(status_code::text, 'pendente') http,
       coalesce(j->>'status', j->>'error', error_msg, '-') status,
       coalesce(j->>'reason', j->'crm'->>'reason', '') motivo,
       count(*) n,
       count(*) filter (where j->'crm'->>'message_id' is not null) gravadas,
       count(*) filter (where (j->'crm'->>'contact_created')::boolean) contatos_novos
  from r group by 1, 2, 3 order by n desc;
