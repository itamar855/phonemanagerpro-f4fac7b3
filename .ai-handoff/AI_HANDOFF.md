# AI HANDOFF — CELLMANAGERPRO / PHONEMANAGERPRO
**Data da Última Atualização:** 2026-10-08  
**Status do Projeto:** Fase C2 em Andamento (Migração da Publishable Key em Produção)  
**Ambiente:** Supabase Project Ref `hzrqtolfbwnmmeliazmh` | Vercel `cellpromanager.vercel.app`  

---

## 1. Visão Geral e Contexto Executivo

Este documento é a fonte canônica e definitiva de estado para qualquer IA que continue este trabalho após o reinício do ambiente.

O projeto é uma aplicação comercial de gestão de lojas de celulares (Vite + React 18 + Tailwind + TypeScript) acoplada a um backend Supabase (PostgreSQL, Auth e Edge Functions Deno).

### O que foi feito até agora:
1. **Quarentena das Integrações Externas Adiadas (Commit `a67b812`):**
   - `INTEGRATIONS_DEFERRED = SIM`.
   - `instagram-webhook` e `whatsapp-financial-assistant` foram desativadas/undeployed do runtime Supabase (retornam HTTP 404 seguro). Códigos locais e testes (24 testes) permanecem 100% preservados.
   - `whatsapp-webhook` mantido com `verify_jwt: true` no Supabase Edge Runtime.
   - Workflow inseguro `.github/workflows/backup.yml` removido do repositório público e neutralizado em `docs/disabled-workflows/backup.yml.disabled`.
2. **Saneamento de Segurança do `.env` Local (Commit `e5a8b5e`):**
   - O `.env` físico foi removido do índice Git com `git rm --cached -- .env`.
   - O `.env` local é ignorado estritamente por `.gitignore:28`.
   - Repositório público no GitHub NÃO contém o arquivo `.env` (HTTP 404 confirmado).
3. **Fase A Local — Compatibilidade do Frontend (Commit `e280cd8`):**
   - `src/integrations/supabase/client.ts`: dependência de decodificação JWT (`atob`, `split('.')`) completamente removida. Project ref derivado com segurança da URL (`new URL(rawUrl).hostname.split('.')[0]`). Função `isValidPublishableKeyFormat` aceita tanto `sb_publishable_...` quanto JWT transitório.
   - `src/pages/AIAssistant.tsx`: corrigido para enviar `apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` e `Authorization: Bearer ${session.access_token}`, com guarda fail-closed quando não há sessão ativa.
   - Suíte de testes criada: `src/__tests__/business-rules/supabase-client-config.test.ts` (14 testes abrangentes).
   - Suíte geral de testes unitários: **375/375 PASS** (29 arquivos de teste).
4. **Fase B Local — Troca Local para `sb_publishable_...`:**
   - O arquivo físico local `.env` foi atualizado pelo usuário com a chave moderna `sb_publishable_...`.
   - `VITE_SUPABASE_PUBLISHABLE_KEY_PRESENT = SIM`, `LOCAL_KEY_TYPE = sb_publishable`.
   - Build e bundle local inspecionados: `BUNDLE_HAS_SB_PUBLISHABLE = SIM`, `BUNDLE_HAS_LEGACY_ANON_JWT = NÃO`.
   - Smoke test local autenticado (`http://localhost:8080`) com usuário `itamar8555@gmail.com`: Dashboard carregou dados reais de banco com zero erros 401/403/CORS.
5. **Fase C1 — Publicação do Código de Compatibilidade:**
   - Commit cirúrgico `e280cd8` enviado para `origin/main`.
   - Deploy automático no Vercel gerado e promovido.
   - Smoke test em produção provou: `NOVO_CODIGO + LEGACY_ENV = FUNCIONANDO` (todas as telas carregando dados reais no app hospedado com a chave legada ainda ativa).
6. **Fase C2 — Troca em Produção no Vercel (Ponto Exato de Parada):**
   - No painel da Vercel (Project Settings ➔ Environment Variables), o usuário editou as variáveis de ambiente.
   - **Diagnóstico confirmado por print:** A variável `VITE_SUPABASE_PUBLISHABLE_KEY` para o ambiente **Production** ainda exibia o valor legado iniciando com `eyJhbGci...`.
   - Por essa razão, os builds de teste da Vercel ainda geravam o bundle com o token legado antigo.
   - O usuário precisa colar o valor moderno `sb_publishable_...` em `VITE_SUPABASE_PUBLISHABLE_KEY` no Vercel, salvar e fazer o Redeploy sem cache.

---

## 2. Metadados do Repositório Git

* **Branch:** `main` (sincronizada com `origin/main`)
* **Último Commit:** `e280cd8` (`security: support modern Supabase publishable key`)
* **Commits Relevantes Recentes:**
  * `e280cd8`: Suporte frontend ao formato moderno `sb_publishable_...` e headers de edge functions.
  * `e5a8b5e`: Desindexação segura do `.env` do repositório público.
  * `a67b812`: Desativação do workflow inseguro de backup.
* **Isolamento de Credenciais:**
  * `.env` local: Presente fisicamente no disco, **untracked** no Git, protegido por `.gitignore`.
  * Segredos reais no Git: **0**.

---

## 3. Estado das Chaves Supabase

| Credencial | Status Local | Status Vercel (Produção) | Status Supabase |
| :--- | :---: | :---: | :---: |
| **Publishable / Anon** | `sb_publishable_...` (Ativa) | Pendente colar `sb_publishable_` | Chave moderna e legado JWT ativas |
| **Service Role** | N/A (Frontend não possui) | N/A | Chave moderna e legado JWT ativas |
| **Legacy Keys Desativadas?** | **NÃO** | **NÃO** | **NÃO (Ainda ativas)** |

> **REGRA CRÍTICA:** As chaves legadas no Supabase NÃO devem ser desativadas até que a produção na Vercel esteja comprovadamente rodando e autenticando com a chave moderna `sb_publishable_...`.

---

## 4. O Que Fazer Assim Que Retomar (Próximo Passo Imediato)

Quando a nova sessão for iniciada:
1. **Passo 1 (Usuário no Vercel):**
   - Acessar o Vercel: `Project Settings` ➔ `Environment Variables`.
   - Na linha `VITE_SUPABASE_PUBLISHABLE_KEY`, clicar em `...` ➔ `Edit`.
   - Substituir o valor que começa com `eyJ...` pela chave moderna `sb_publishable_...` (a mesma do `.env` local).
   - Garantir que a caixinha **Production** está marcada e clicar em **Save**.
   - Ir na aba **Deployments** ➔ clicar nos `...` do último deploy ➔ **Redeploy** (desmarcar *"Use existing Build Cache"*).
2. **Passo 2 (IA / Validação Automatizada):**
   - Rodar o script `node scratch/fetch_fresh.mjs` para inspecionar o bundle de produção.
   - Confirmar: `PRODUCTION_BUNDLE_HAS_SB_PUBLISHABLE = SIM` e `PRODUCTION_BUNDLE_HAS_LEGACY_ANON_JWT = NÃO`.
   - Executar o Smoke Test autenticado em `https://cellpromanager.vercel.app/` (Login, Dashboard, Vendas, OS, Clientes, Estoque, Caixa, Equipe, Logout).
3. **Passo 3 (Auditoria Final e Desativação Legacy):**
   - Confirmar `ACTIVE_LEGACY_ANON_ONLY_CONSUMERS = []` e `ACTIVE_LEGACY_SERVICE_ROLE_ONLY_CONSUMERS = []`.
   - Autorizar a desativação das chaves legadas no painel do Supabase.
   - Prosseguir para a **Fase 0B** (execução do SQL definitivo de RLS no banco de dados).

---

## 5. Validação Técnica Atual do Código

* `npx tsc --noEmit`: **PASS** (0 erros de tipagem)
* `npm run build`: **PASS** (compilação limpa em ~50s)
* `npx vitest run`: **PASS** (**375/375 testes passando** em 29 arquivos de teste)
