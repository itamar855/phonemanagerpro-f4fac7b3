-- Leitura. Instâncias (sem chave), última checagem do vigia e mensagens no CRM desde __DESDE__.
-- Parâmetro: DESDE (ex.: 2026-11-19 00:00-03)
select 'agora' k, to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') v
union all
select 'instancia', c.id::text || ' | loja=' || coalesce(s.name, '-') || ' | inst=' || c.instance_name
       || ' | ativa=' || coalesce(c.is_active::text, 'null')
       || ' | config_alterada=' || to_char(c.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
  from whatsapp_config c left join stores s on s.id = c.store_id
union all
select 'vigia', w.config_id::text || ' | estado=' || coalesce(w.last_state, '-')
       || ' | ultima_recebida=' || coalesce(to_char(w.last_inbound_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '-')
       || ' | ultimo_aviso=' || coalesce(to_char(w.last_alert_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '-')
       || ' | checado=' || to_char(w.checked_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
  from whatsapp_watchdog w
union all
select 'crm', coalesce(s.name, '-') || ' | in=' || count(*) filter (where m.direction = 'in')
       || ' | out=' || count(*) filter (where m.direction = 'out')
       || ' | ultima_in=' || coalesce(to_char(max(m.created_at) filter (where m.direction = 'in') at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '-')
  from crm_messages m join crm_conversations c on c.id = m.conversation_id left join stores s on s.id = c.store_id
 where c.channel = 'whatsapp' and m.created_at >= '__DESDE__'::timestamptz
 group by s.name;
