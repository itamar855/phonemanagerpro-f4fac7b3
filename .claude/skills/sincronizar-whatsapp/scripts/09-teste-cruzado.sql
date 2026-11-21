-- ESCRITA (--write): teste de recebimento entre as lojas (precisa de 2+ instâncias ativas).
-- 1) cadastra o número de cada loja como contato IGNORADO ("outra loja") nas outras, se ainda
--    não for contato — assim o teste não vira lead, não aciona IA nem aviso no celular;
-- 2) cada instância manda um texto curto para as outras.
-- Parâmetro: DONO_RIDS = rids "dono" do 02 (ex.: 312,313). Guarde a hora devolvida.
with own as (
  select c.id cfg, c.store_id, c.instance_name, rtrim(c.api_url, '/') b, c.api_key k,
         split_part(h.content::jsonb->0->>'ownerJid', '@', 1) num
    from net._http_response h
    join whatsapp_config c on c.instance_name = h.content::jsonb->0->>'name' and c.is_active
   where h.id in (__DONO_RIDS__) and coalesce(h.content::jsonb->0->>'ownerJid', '') <> ''
),
ins as (
  insert into crm_contacts (store_id, name, phone, phone_key, origin_channel, ignored, ignored_reason)
  select distinct me.store_id, 'WhatsApp da outra loja (' || other.instance_name || ')', other.num, crm_phone_key(other.num), 'manual', true, 'outra loja'
    from own me join own other on other.cfg <> me.cfg
   where not exists (select 1 from crm_contacts ct where ct.store_id = me.store_id and ct.phone_key = crm_phone_key(other.num))
  returning id
)
select me.instance_name remetente, '…' || right(other.num, 4) para,
       to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI:SS') enviado_em,
       (select count(*) from ins) contatos_ignorados_criados,
       net.http_post(
         url := me.b || '/message/sendText/' || replace(me.instance_name, ' ', '%20'),
         headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', me.k),
         body := jsonb_build_object('number', other.num, 'text', 'Teste automático de recebimento do CRM (' || me.instance_name || ') — pode ignorar.'),
         timeout_milliseconds := 20000) rid
  from own me join own other on other.cfg <> me.cfg;
