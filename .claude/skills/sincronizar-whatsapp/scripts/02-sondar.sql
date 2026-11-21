-- ESCRITA (--write): só enfileira leituras na Evolution pelo pg_net (a chave fica no banco).
-- Para cada instância ativa: estado, webhook e dono do número. Devolve o rid de cada pedido.
with c as (select id, instance_name, rtrim(api_url, '/') b, replace(instance_name, ' ', '%20') i, api_key k
             from whatsapp_config where is_active)
select c.id config_id, c.instance_name, 'estado' oque,
       net.http_get(url := b || '/instance/connectionState/' || i, headers := jsonb_build_object('apikey', k), timeout_milliseconds := 15000) rid
  from c
union all
select c.id, c.instance_name, 'webhook',
       net.http_get(url := b || '/webhook/find/' || i, headers := jsonb_build_object('apikey', k), timeout_milliseconds := 15000)
  from c
union all
select c.id, c.instance_name, 'dono',
       net.http_get(url := b || '/instance/fetchInstances?instanceName=' || i, headers := jsonb_build_object('apikey', k), timeout_milliseconds := 15000)
  from c;
