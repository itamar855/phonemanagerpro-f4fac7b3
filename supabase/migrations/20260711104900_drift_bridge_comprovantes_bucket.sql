-- Ponte para o replay do zero (Supabase Preview, banco local).
-- O bucket "comprovantes" foi criado à mão no painel e nunca entrou numa
-- migration, mas a 20260711105000 e as fases 1C já contam com ele.
-- Nasce público como era na época; a 20261016020000 o torna privado.
-- ON CONFLICT DO NOTHING: em produção não faz nada.
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO NOTHING;
