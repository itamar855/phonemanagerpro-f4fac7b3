# Project Brain (Architecture & Context)

Este documento é a **fonte primária e canônica de contexto** para o projeto `CellManagerPro` (também conhecido como `phonemanagerpro`). Ele deve ser consultado antes de qualquer nova implementação, correção de bug ou evolução arquitetural, visando manter a consistência, evitar quebras de regras de negócio (invariantes) e economizar tokens/tempo de reanálise. 

Sempre que a arquitetura, modelos de dados ou regras de negócio sofrerem mudanças estruturais, **este arquivo deve ser atualizado**.

---

## 1. Visão Geral do Domínio

O sistema é um **ERP / PDV Multi-loja** focado no nicho de **assistências técnicas e venda de dispositivos (celulares/eletrônicos) e acessórios**.
O software permite a gestão completa da loja, englobando:
- Controle de estoque (aparelhos e acessórios) com rastreamento por IMEI.
- Ponto de Venda (PDV) com múltiplos métodos de pagamento, cálculo de lucro, comissionamento e trade-in (aparelho na troca).
- Fluxo de Caixa (Abertura/Fechamento) e DRE.
- Gestão Financeira (Contas a pagar/receber, conciliação bancária, finanças PF e PJ).
- Ordens de Serviço (OS) com acompanhamento, check-list, peças e galeria de fotos.
- CRM (Leads, integração com WhatsApp/Instagram e IA/Chatbot).
- Gestão de Equipe (Perfis de acesso: Admin, Gerente, Vendedor, Técnico).

### Objetivos Funcionais
- **Gestão Centralizada:** Unificar estoque, vendas e OS.
- **Controle Financeiro Rigoroso:** Garantir que o valor líquido da venda bata com as entradas de caixa e transações bancárias.
- **Auditoria Total:** Registrar logs de qualquer alteração de estado (criação, edição e deleção) em tabelas cruciais.
- **Multitenancy (Multi-loja):** Permitir que um usuário admin gerencie múltiplas lojas (franquias ou filiais) e alterne a visão (`activeStoreId`).

### Objetivos Não-Funcionais
- **Responsividade e Usabilidade:** Uso de componentes rápidos e interface polida (Tailwind, Shadcn UI).
- **Segurança (RLS):** Garantir que usuários de uma loja não enxerguem os dados de outra loja via PostgreSQL Row Level Security (RLS).
- **Resiliência:** Tratamento robusto no frontend para offline fallback ou erros de API.

---

## 2. Diagrama Textual da Arquitetura

```mermaid
graph TD
    %% Frontend Layer
    subgraph Frontend [React + Vite SPA]
        UI[Componentes Shadcn UI / Tailwind]
        Router[React Router DOM]
        State[React Query / Context API]
        Pages[Páginas / Módulos]
    end

    %% Backend Layer
    subgraph Backend [Supabase]
        Auth[Supabase Auth - Identity]
        DB[(PostgreSQL - Database)]
        RLS[Row Level Security]
        Storage[Supabase Storage - Comprovantes/Fotos]
    end
    
    %% External Integrations
    subgraph External [Integrações]
        WA[WhatsApp API]
        IG[Instagram API]
        AI[AI/LLM Bot]
    end

    UI --> Pages
    Pages --> State
    State --> Router
    State -->|Supabase Client| Backend
    Backend --> External
    Auth --> RLS
    RLS --> DB
```

---

## 3. Módulos e Responsabilidades

| Módulo (Página) | Arquivo Principal | Responsabilidade |
|-----------------|-------------------|------------------|
| **Vendas / PDV** | `src/pages/Vendas.tsx` | Registro de vendas de aparelhos (tabela `sales`) e acessórios (tabela `transactions`). Lida com trade-in, comissões, múltiplos métodos de pagamento (pix, cartão, dinheiro) e gera recibos (PDF/WhatsApp). |
| **Estoque** | `src/pages/Estoque.tsx` | CRUD de aparelhos (`products`) e acessórios (`accessories`). Status de produtos: `in_stock`, `sold`, `maintenance`. |
| **Caixa** | `src/pages/Caixa.tsx` | Abertura, suprimento, sangria e fechamento de caixa (`cash_registers`, `cash_entries`). Interage diretamente com as vendas para registro de entradas em dinheiro. |
| **Financeiro** | `src/pages/Transacoes.tsx`, `Contas.tsx` | Gestão de `bank_accounts`, conciliação e transações gerais (income, expense). Contas bancárias e taxas de adquirentes (cartão/pix). |
| **Ordens de Serviço** | `src/pages/OrdensServico.tsx` | Criação de OS (`service_orders`), checklist pré/pós, controle de status, adição de peças e aprovação de orçamento. Rota pública para cliente `OSPublica.tsx`. |
| **Clientes e CRM**| `src/pages/Clientes.tsx`, `Leads.tsx` | Gestão da carteira de clientes, captura de leads, integração omnichannel via webhook. |
| **Equipe & Auditoria** | `src/pages/Equipe.tsx`, `Auditoria.tsx` | Criação de usuários (`profiles`), definição de permissões e log detalhado de ações (`audit_logs`). |

---

## 4. Contratos de APIs e Esquemas de Dados (PostgreSQL / Supabase)

### Principais Entidades e Relacionamentos
- **`stores`**: Entidade raiz do Multitenancy. Quase todas as tabelas possuem `store_id`.
- **`profiles`**: Extensão da auth.users. Possui `role` (admin, gerente, vendedor, técnico) e `store_id`.
- **`products`** (Aparelhos): `id`, `name`, `imei`, `cost_price`, `sale_price`, `status`, `store_id`.
- **`accessories`**: Estoque de itens quantificáveis (`quantity`, `min_quantity`).
- **`sales`**: Venda de aparelhos. Relaciona-se com `products`, contém split de pagamentos (`payment_cash`, `payment_card`, `payment_pix`), comissão, dados do cliente e trade-in.
- **`transactions`**: Transações financeiras genéricas e vendas de PDV/acessórios.
- **`cash_registers` & `cash_entries`**: Sessões de caixa diário (abertura/fechamento) e movimentações efetivas em espécie/misto.
- **`service_orders`**: OS de manutenção, vinculada a clientes, aparelhos, técnicos, peças (`service_order_parts`).

### Invariantes e Regras de Negócio Críticas
1. **Multitenancy Estrito**: 
   - Ao renderizar componentes, as *queries* (React Query ou chamadas diretas) **devem** ser filtradas por `store_id`. Se `activeStoreId === "all"`, deve-se omitir o filtro ou buscar sem filtro, mas ao **inserir** dados, o `store_id` real da loja selecionada (ou a loja vinculada ao item) deve ser usado explicitamente. Não é permitido criar registros na raiz se eles requerem vínculo.
2. **Integridade de Venda e Caixa**:
   - A soma de `payment_cash + payment_card + payment_pix + trade_in_value` deve obrigatoriamente ser igual ao `sale_price` (com desconto aplicado).
   - Somente a parte em **dinheiro** (ou misto contendo dinheiro) entra na tabela `cash_entries` para impactar o caixa físico aberto.
3. **Estoque de Aparelhos**:
   - Um `product` (aparelho) é um item único, rastreado por `imei`.
   - Ao vender, seu status muda de `in_stock` para `sold`. Ao excluir a venda, o produto **retorna para `in_stock`** e transações vinculadas devem ser desfeitas.
4. **Trade-in (Aparelho na Troca)**:
   - Aparelhos recebidos na troca entram no estoque (`products`) com o valor da troca como `cost_price`.
5. **Comissionamento**:
   - Vendedores não podem editar sua própria `%` de comissão. Somente Admin/Gerente.

---

## 5. Decisões Arquiteturais (ADRs)

1. **Separação entre `sales` e `transactions`**:
   - **Contexto:** Aparelhos possuem serial number (IMEI), garantia e trade-in (`sales`). Acessórios são itens quantitativos e geram vendas rápidas no PDV (`transactions` com type `income` e category `acessorio`).
   - **Decisão:** Manter duas tabelas separadas para vendas. No frontend, unificar a visualização quando necessário (ex: Aba Vendas combina e ordena ambas por `created_at`).
2. **Uso de React Query e Local State**:
   - **Decisão:** Telas muito complexas (como Vendas) fazem *fetch* direto via `supabase.from()` num `useEffect` por questões de acoplamento legado, porém, novos módulos deverão padronizar usando `@tanstack/react-query` para melhor gerência de cache e loading states.
3. **Row Level Security (RLS)**:
   - **Decisão:** Toda a segurança de isolamento é delegada ao Postgres. O client Supabase logado só consegue ler/escrever dados onde o `store_id` pertença ao escopo autorizado no `profiles`. Admins podem ter `store_id` dinâmico para ver tudo.
4. **Trilha de Auditoria Universal (`audit_logs`)**:
   - **Decisão:** Utiliza-se a função utilitária `logAction(action, table, entity_id, before, after, storeId)` em todos os eventos de CRUD críticos (venda, exclusão, reajuste financeiro) para rastreabilidade de quem fez o quê.

---

## 6. Convenções de Codificação e Padrões

- **Componentização:** Padrão Shadcn UI (`src/components/ui/`). O design deve ser moderno e premium ("wow factor").
- **Estilização:** Tailwind CSS utility classes.
- **Formatação de Moeda:** Utilizar a função utilitária `formatCurrency` ou `Intl.NumberFormat("pt-BR")`.
- **Tratamento de Datas:** `date-fns` ou padrão nativo para o timezone do Brasil.
- **Variáveis de Estado Complexas:** Formulários usam preferencialmente estados agregados `const [form, setForm] = useState({...})` ou `react-hook-form` com `zod`.
- **Modificadores de Deleção:** Operações de deleção devem usar `Alert-Dialog` ou `Dialog` com input de confirmação ou justificativa obrigatória, dependendo da criticidade do dado.

---

## 7. Hotspots Conhecidos e Componentes Sensíveis a Falhas

- **`src/pages/Vendas.tsx`**: Ponto nevrálgico do sistema. Arquivo muito grande (>2500 linhas). Lida com múltiplas origens de dados e conciliação de caixa. Qualquer alteração neste arquivo requer testes cuidadosos no cálculo residual, emissão de PDF (`gerarNotaFiscalInterna`) e rollback manual em caso de falha de Supabase.
- **Sincronização de Caixa (`cash_entries`)**: Se o sistema falhar ao deletar uma venda, o lançamento do caixa **precisa** ser revertido (rollbacks no client-side em vez de stored procedures, requer cuidado com partial success).
- **Filtro Multi-loja (`activeStoreId === "all"`)**: Quando um admin visualiza todas as lojas, operações de CRUD (ex: registrar transação avulsa) podem falhar se a interface não forçar a escolha da loja de destino (`store_id` específico).

---

## 8. Estratégias de Observabilidade e Evolução

- **Logs Frontend**: `utils/logger.ts`, `auditLogger.ts` e painel `DebugPanel` embutido para monitorar hooks do Supabase no ambiente de admin.
- **Evolução Planejada**: 
  - Refatorar `Vendas.tsx` quebrando a UI em subcomponentes (ex: `SaleCard`, `PDVFormModal`).
  - Migrar `useEffect` massivos para Custom Hooks ou `useQuery`.

---

## 9. Changelog e Histórico de Decisões Recentes

Esta seção serve como memória persistente de features implementadas, bugs corrigidos e decisões técnicas tomadas, visando facilitar a manutenção futura sem perda de contexto.

| Data | Tipo | Componente/Arquivo | Descrição e Lógica Implementada |
|------|------|--------------------|---------------------------------|
| 10/07/2026 | `Feature / Fix` | `src/pages/Vendas.tsx` | **Unificação e Ordenação do Histórico de Vendas:** A interface de Vendas exibia separadamente as vendas de celulares (`sales`) e de acessórios do PDV (`transactions`). O usuário solicitou que tudo fosse unificado. **Lógica:** Combinamos os arrays `filteredSales` e `pdvSales` em um array único (`[...pdvSales.map(...), ...filteredSales.map(...)]`), ordenamos descendentemente usando a propriedade `created_at` convertida para timestamp (`date`) e mapeamos a renderização baseada na flag `type === 'pdv' / 'sale'`. |
| 10/07/2026 | `Feature` | `src/pages/Vendas.tsx` | **Deleção de Vendas do PDV:** Administradores precisavam apagar vendas de acessórios diretamente da lista. **Lógica:** Refatoramos a função `handleDeleteSale(item, reason)` e o estado `deleteId` para `deleteItem: { id, type }`. Se for tipo `pdv`, excluímos o registro de `transactions` e localizamos a entrada em `cash_entries` (via campo `description`) para excluí-la simultaneamente, garantindo a consistência do fluxo de caixa e gerando log de auditoria. |

| 10/07/2026 | `Bugfix` | `cash_entries` (Múltiplos) | **Vendas não refletindo no caixa:** O sistema tentava inserir/consultar entradas de caixa usando as propriedades `cash_register_id` e `store_id`, mas a tabela real (`cash_entries`) no PostgreSQL (e no `types.ts`) define a chave estrangeira do caixa como `register_id` e não possui a coluna `store_id`. Como resultado, as requisições para o Supabase falhavam de forma silenciosa ou eram recusadas pela API PostgREST. **Correção:** Substituímos `cash_register_id` por `register_id` e removemos `store_id` das chamadas `.insert()` nas páginas `Vendas.tsx`, `Caixa.tsx`, `OrdensServico.tsx` e componentes relacionados, restaurando o fluxo do fechamento do caixa. |
| 10/07/2026 | `Tech Debt` | Observabilidade, CI/CD, Testes | **Elevação da Maturidade de Qualidade:** Adicionado **Vitest** e React Testing Library para cobertura de fluxos críticos de negócio; configurado Pipeline de **GitHub Actions** (`ci.yml`) para validar tipagem, linting e testes a cada Pull Request/Push, bloqueando merges inseguros; implementado **Correlation ID (UUID)** anexado ao `logger.ts` e inserido metadados contextuais (User Agent, timestamp da solicitação) nos `audit_logs` (`after_state._meta`) para rastreabilidade de ponta-a-ponta em investigações futuras. O arquivo `Vendas.tsx` permanece mapeado como Hotspot Crítico. |

---

## 10. Decisões Arquiteturais (ADRs) de Qualidade e Observabilidade

- **ADR-001 (Testes):** Adoção de Vitest + RTL para testes unitários e de integração no ecossistema Vite + React. O objetivo não é atingir 100% de cobertura forçada, mas cobrir lógicas de negócio cruciais (como conciliação de caixa e validação de permissões).
- **ADR-002 (CI/CD):** Uso exclusivo do GitHub Actions para esteiras de integração contínua, visando simplificação operacional e bloqueio preemptivo de regressões sintáticas (via `tsc --noEmit`).
- **ADR-003 (Logging & Correlação):** Todo erro ou ação crítica persistida em `error_logs` e `audit_logs` deve conter um `Correlation ID` e contexto de ambiente (`User Agent`). Isso garante rastreabilidade temporal exata caso uma ação inicie uma cascata de chamadas de rede no Supabase.

*(Mantenha este documento atualizado a cada feature relevante criada.)*
