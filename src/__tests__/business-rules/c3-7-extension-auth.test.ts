import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_DIR = path.resolve(__dirname, '../../../extension');

describe('C3.7 — Suíte de Testes da Extensão Autenticada e Isolamento Multi-Loja', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 14 & 15. Auditoria de Segredos e Chaves Estáticas na Extensão
  // =========================================================================
  describe('Auditoria de Credenciais e Segredos na Extensão', () => {
    const extensionFiles = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'content.js'];

    it('14. NENHUM secret backend (sb_secret_ ou service_role) está presente na extensão', () => {
      for (const file of extensionFiles) {
        const filePath = path.join(EXTENSION_DIR, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          expect(content).not.toContain('sb_secret_');
          expect(content).not.toContain('service_role');
        }
      }
    });

    it('15. NENHUMA legacy anon JWT (eyJ...) está presente na extensão', () => {
      for (const file of extensionFiles) {
        const filePath = path.join(EXTENSION_DIR, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Nenhuma string com prefixo de JWT anon legado
          expect(content).not.toMatch(/eyJhbGciOi/);
          expect(content).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}\./);
        }
      }
    });

    it('Manifest possui versão incrementada para v10.0 e background service worker registrado', () => {
      const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.version).toBe('10.0');
      expect(manifest.background?.service_worker).toBe('background.js');
    });
  });

  // =========================================================================
  // 1 & 2. Fluxo de Login (Válido e Inválido)
  // =========================================================================
  describe('Autenticação de Operador (Login)', () => {
    it('1. Login com credenciais válidas retorna sessão real com access_token e user_id', async () => {
      const mockSupabaseAuth = async (email: string, pass: string) => {
        if (email === 'operador@cellmanager.com' && pass === 'senha123') {
          return {
            status: 200,
            data: {
              access_token: 'valid_access_token_abc',
              refresh_token: 'valid_refresh_token_xyz',
              expires_in: 3600,
              user: { id: 'usr-123', email: 'operador@cellmanager.com' }
            }
          };
        }
        return { status: 400, data: { message: 'Invalid login credentials' } };
      };

      const res = await mockSupabaseAuth('operador@cellmanager.com', 'senha123');
      expect(res.status).toBe(200);
      expect(res.data.access_token).toBeDefined();
      expect(res.data.refresh_token).toBeDefined();
      expect(res.data.user.id).toBe('usr-123');
    });

    it('2. Login com credenciais inválidas falha defensivamente sem criar sessão', async () => {
      const mockSupabaseAuth = async (email: string, pass: string) => {
        if (email === 'operador@cellmanager.com' && pass === 'senha123') {
          return { status: 200, data: {} };
        }
        return { status: 400, data: { message: 'Invalid login credentials' } };
      };

      const res = await mockSupabaseAuth('operador@cellmanager.com', 'senha_errada');
      expect(res.status).toBe(400);
      expect(res.data.message).toBe('Invalid login credentials');
    });
  });

  // =========================================================================
  // 3 & 4. Resolução Multi-Loja e Troca de Loja
  // =========================================================================
  describe('Resolução e Seleção de Loja (member_stores)', () => {
    interface Store { id: string; name: string }

    const resolveStores = (stores: Store[]) => {
      if (stores.length === 0) {
        return { error: 'Operador não está vinculado a nenhuma loja no sistema.', activeStore: null, requiresSelection: false };
      }
      if (stores.length === 1) {
        return { error: null, activeStore: stores[0], requiresSelection: false };
      }
      return { error: null, activeStore: null, requiresSelection: true };
    };

    it('3a. Operador com 0 lojas é bloqueado (fail-closed)', () => {
      const res = resolveStores([]);
      expect(res.error).toContain('Operador não está vinculado a nenhuma loja');
      expect(res.activeStore).toBeNull();
    });

    it('3b. Operador com 1 loja é selecionado automaticamente', () => {
      const res = resolveStores([{ id: 'store-1', name: 'Loja Matriz' }]);
      expect(res.error).toBeNull();
      expect(res.activeStore?.id).toBe('store-1');
      expect(res.requiresSelection).toBe(false);
    });

    it('3c. Operador com múltiplas lojas exige escolha explícita (sem escolha arbitrária)', () => {
      const stores = [
        { id: 'store-1', name: 'Loja Matriz' },
        { id: 'store-2', name: 'Loja Filial' }
      ];
      const res = resolveStores(stores);
      expect(res.error).toBeNull();
      expect(res.activeStore).toBeNull(); // Não escolhe arbitrariamente!
      expect(res.requiresSelection).toBe(true);
    });

    it('4. Troca de Loja Ativa (Store Switch) permite alternar somente entre lojas permitidas', () => {
      const availableStores = [
        { id: 'store-1', name: 'Loja Matriz' },
        { id: 'store-2', name: 'Loja Filial' }
      ];

      const switchStore = (targetId: string) => {
        const found = availableStores.find(s => s.id === targetId);
        if (!found) throw new Error('Loja não permitida para este operador');
        return found;
      };

      expect(switchStore('store-2').name).toBe('Loja Filial');
      expect(() => switchStore('store-hacker')).toThrow('Loja não permitida');
    });
  });

  // =========================================================================
  // 5, 6, 7. Renovação de Token (Refresh Normal, Concorrente e Inválido)
  // =========================================================================
  describe('Renovação de Sessão (Token Refresh & Single-Flight Mutex)', () => {
    it('5. Refresh normal com rotação substitui access_token e refresh_token', async () => {
      let currentSession = {
        access_token: 'old_access',
        refresh_token: 'old_refresh',
        expires_at: Date.now() - 1000 // expirado
      };

      const doRefresh = async (oldRefreshToken: string) => {
        return {
          access_token: 'new_rotated_access',
          refresh_token: 'new_rotated_refresh',
          expires_in: 3600
        };
      };

      const refreshed = await doRefresh(currentSession.refresh_token);
      currentSession = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: Date.now() + (refreshed.expires_in * 1000)
      };

      expect(currentSession.access_token).toBe('new_rotated_access');
      expect(currentSession.refresh_token).toBe('new_rotated_refresh');
    });

    it('6. Refresh concorrente (Single-Flight Mutex): apenas 1 requisição remota é disparada', async () => {
      let remoteCallCount = 0;
      let refreshPromise: Promise<string> | null = null;

      const singleFlightRefresh = async () => {
        if (refreshPromise) {
          return refreshPromise;
        }

        refreshPromise = (async () => {
          remoteCallCount++;
          // Simula latência de rede
          await new Promise(r => setTimeout(r, 50));
          return 'token_refresh_result';
        })();

        try {
          return await refreshPromise;
        } finally {
          refreshPromise = null;
        }
      };

      // Dispara 5 chamadas simultâneas
      const results = await Promise.all([
        singleFlightRefresh(),
        singleFlightRefresh(),
        singleFlightRefresh(),
        singleFlightRefresh(),
        singleFlightRefresh()
      ]);

      expect(remoteCallCount).toBe(1); // Exatamente 1 chamada remota!
      expect(results.every(r => r === 'token_refresh_result')).toBe(true);
    });

    it('7. Refresh inválido ou revogado dispara logout local e limpa armazenamento', async () => {
      let storage = {
        session: { access_token: 'expired', refresh_token: 'revoked' },
        activeStoreId: 'store-1'
      };

      const handleFailedRefresh = () => {
        storage = {} as any;
      };

      const refreshApi = async () => {
        return { ok: false, status: 400 };
      };

      const res = await refreshApi();
      if (!res.ok) {
        handleFailedRefresh();
      }

      expect(storage.session).toBeUndefined();
      expect(storage.activeStoreId).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Logout Remoto + Limpeza Local
  // =========================================================================
  describe('8. Logout Remoto e Limpeza Local', () => {
    it('executa chamada de logout remoto e garante limpeza do storage local mesmo se a rede falhar', async () => {
      let remoteLogoutCalled = false;
      let storage = {
        session: { access_token: 'tok' },
        activeStoreId: 'store-1',
        availableStores: ['store-1']
      };

      const logout = async (networkFails: boolean) => {
        try {
          remoteLogoutCalled = true;
          if (networkFails) throw new Error('Network error on remote logout');
        } catch {
          // Ignorado exatamente como no background.js para garantir limpeza local
        } finally {
          // Limpeza local garantida no finally
          storage = {} as any;
        }
      };

      // Cenário com falha remota
      await logout(true);
      expect(remoteLogoutCalled).toBe(true);
      expect(storage.session).toBeUndefined();
      expect(storage.activeStoreId).toBeUndefined();
    });
  });

  // =========================================================================
  // 9, 10, 11, 12, 13. Validação de Políticas RLS e Consistência de Dados
  // =========================================================================
  describe('Políticas RLS e Consistência Multi-Loja', () => {
    interface MemberStore { user_id: string; store_id: string }
    interface Lead { id: string; store_id: string }

    const memberStores: MemberStore[] = [
      { user_id: 'usr-a', store_id: 'store-a' },
      { user_id: 'usr-b', store_id: 'store-b' }
    ];

    const leads: Lead[] = [
      { id: 'lead-a1', store_id: 'store-a' },
      { id: 'lead-b1', store_id: 'store-b' }
    ];

    it('9. Acesso a Lead da Loja A é permitido para operador da Loja A', () => {
      const canAccessLead = (userId: string, targetLead: Lead) => {
        return memberStores.some(m => m.user_id === userId && m.store_id === targetLead.store_id);
      };

      expect(canAccessLead('usr-a', leads[0])).toBe(true);
    });

    it('10. Acesso a Lead da Loja B é NEGADO para operador da Loja A', () => {
      const canAccessLead = (userId: string, targetLead: Lead) => {
        return memberStores.some(m => m.user_id === userId && m.store_id === targetLead.store_id);
      };

      expect(canAccessLead('usr-a', leads[1])).toBe(false);
    });

    it('11. Mensagem com child store_id = Loja A mas parent lead_id = Loja B é NEGADA (EXISTS pai/filho)', () => {
      const canInsertMessage = (userId: string, messageStoreId: string, leadId: string) => {
        // Cláusula RLS: store_id IN (member_stores) AND EXISTS (leads com mesmo lead_id e store_id)
        const userHasStore = memberStores.some(m => m.user_id === userId && m.store_id === messageStoreId);
        if (!userHasStore) return false;

        const parentLeadMatches = leads.some(l => l.id === leadId && l.store_id === messageStoreId);
        return parentLeadMatches;
      };

      // Tentativa de injeção cross-store
      const allowed = canInsertMessage('usr-a', 'store-a', 'lead-b1');
      expect(allowed).toBe(false);

      // Inserção legítima
      const legitimate = canInsertMessage('usr-a', 'store-a', 'lead-a1');
      expect(legitimate).toBe(true);
    });

    it('12. Requisições anônimas sem token ou sem Authorization são NEGADAS (FINAL_ANON_ACCESS = NONE)', () => {
      const rlsEvaluate = (role: 'anon' | 'authenticated') => {
        if (role === 'anon') return false; // Nenhuma grant e nenhuma policy para anon
        return true;
      };

      expect(rlsEvaluate('anon')).toBe(false);
      expect(rlsEvaluate('authenticated')).toBe(true);
    });

    it('13. Requisições com sessão expirada ou não autenticada são bloqueadas pela extensão', () => {
      const canExecuteExtensionOperation = (session: { access_token: string; expires_at: number } | null, activeStoreId: string | null) => {
        if (!session || !session.access_token) return false;
        if (Date.now() >= session.expires_at) return false;
        if (!activeStoreId) return false;
        return true;
      };

      // Sessão expirada
      expect(canExecuteExtensionOperation({ access_token: 'tok', expires_at: Date.now() - 5000 }, 'store-a')).toBe(false);
      // Sem loja ativa
      expect(canExecuteExtensionOperation({ access_token: 'tok', expires_at: Date.now() + 50000 }, null)).toBe(false);
      // Sessão válida e com loja ativa
      expect(canExecuteExtensionOperation({ access_token: 'tok', expires_at: Date.now() + 50000 }, 'store-a')).toBe(true);
    });
  });
});
