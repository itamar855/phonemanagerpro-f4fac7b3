-- ESCRITA (--write): enfileira páginas de findMessages de UMA instância (todas as conversas).
-- A Evolution devolve no máximo 50 por página, mais nova primeiro.
-- Parâmetros: CONFIG_ID, PAG_DE, PAG_ATE. Devolve a faixa de rid (guarde por instância).
with c as (select rtrim(api_url, '/') b, replace(instance_name, ' ', '%20') i, api_key k
             from whatsapp_config where id = '__CONFIG_ID__')
select min(rid) rid_de, max(rid) rid_ate, count(*) paginas from (
  select net.http_post(
           url := b || '/chat/findMessages/' || i,
           headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k),
           body := jsonb_build_object('where', '{}'::jsonb, 'page', p, 'limit', 50),
           timeout_milliseconds := 30000) rid
    from c, generate_series(__PAG_DE__, __PAG_ATE__) p
) z;
