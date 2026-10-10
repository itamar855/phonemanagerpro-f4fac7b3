# AI NEXT STEPS — CHECKLIST ORDENADO DE HARDENING E ROLLOUT

> **AVISO PARA A NOVA IA:**  
> **NÃO execute automaticamente nenhuma dessas etapas ao iniciar o novo chat.**  
> Leia primeiro o [AI_HANDOFF.md](file:///c:/Users/Hard%20Work/Desktop/cellmanagerpro/phonemanagerpro-f4fac7b3/AI_HANDOFF.md), apresente o resumo do estado atual, diagnostique o ponto exato de parada e aguarde a autorização explícita do usuário antes de realizar qualquer alteração.

---

## Sequência Ordenada de Execução

### ETAPA 1 — Quarentenar Integrações Adiadas (CONCLUÍDA)
- [x] Diagnóstico read-only dos webhooks externos.
- [x] Undeploy remoto de `instagram-webhook` (HTTP 404).
- [x] Undeploy remoto de `whatsapp-financial-assistant` (HTTP 404).
- [x] `whatsapp-webhook` seguro na borda com `verify_jwt: true`.
- [x] Neutralizar `.github/workflows/backup.yml` (movido para `docs/disabled-workflows/backup.yml.disabled` e commit `a67b812`).

---

### ETAPA 2 — Saneamento de Segurança do `.env` Local (CONCLUÍDA)
- [x] Auditoria segura do `.env` (apenas anon JWT, sem segredos privados).
- [x] Desindexação do `.env` no Git (`git rm --cached -- .env` no commit `e5a8b5e`).
- [x] Proteção confirmada por `.gitignore:28` e ausência no GitHub (HTTP 404).

---

### ETAPA 3 — Fase A: Código Frontend Compatível com `sb_publishable_...` (CONCLUÍDA)
- [x] `src/integrations/supabase/client.ts` sem dependência de JWT (`atob`/`split('.')`).
- [x] Derivação segura do ref a partir da URL (`getProjectRefFromUrl`).
- [x] `isValidPublishableKeyFormat` defensivo (aceita `sb_publishable_...` e legacy JWT transitório).
- [x] `src/pages/AIAssistant.tsx` corrigido com headers `apikey` e `Authorization: Bearer session.access_token`.
- [x] 14 novos testes em `src/__tests__/business-rules/supabase-client-config.test.ts` (375/375 testes PASS).

---

### ETAPA 4 — Fase B: Troca Local para `sb_publishable_...` (CONCLUÍDA)
- [x] `.env` local atualizado com a chave moderna `sb_publishable_...`.
- [x] Build local inspecionado: `BUNDLE_HAS_SB_PUBLISHABLE = SIM`, `BUNDLE_HAS_LEGACY_ANON_JWT = NÃO`.
- [x] Smoke test local autenticado (`http://localhost:8080`) com dados reais e 0 erros.

---

### ETAPA 5 — Fase C1: Deploy de Compatibilidade em Produção (CONCLUÍDA)
- [x] Commit cirúrgico `e280cd8` enviado para `origin/main`.
- [x] Deploy no Vercel gerado e promovido.
- [x] Smoke test em produção comprovou `NOVO_CODIGO + LEGACY_ENV = FUNCIONANDO`.

---

### ETAPA 6 — Fase C2: Troca em Produção no Vercel (CONCLUÍDA)
- [x] No Vercel (Project Settings ➔ Environment Variables): colar a chave moderna `sb_publishable_...` em `VITE_SUPABASE_PUBLISHABLE_KEY` (ambiente Production) e Salvar.
- [x] Fazer Redeploy do commit `e280cd8` desmarcando *"Use existing Build Cache"*.
- [x] Inspecionar bundle de produção (`fetch_fresh.mjs`):
  * `PRODUCTION_BUNDLE_HAS_SB_PUBLISHABLE = SIM`
  * `PRODUCTION_BUNDLE_HAS_LEGACY_ANON_JWT = NÃO`
- [x] Smoke test autenticado na URL de produção `https://cellpromanager.vercel.app/` (Login e dados validados).

---

### ETAPA 7 — Módulo do Técnico, Bancada & Comissões (CONCLUÍDO)
- [x] `Index.tsx`: Dashboard do Técnico com Bancada, Fila e Comissões.
- [x] `osStatus.ts`: 8 status canônicos (`analyzing`, `repairing`).
- [x] `osCalculations.ts` / `OrdensServico.tsx`: Resolução de técnico ("Nenhum" -> `null`, preservação em edições não relacionadas).
- [x] `Relatorios.tsx`: Separação de comissões técnico vs vendedor.
- [x] 251 testes unitários passando e validação visual aprovada.

---

### ETAPA 8 — Auditoria Final e Desativar Chaves Legadas no Supabase (PRÓXIMO PASSO)
- [ ] Confirmar `ACTIVE_LEGACY_ANON_ONLY_CONSUMERS = []`.
- [ ] Confirmar `ACTIVE_LEGACY_SERVICE_ROLE_ONLY_CONSUMERS = []`.
- [ ] Acessar Supabase Dashboard ➔ Project Settings ➔ API.
- [ ] Desativar Legacy API Keys (anon e service_role).
- [ ] Validar que produção e local continuam 100% operacionais.

---

### ETAPA 8 — Desativar Chaves Legadas no Supabase
- [ ] Acessar Supabase Dashboard ➔ Project Settings ➔ API.
- [ ] Desativar Legacy API Keys (anon e service_role).
- [ ] Validar que produção e local continuam 100% operacionais.

---

### ETAPA 9 — Executar Script da Fase 0B no Banco
- [ ] Executar script transacional canônico da Fase 0B no SQL Editor do Supabase.
- [ ] Aplicar 17 policies, 63 grants, integridade multi-tenant em `member_stores` e schema `private`.
- [ ] Validar suíte SQL de RLS.

---

### ETAPA 10 — Retomada Futura das Integrações Externas (Quando Solicitado)
- [ ] Retomar `whatsapp-webhook`, `instagram-webhook` e `whatsapp-financial-assistant`.
