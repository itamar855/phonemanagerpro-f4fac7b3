-- Leitura. As páginas (04) já chegaram e cobrem desde __DESDE__? Se a mais antiga buscada
-- ainda for mais nova que DESDE, busque mais páginas. Parâmetros: RID_DE, RID_ATE, DESDE
with g as (select generate_series(__RID_DE__, __RID_ATE__) id),
r as (select g.id, h.status_code, h.content from g left join net._http_response h on h.id = g.id),
recs as (select x, to_timestamp((x->>'messageTimestamp')::bigint) ts
           from r, jsonb_array_elements(case when r.status_code = 200 then coalesce(r.content::jsonb->'messages'->'records', '[]'::jsonb) else '[]'::jsonb end) x)
select (select count(*) from r where r.status_code is null) pendentes,
       (select count(*) from r where r.status_code is not null and r.status_code <> 200) com_erro,
       (select count(*) from recs) mensagens,
       (select string_agg(distinct x->>'instanceId', ',') from recs) instance_id,
       to_char((select min(ts) from recs) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') mais_antiga,
       to_char((select max(ts) from recs) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') mais_nova,
       (select min(ts) from recs) <= '__DESDE__'::timestamptz cobre_desde;
