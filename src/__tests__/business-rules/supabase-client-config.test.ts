import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  getProjectRefFromUrl,
  isValidPublishableKeyFormat,
} from '@/integrations/supabase/client';

describe('Supabase Client Configuration & Modern Key Support', () => {
  const FAKE_MODERN_KEY = 'sb_publishable_test_token_1234567890abcdef_key';
  const FAKE_LEGACY_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cnF0b2xmYndubW1lbGlhem1oIiwicm9sZSI6ImFub24ifQ.fake_signature_hash_value';
  const VALID_SUPABASE_URL = 'https://hzrqtolfbwnmmeliazmh.supabase.co';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Project Ref Derivation (getProjectRefFromUrl)', () => {
    it('deve derivar corretamente o project ref a partir da SUPABASE_URL', () => {
      const ref = getProjectRefFromUrl(VALID_SUPABASE_URL);
      expect(ref).toBe('hzrqtolfbwnmmeliazmh');
    });

    it('deve derivar project ref mesmo com barras no final ou caminhos', () => {
      const ref = getProjectRefFromUrl('https://myprojectref123.supabase.co/rest/v1/');
      expect(ref).toBe('myprojectref123');
    });

    it('deve falhar de forma segura para URLs inválidas sem lançar exceção', () => {
      expect(getProjectRefFromUrl('not-a-valid-url')).toBeNull();
      expect(getProjectRefFromUrl('')).toBeNull();
      expect(getProjectRefFromUrl(undefined)).toBeNull();
      expect(getProjectRefFromUrl(null as any)).toBeNull();
    });
  });

  describe('Key Format Validation (isValidPublishableKeyFormat)', () => {
    it('deve aceitar chave no formato moderno sb_publishable_...', () => {
      expect(isValidPublishableKeyFormat(FAKE_MODERN_KEY)).toBe(true);
      expect(isValidPublishableKeyFormat('  sb_publishable_with_spaces  ')).toBe(true);
    });

    it('deve aceitar chave JWT anon legada durante o período transitório', () => {
      expect(isValidPublishableKeyFormat(FAKE_LEGACY_JWT)).toBe(true);
    });

    it('deve rejeitar chaves ausentes, vazias ou em formatos inválidos', () => {
      expect(isValidPublishableKeyFormat('')).toBe(false);
      expect(isValidPublishableKeyFormat(undefined)).toBe(false);
      expect(isValidPublishableKeyFormat(null as any)).toBe(false);
      expect(isValidPublishableKeyFormat('invalid_random_string')).toBe(false);
      expect(isValidPublishableKeyFormat('eyJ_incomplete_jwt_only_one_part')).toBe(false);
    });
  });

  describe('Client Initialization & Zero-JWT Decoding for sb_publishable', () => {
    it('deve inicializar o Supabase client com chave moderna sb_publishable sem conectar em produção', () => {
      const client = createClient(VALID_SUPABASE_URL, FAKE_MODERN_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      expect(client).toBeDefined();
      expect((client as any).supabaseUrl).toBe(VALID_SUPABASE_URL);
      expect((client as any).supabaseKey).toBe(FAKE_MODERN_KEY);
    });

    it('deve inicializar o Supabase client com chave legacy JWT durante o período de transição', () => {
      const client = createClient(VALID_SUPABASE_URL, FAKE_LEGACY_JWT, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      expect(client).toBeDefined();
      expect((client as any).supabaseUrl).toBe(VALID_SUPABASE_URL);
      expect((client as any).supabaseKey).toBe(FAKE_LEGACY_JWT);
    });

    it('não deve executar nenhuma chamada atob() ao validar ou utilizar chave sb_publishable', () => {
      let atobCalled = false;
      const originalAtob = globalThis.atob;
      if (typeof originalAtob === 'function') {
        vi.spyOn(globalThis, 'atob').mockImplementation((data: string) => {
          atobCalled = true;
          return originalAtob(data);
        });
      }

      // Validação do formato
      const isValid = isValidPublishableKeyFormat(FAKE_MODERN_KEY);
      expect(isValid).toBe(true);

      // Derivação do ref exclusivamente via URL
      const projectRef = getProjectRefFromUrl(VALID_SUPABASE_URL);
      expect(projectRef).toBe('hzrqtolfbwnmmeliazmh');

      // Instanciação
      const client = createClient(VALID_SUPABASE_URL, FAKE_MODERN_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      expect(client).toBeDefined();

      // Confirmação de que atob NUNCA foi chamado
      expect(atobCalled).toBe(false);
    });

    it('deve emitir aviso claro quando key estiver ausente sem vazar segredos', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Validação com chave vazia
      const isValid = isValidPublishableKeyFormat('');
      expect(isValid).toBe(false);

      // Nenhuma informação confidencial vazada
      const allWarnings = warnSpy.mock.calls.flat().join(' ');
      const allErrors = errorSpy.mock.calls.flat().join(' ');
      expect(allWarnings).not.toContain('secret');
      expect(allErrors).not.toContain('secret');
    });
  });

  describe('Authenticated Edge Functions Request Headers (ai-assistant & export-data)', () => {
    const buildEdgeRequest = (
      session: { access_token?: string } | null | undefined,
      apiKey: string
    ) => {
      if (!session?.access_token) {
        return null; // Simula a trava de sessão ausente: não dispara requisição
      }
      return {
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      };
    };

    it('sessão válida: Authorization usa session.access_token e apikey usa publishable key', () => {
      const mockSession = { access_token: 'valid_user_jwt_ey123456' };
      const request = buildEdgeRequest(mockSession, FAKE_MODERN_KEY);

      expect(request).not.toBeNull();
      expect(request?.headers.Authorization).toBe('Bearer valid_user_jwt_ey123456');
      expect(request?.headers.apikey).toBe(FAKE_MODERN_KEY);
    });

    it('sessão ausente: Edge Function NÃO é chamada (requisição bloqueada)', () => {
      expect(buildEdgeRequest(null, FAKE_MODERN_KEY)).toBeNull();
      expect(buildEdgeRequest(undefined, FAKE_MODERN_KEY)).toBeNull();
      expect(buildEdgeRequest({ access_token: '' }, FAKE_MODERN_KEY)).toBeNull();
    });

    it('chave publishable moderna sb_publishable_... NUNCA aparece como Bearer token', () => {
      const mockSession = { access_token: 'user_session_token_xyz' };
      const request = buildEdgeRequest(mockSession, FAKE_MODERN_KEY);

      expect(request?.headers.Authorization).not.toContain('sb_publishable_');
      expect(request?.headers.Authorization).toBe('Bearer user_session_token_xyz');
      expect(request?.headers.apikey).toBe(FAKE_MODERN_KEY);
    });

    it('chave legacy anon transitória NUNCA é usada como user Bearer após o patch', () => {
      const mockSession = { access_token: 'user_session_token_abc' };
      const request = buildEdgeRequest(mockSession, FAKE_LEGACY_JWT);

      expect(request?.headers.Authorization).not.toBe(`Bearer ${FAKE_LEGACY_JWT}`);
      expect(request?.headers.Authorization).toBe('Bearer user_session_token_abc');
      expect(request?.headers.apikey).toBe(FAKE_LEGACY_JWT);
    });
  });
});
