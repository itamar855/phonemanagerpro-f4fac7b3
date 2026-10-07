import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Validação de variáveis de ambiente ──────────────────────
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    '❌ [CellManagerPro] Variáveis de ambiente do Supabase não configuradas!\n' +
    '   Verifique se VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY estão definidas no .env\n' +
    '   Variáveis encontradas:\n' +
    `   - VITE_SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌ FALTANDO'}\n` +
    `   - VITE_SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_PUBLISHABLE_KEY ? '✅' : '❌ FALTANDO'}`
  );
}

/**
 * Deriva de forma segura o project ref a partir da URL do Supabase.
 * Nunca deriva o ref da API key e não decodifica JWT.
 */
export function getProjectRefFromUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname;
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

/**
 * Valida defensivamente o formato da publishable API key do Supabase.
 * Aceita o padrão moderno ('sb_publishable_...') e mantém compatibilidade
 * transitória com JWT anon legado ('eyJ...').
 * Nunca exibe o valor da chave em logs ou mensagens de erro.
 */
export function isValidPublishableKeyFormat(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_publishable_')) return true;
  if (trimmed.startsWith('eyJ') && trimmed.split('.').length === 3) return true;
  return false;
}

// Validação segura da URL
if (SUPABASE_URL) {
  const projectRef = getProjectRefFromUrl(SUPABASE_URL);
  if (!projectRef || !SUPABASE_URL.includes('.supabase.co')) {
    console.warn(
      '⚠️ [CellManagerPro] VITE_SUPABASE_URL não parece ser uma URL Supabase válida.'
    );
  }
}

// Validação do formato da API key (sem decodificação de JWT e sem expor a chave)
if (SUPABASE_PUBLISHABLE_KEY && !isValidPublishableKeyFormat(SUPABASE_PUBLISHABLE_KEY)) {
  console.warn(
    '⚠️ [CellManagerPro] VITE_SUPABASE_PUBLISHABLE_KEY não possui um formato reconhecido (esperado: sb_publishable_... ou JWT legado transitório).'
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});

