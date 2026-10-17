# AI NEXT STEPS — CHECKLIST ORDENADO E PRÓXIMAS ETAPAS

> **AVISO PARA A NOVA IA APÓS REINÍCIO:**  
> **NÃO execute automaticamente nenhuma dessas etapas ao iniciar o novo chat.**  
> Leia primeiro o [AI_HANDOFF.md](file:///c:/Users/Hard%20Work/Desktop/cellmanagerpro/phonemanagerpro-f4fac7b3/AI_HANDOFF.md), apresente o resumo do ponto exato de parada e aguarde a autorização explícita do usuário antes de realizar qualquer alteração.

---

## Sequência Ordenada de Execução

### ✅ ETAPA 1 — Fix Comprovantes do Técnico (CONCLUÍDA)
- [x] Correção de upload isolado por `store_id` em `src/components/OsParts.tsx`.
- [x] Remoção de fallback `geral` e verificação estrita de UUID de loja.
- [x] Visualização com URL assinada segura em `src/lib/storageHelper.ts`.
- [x] Branch `fix/upload-comprovantes-tecnico` commitada (`f4961d0`) e enviada ao remoto.

---

### ✅ ETAPA 2 — Liquidação de Comissões e Relatórios Financeiros (CONCLUÍDA)
- [x] Criação de schema de comissões `commission_settlements`.
- [x] Integração no frontend em `src/pages/Relatorios.tsx` e `CommissionPayoutModal.tsx`.
- [x] 63 testes unitários criados e aprovados.
- [x] Branch `feat/commission-settlements` commitada (`ea8c97b`) e enviada ao remoto.

---

### ✅ ETAPA 3 — Hardening de Service Orders, Fornecedores e Storage Privado (Phase 1B & 1C) (CONCLUÍDA)
- [x] 4 migrations atômicas preparadas.
- [x] 8 arquivos frontend adaptados (OS, Vendas, Caixa, Transações, Técnico, etc.).
- [x] 363 testes passando com 0 erros de TypeScript.
- [x] Branch `feat/security-hardening-phase1b-1c` commitada (`10c5450`) e enviada ao remoto.

---

### ✅ ETAPA 4 — Extensão Chrome de Leads & WhatsApp Bridge (CONCLUÍDA)
- [x] Criar branch `feat/extension-leads-bridge` a partir do estado atual.
- [x] Adicionar os 10 arquivos cirúrgicos (`extension/*`, 2 migrations de bridge/RLS e 2 testes unitários).
- [x] Executar gates de qualidade (`npx tsc --noEmit` e `npm test -- --run` — 363/363 PASS).
- [x] Fazer commit isolado (`2f36a45`) e enviar para `origin/feat/extension-leads-bridge`.
- [x] Não mesclar em `main` nem aplicar SQL no banco remoto.

---

### ⏳ ETAPA 5 — Consolidação e Rollout Remoto (Quando solicitado pelo usuário)
- [ ] Revisão geral dos Pull Requests no GitHub.
- [ ] Planejamento da ordem de merge ou aplicação de migrations no banco remoto Supabase (sob instrução expressa).

