-- Leitura. Resultado da sondagem (02) SEM segredos: do webhook só os nomes dos cabeçalhos;
-- do dono só os 4 últimos dígitos. Parâmetro: RIDS (lista, ex.: 131,132,133)
select r.id rid, r.status_code, coalesce(r.error_msg, '') erro,
  case
    when j ? 'instance' and j->'instance' ? 'state' then 'estado=' || (j->'instance'->>'state')
    when j ? 'url' and j ? 'events' then
      'webhook enabled=' || coalesce(j->>'enabled', '?') || ' url=' || coalesce(j->>'url', '-')
      || ' eventos=' || coalesce(j->>'events', '-')
      || ' cabecalhos=' || coalesce((select string_agg(k, ',') from jsonb_object_keys(case when jsonb_typeof(j->'headers') = 'object' then j->'headers' else '{}'::jsonb end) k), '-')
      || ' alterado=' || coalesce(to_char((j->>'updatedAt')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '-')
    when jsonb_typeof(j) = 'array' then
      'dono=…' || right(split_part(coalesce(j->0->>'ownerJid', ''), '@', 1), 4)
      || ' status=' || coalesce(j->0->>'connectionStatus', '-') || ' nome=' || coalesce(j->0->>'name', '-')
      || ' instance_id=' || coalesce(j->0->>'id', '-')
    else left(r.content, 120)
  end info
from net._http_response r
cross join lateral (select case when r.content ~ '^\s*[\[{]' then r.content::jsonb else 'null'::jsonb end j) x
where r.id in (__RIDS__)
order by r.id;
