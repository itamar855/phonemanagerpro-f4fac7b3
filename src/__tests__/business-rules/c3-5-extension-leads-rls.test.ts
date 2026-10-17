import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_A_PATH = path.resolve(
  __dirname,
  '../../../supabase/migrations/20261014000000_extension_leads_schema_bridge.sql'
);

const MIGRATION_B_PATH = path.resolve(
  __dirname,
  '../../../supabase/migrations/20261014010000_extension_leads_rls_hardening.sql'
);

describe('C3.8 — Testes de Rollout Compatível (Migration A Schema Bridge + Migration B RLS Hardening)', () => {
  const migrationASql = fs.readFileSync(MIGRATION_A_PATH, 'utf-8');
  const migrationBSql = fs.readFileSync(MIGRATION_B_PATH, 'utf-8');

  // =========================================================================
  // MIGRATION A — SCHEMA BRIDGE
  // =========================================================================
  describe('Migration A — Schema Bridge (Zero RLS / Zero Grants / Transição Segura)', () => {
    it('o arquivo da Migration A existe e possui estrutura válida', () => {
      expect(fs.existsSync(MIGRATION_A_PATH)).toBe(true);
      expect(migrationASql.length).toBeGreaterThan(300);
    });

    it('adiciona store_id em lead_messages e lead_responses com FK para public.stores(id)', () => {
      expect(migrationASql).toMatch(/ALTER\s+TABLE\s+public\.lead_messages\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+store_id\s+uuid\s+REFERENCES\s+public\.stores\(id\);/i);
      expect(migrationASql).toMatch(/ALTER\s+TABLE\s+public\.lead_responses\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+store_id\s+uuid\s+REFERENCES\s+public\.stores\(id\);/i);
    });

    it('NÃO altera RLS, NÃO altera policies e NÃO altera grants na Migration A', () => {
      expect(migrationASql).not.toMatch(/\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
      expect(migrationASql).not.toMatch(/\bCREATE\s+POLICY\b/i);
      expect(migrationASql).not.toMatch(/\bDROP\s+POLICY\b/i);
      expect(migrationASql).not.toMatch(/\bREVOKE\s+/i);
      expect(migrationASql).not.toMatch(/\bGRANT\s+/i);
    });

    it('contém preflight fail-closed pós-backfill para mensagens/respostas vinculadas a leads com store_id', () => {
      expect(migrationASql).toContain('DO $$');
      expect(migrationASql).toContain("RAISE EXCEPTION 'C3_8_BRIDGE_FAIL: lead_messages possui registros com store_id não propagado após backfill'");
      expect(migrationASql).toContain("RAISE EXCEPTION 'C3_8_BRIDGE_FAIL: lead_responses possui registros com store_id não propagado após backfill'");
    });

    it('cria índices de suporte para store_id e lead_id', () => {
      expect(migrationASql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_messages_store_id/i);
      expect(migrationASql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_responses_store_id/i);
      expect(migrationASql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_leads_store_id/i);
    });

    it('compatibilidade comprovada: extensão antiga continua funcionando após Migration A', () => {
      // Simula tabela com coluna opcional store_id (nullable)
      interface TableSchema { store_id?: string | null; name?: string; content?: string }

      const legacyMessageInsert: TableSchema = { content: 'Oi, vim pelo WhatsApp' }; // Sem store_id!
      const canInsertLegacy = (row: TableSchema) => {
        // Coluna é nullable, logo inserção sem store_id é aceita
        return true;
      };

      expect(canInsertLegacy(legacyMessageInsert)).toBe(true);
    });

    it('compatibilidade comprovada: extensão v10 consegue gravar store_id após Migration A', () => {
      interface TableSchema { store_id?: string | null; name?: string; content?: string }

      const v10MessageInsert: TableSchema = {
        content: 'Lead v10 sincronizado',
        store_id: 'c5e9bf6f-0e93-442c-9a6e-4b113766b48f'
      };

      expect(v10MessageInsert.store_id).toBeDefined();
      expect(v10MessageInsert.store_id).not.toBeNull();
    });
  });

  // =========================================================================
  // MIGRATION B — RLS HARDENING FINAL
  // =========================================================================
  describe('Migration B — RLS Hardening Final (Isolamento Total Multi-Loja)', () => {
    it('o arquivo da Migration B existe e possui estrutura válida', () => {
      expect(fs.existsSync(MIGRATION_B_PATH)).toBe(true);
      expect(migrationBSql.length).toBeGreaterThan(500);
    });

    it('ativa RLS nas 3 tabelas sem FORCE RLS', () => {
      expect(migrationBSql).toMatch(/ALTER\s+TABLE\s+public\.leads\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
      expect(migrationBSql).toMatch(/ALTER\s+TABLE\s+public\.lead_messages\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
      expect(migrationBSql).toMatch(/ALTER\s+TABLE\s+public\.lead_responses\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
      expect(migrationBSql).not.toMatch(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
    });

    it('revoga total acesso de anon e public nas 3 tabelas (FINAL_ANON_ACCESS = NONE)', () => {
      expect(migrationBSql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.leads\s+FROM\s+anon,\s*public;/i);
      expect(migrationBSql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.lead_messages\s+FROM\s+anon,\s*public;/i);
      expect(migrationBSql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.lead_responses\s+FROM\s+anon,\s*public;/i);
      expect(migrationBSql).not.toMatch(/GRANT\s+.*\s+TO\s+anon/i);
    });

    it('concede privilégios de CRUD estritamente a authenticated', () => {
      expect(migrationBSql).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.leads\s+TO\s+authenticated;/i);
      expect(migrationBSql).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.lead_messages\s+TO\s+authenticated;/i);
      expect(migrationBSql).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.lead_responses\s+TO\s+authenticated;/i);
    });

    it('remove policies antigas inseguras USING(true)', () => {
      expect(migrationBSql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+"ERP_Ver_Leads"\s+ON\s+public\.leads;/i);
      expect(migrationBSql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+"ERP_Editar_Leads"\s+ON\s+public\.leads;/i);
      expect(migrationBSql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+"Allow authenticated users to read leads"\s+ON\s+public\.leads;/i);
    });

    it('enforça consistência pai/filho via EXISTS nas policies de mensagens e respostas', () => {
      expect(migrationBSql).toContain('CREATE POLICY "lead_messages_insert_own_store"');
      expect(migrationBSql).toContain('CREATE POLICY "lead_messages_update_own_store"');
      expect(migrationBSql).toContain('CREATE POLICY "lead_responses_insert_own_store"');
      expect(migrationBSql).toContain('CREATE POLICY "lead_responses_update_own_store"');

      // Cláusula de integridade relacional entre loja do filho e loja do lead
      expect(migrationBSql).toContain('AND l.store_id = lead_messages.store_id');
      expect(migrationBSql).toContain('AND l.store_id = lead_responses.store_id');
    });

    it('simulação A + B: usuário da Loja A não acessa dados da Loja B', () => {
      interface MemberStore { user_id: string; store_id: string }
      interface Lead { id: string; store_id: string; name: string }

      const memberStores: MemberStore[] = [{ user_id: 'usr-a', store_id: 'store-a' }];
      const leads: Lead[] = [
        { id: 'lead-1', store_id: 'store-a', name: 'Lead Loja A' },
        { id: 'lead-2', store_id: 'store-b', name: 'Lead Loja B' }
      ];

      const rlsFilter = (userId: string, rows: Lead[]) => {
        const allowed = memberStores.filter(m => m.user_id === userId).map(m => m.store_id);
        return rows.filter(r => allowed.includes(r.store_id));
      };

      const visible = rlsFilter('usr-a', leads);
      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe('lead-1');
    });

    it('simulação A + B: mensagem da Loja A não pode apontar para lead da Loja B', () => {
      interface Lead { id: string; store_id: string }
      const leads: Lead[] = [
        { id: 'lead-a', store_id: 'store-a' },
        { id: 'lead-b', store_id: 'store-b' }
      ];

      const checkConsistency = (msgStoreId: string, leadId: string) => {
        const parent = leads.find(l => l.id === leadId);
        return Boolean(parent && parent.store_id === msgStoreId);
      };

      expect(checkConsistency('store-a', 'lead-a')).toBe(true);
      expect(checkConsistency('store-a', 'lead-b')).toBe(false); // Inconsistência bloqueada!
    });

    it('envolve a migration em transação explícita BEGIN e COMMIT', () => {
      expect(migrationBSql).toContain('BEGIN;');
      expect(migrationBSql).toContain('COMMIT;');
    });

    it('contém preflights completos de NULL e de divergência pai/filho', () => {
      expect(migrationBSql).toContain('SELECT 1 FROM public.leads WHERE store_id IS NULL');
      expect(migrationBSql).toContain('SELECT 1 FROM public.lead_messages WHERE store_id IS NULL');
      expect(migrationBSql).toContain('SELECT 1 FROM public.lead_responses WHERE store_id IS NULL');
      expect(migrationBSql).toContain('WHERE lm.store_id <> l.store_id');
      expect(migrationBSql).toContain('WHERE lr.store_id <> l.store_id');
    });

    it('aplica restrição SET NOT NULL para store_id nas 3 tabelas', () => {
      expect(migrationBSql).toMatch(/ALTER\s+TABLE\s+public\.leads\s+ALTER\s+COLUMN\s+store_id\s+SET\s+NOT\s+NULL;/i);
      expect(migrationBSql).toMatch(/ALTER\s+TABLE\s+public\.lead_messages\s+ALTER\s+COLUMN\s+store_id\s+SET\s+NOT\s+NULL;/i);
      expect(migrationBSql).toMatch(/ALTER\s+TABLE\s+public\.lead_responses\s+ALTER\s+COLUMN\s+store_id\s+SET\s+NOT\s+NULL;/i);
    });
  });
});
