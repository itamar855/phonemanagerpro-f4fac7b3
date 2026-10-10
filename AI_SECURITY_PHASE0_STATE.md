# AI SECURITY PHASE 0 STATE — CELLMANAGERPRO
**Atualizado em:** 2026-10-08

Este documento resume a matriz de estado da segurança, credenciais e RLS, indicando o status operacional de cada componente e se ele pode ou não ser modificado na próxima iteração.

---

## Matriz Canônica de Estado

| Item | Status | Pode mexer? | Observação |
| :--- | :---: | :---: | :--- |
| **Phase0A** | CONCLUÍDA | **NÃO** | Membership de Gessica corrigida e alinhada à loja Vila Eulália no banco. |
| **Phase0B dry-run** | PASS | **NÃO** | Validação de preflight no Supabase passou com normalização LF. |
| **Phase0B production** | APROVADO (NÃO EXECUTADO) | **NÃO** | Bloqueado até conclusão da troca de chave na Vercel e desativação legacy. |
| **create-user** | HARDENED & DEPLOYED (v15) | **NÃO** | Boot HTTP 401 validado. Rollback protegido. Modern-first helper ativo. |
| **admin-update-user** | HARDENED & DEPLOYED (v1) | **NÃO** | Boot HTTP 401 validado. Rollback protegido. Modern-first helper ativo. |
| **legacy service_role** | ATIVA | **NÃO** | Não desativar nem revogar até que a produção esteja 100% migrada. |
| **legacy anon key** | ATIVA | **NÃO** | Não desativar até a Vercel compilar e validar com `sb_publishable_...`. |
| **modern sb_secret** | ATIVA & VALIDADA | **SIM (Consumir)** | Chave moderna injetada no runtime Supabase (`SUPABASE_SECRET_KEYS['default']`). |
| **modern sb_publishable** | ATIVA LOCALMENTE | **SIM (Aplicar Vercel)** | `.env` local usa `sb_publishable_`. Falta aplicar na variável do Vercel. |
| **client.ts (frontend)** | MIGRADO & COMMITADO (`e280cd8`) | **PRESERVAR** | Suporta nativamente `sb_publishable_` sem decodificar JWT. |
| **AIAssistant.tsx** | HARDENED & COMMITADO (`e280cd8`) | **PRESERVAR** | Envia `apikey` pública e `Authorization: Bearer session.access_token`. |
| **create-admin** | CONGELADA / NÃO DEPLOYADA | **NÃO** | Não deployar, não fornecer `sb_secret_...`. Manter intacta localmente para histórico. |
| **whatsapp-webhook** | QUARENTENADO (verify_jwt=true) | **NÃO** | Seguro na borda pelo gateway Supabase. Feature adiada. |
| **instagram-webhook** | QUARENTENADO (HTTP 404) | **NÃO** | Undeployed no Supabase. Código local preservado com 20 testes PASS. |
| **whatsapp-financial-assistant** | QUARENTENADO (HTTP 404) | **NÃO** | Undeployed no Supabase. Código local preservado. |
| **GitHub backup** | NEUTRALIZADO | **NÃO** | Removido do repositório público (commit `a67b812`). |
| **.env no Git** | DESINDEXADO (UNTRACKED) | **PRESERVAR** | Removido do índice (commit `e5a8b5e`) e protegido por `.gitignore:28`. |
| **tests (Vitest)** | 375/375 PASS | **PRESERVAR** | 29 arquivos de teste, 0 falhas. Baseline atual é 375. |
| **build (Vite / TypeScript)** | PASS (0 ERROS) | **PRESERVAR** | `npx tsc --noEmit` e `npm run build` passam sem erros. |

---

## Diretrizes de Operação para o Próximo Chat

1. **NÃO executar a Fase 0B (SQL)** em nenhuma circunstância no início da conversa.
2. **NÃO desativar chaves legadas** no painel do Supabase antes da aprovação do smoke test da Vercel.
3. O foco imediato ao retornar é a **Fase C2**: colar a chave moderna no Vercel em `VITE_SUPABASE_PUBLISHABLE_KEY`, fazer Redeploy sem cache e rodar o smoke test na produção.
