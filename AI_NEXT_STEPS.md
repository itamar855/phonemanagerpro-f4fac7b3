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
- [x] Executar gates de qualidade (`npx tsc -b` e `npm test -- --run` — 363/363 PASS).
- [x] Fazer commit isolado (`2f36a45`) e enviar para `origin/feat/extension-leads-bridge`.

---

### ✅ ETAPA 5 — Modularização de Telas Monolíticas (Caixa e Vendas) (CONCLUÍDA)
- [x] Extração cirúrgica de 10 modais de `Caixa.tsx` para `src/components/features/caixa/` (-662 linhas).
- [x] Extração cirúrgica de 4 modais de `Vendas.tsx` para `src/components/features/vendas/` (-1.003 linhas).
- [x] Baseline de 366/366 testes PASS e 0 erros de compilação.
- [x] Commits `b381980` e `772fd4e` mesclados na branch `main` e enviados ao remoto `origin/main`.

---

### ✅ ETAPA 6 — Modularização Completa de Relatórios, OS e Estoque (CONCLUÍDA)
- [x] `Relatorios.tsx` reduzido de 1.968 para 864 linhas (-1.104 linhas) com 9 submódulos criados em `src/components/features/relatorios/` (commit `cbe33fc`).
- [x] `OrdensServico.tsx` reduzido de 1.766 para 999 linhas (-767 linhas) com 4 submódulos criados em `src/components/features/os/` (commit `a0f790f`).
- [x] `Estoque.tsx` reduzido de 1.688 para 986 linhas (-702 linhas) com 9 submódulos criados em `src/components/features/estoque/` (commit `a8c5b77`).
- [x] Todas as validações aprovadas: `npx tsc -b` (0 erros), `npm run build` (sucesso), `npm test -- --run` (366/366 testes PASS).
- [x] Branch `refactor/modularize-relatorios-os-estoque` e branch `main` sincronizadas no GitHub remoto (`origin/main`).

---

### ⏳ ETAPA 7 — Próximos Passos Sugeridos / Backlog Remanescente
- [ ] Revisão e Merge das 5 branches de feature para a branch `main` no GitHub (`fix/upload-comprovantes-tecnico`, `feat/commission-settlements`, `feat/security-hardening-phase1b-1c`, `feat/extension-leads-bridge`, `fix/tech-commission-settlement-view`).
- [ ] Aplicação das migrations pendentes no banco Supabase remoto (quando o usuário autorizar a execução em produção).
- [ ] Empacotamento / instalação da extensão de leads do Chrome a partir de `extension/`.
- [ ] Migração opcional de `fetchData` manuais para React Query (`useQuery`), eliminando os `useEffect` inline remanescentes.
