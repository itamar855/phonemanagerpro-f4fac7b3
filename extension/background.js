// CellManager CRM Extension (v10.0) — Centralized Background Service Worker (MV3)
// Gerencia autenticação real Supabase, rotação de refresh token com mutex single-flight,
// seleção de multi-loja e proxy autenticado para content scripts.

const CONFIG = {
  supabaseUrl: "https://hzrqtolfbwnmmeliazmh.supabase.co",
  supabasePublishableKey: "sb_publishable_q1FPRdUrknXLi7966SRljg_c1YWE0fS"
};

// Mutex para impedir múltiplos refreshes concorrentes (Single-Flight)
let refreshPromise = null;

/**
 * Retorna a sessão armazenada em chrome.storage.local
 */
async function getStoredSession() {
  const data = await chrome.storage.local.get(['session', 'activeStoreId', 'activeStoreName', 'availableStores']);
  return data;
}

/**
 * Garante uma sessão válida, realizando refresh com rotação e mutex single-flight se necessário.
 * Retorna null se não houver sessão ou se a sessão for inválida.
 */
async function ensureValidSession() {
  const { session } = await getStoredSession();
  if (!session || !session.access_token || !session.refresh_token) {
    return null;
  }

  // Margem de segurança: 60 segundos antes de expirar
  const now = Date.now();
  const expiresAt = session.expires_at || 0;
  const isExpiringSoon = now >= (expiresAt - 60000);

  if (!isExpiringSoon) {
    return session.access_token;
  }

  // Mutex Single-Flight: se já houver um refresh em andamento, aguardar a mesma Promise
  if (refreshPromise) {
    try {
      const refreshedSession = await refreshPromise;
      return refreshedSession ? refreshedSession.access_token : null;
    } catch {
      return null;
    }
  }

  // Inicia o refresh controlado
  refreshPromise = (async () => {
    try {
      console.log("[Background] Renovando access_token via refresh_token com rotação...");
      const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.supabasePublishableKey
        },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });

      if (!res.ok) {
        console.warn("[Background] Falha ao renovar token. Limpando sessão local...");
        await clearLocalSession();
        return null;
      }

      const data = await res.json();
      const newSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token, // Rotação: novo refresh_token
        expires_at: Date.now() + (data.expires_in * 1000),
        user_id: data.user?.id || session.user_id,
        email: data.user?.email || session.email
      };

      await chrome.storage.local.set({ session: newSession });
      console.log("[Background] Sessão renovada e rotacionada com sucesso.");
      return newSession;
    } catch (err) {
      console.error("[Background] Erro de rede ao renovar token:", err);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  const result = await refreshPromise;
  return result ? result.access_token : null;
}

/**
 * Consulta member_stores para o usuário autenticado e aplica a regra de multi-loja:
 * - 0 lojas: erro/bloqueio
 * - 1 loja: auto-seleção
 * - >1 loja: exige escolha explícita
 */
async function resolveUserStores(accessToken, userId) {
  try {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/member_stores?select=store_id,stores(id,name)&user_id=eq.${userId}`,
      {
        headers: {
          "apikey": CONFIG.supabasePublishableKey,
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erro ao consultar lojas do operador (${res.status})`);
    }

    const rows = await res.json();
    const stores = rows
      .map(r => r.stores)
      .filter(s => Boolean(s && s.id));

    if (stores.length === 0) {
      return { stores: [], activeStore: null, error: "Operador não está vinculado a nenhuma loja no sistema." };
    }

    if (stores.length === 1) {
      return { stores, activeStore: stores[0], error: null };
    }

    // Múltiplas lojas: não escolhe arbitrariamente
    return { stores, activeStore: null, error: null };
  } catch (err) {
    return { stores: [], activeStore: null, error: err.message };
  }
}

/**
 * Limpa armazenamento local da sessão e status
 */
async function clearLocalSession() {
  await chrome.storage.local.remove([
    'session',
    'activeStoreId',
    'activeStoreName',
    'availableStores',
    'activeLeadId',
    'activeLeadName',
    'queueCount'
  ]);
  await chrome.storage.local.set({
    automationStatus: "Desconectado. Faça login no popup do CellManager."
  });
}

/**
 * Realiza logout remoto no Supabase e limpeza local independente de falha de rede
 */
async function handleLogout() {
  const { session } = await getStoredSession();
  if (session && session.access_token) {
    try {
      await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.supabasePublishableKey,
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      console.log("[Background] Logout remoto concluído no Supabase.");
    } catch (e) {
      console.warn("[Background] Erro no logout remoto (ignorado para garantir limpeza local):", e);
    }
  }
  await clearLocalSession();
  return { success: true };
}

/**
 * Listener central de mensagens do Popup e Content Script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message || {};

  // 1. LOGIN (Popup)
  if (action === "LOGIN") {
    (async () => {
      try {
        const { email, password } = payload || {};
        if (!email || !password) {
          sendResponse({ success: false, error: "Email e senha são obrigatórios." });
          return;
        }

        const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": CONFIG.supabasePublishableKey
          },
          body: JSON.stringify({ email: email.trim(), password })
        });

        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.error_description || data.msg || data.message || "Credenciais inválidas." });
          return;
        }

        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in * 1000),
          user_id: data.user.id,
          email: data.user.email
        };

        // Consulta permissões de loja do operador usando o token real
        const { stores, activeStore, error: storeErr } = await resolveUserStores(session.access_token, session.user_id);

        if (storeErr || stores.length === 0) {
          await clearLocalSession();
          sendResponse({ success: false, error: storeErr || "Usuário não possui acesso a nenhuma loja." });
          return;
        }

        await chrome.storage.local.set({
          session,
          availableStores: stores,
          activeStoreId: activeStore ? activeStore.id : null,
          activeStoreName: activeStore ? activeStore.name : null,
          automationStatus: activeStore ? "Pronto" : "Selecione a loja ativa no popup"
        });

        sendResponse({
          success: true,
          user: session,
          availableStores: stores,
          activeStoreId: activeStore ? activeStore.id : null,
          activeStoreName: activeStore ? activeStore.name : null
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Erro inesperado durante o login." });
      }
    })();
    return true; // resposta assíncrona
  }

  // 2. SELEÇÃO DE LOJA (Popup)
  if (action === "SELECT_STORE") {
    (async () => {
      try {
        const { storeId } = payload || {};
        const { availableStores } = await getStoredSession();
        const selected = (availableStores || []).find(s => s.id === storeId);

        if (!selected) {
          sendResponse({ success: false, error: "Loja selecionada não é válida para este operador." });
          return;
        }

        await chrome.storage.local.set({
          activeStoreId: selected.id,
          activeStoreName: selected.name,
          automationStatus: "Pronto"
        });

        sendResponse({ success: true, activeStoreId: selected.id, activeStoreName: selected.name });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // 3. LOGOUT (Popup)
  if (action === "LOGOUT") {
    (async () => {
      const res = await handleLogout();
      sendResponse(res);
    })();
    return true;
  }

  // 4. CONSULTA DE ESTADO (Popup / Content Script)
  if (action === "GET_STATE") {
    (async () => {
      const { session, activeStoreId, activeStoreName, availableStores } = await getStoredSession();
      const validToken = session ? await ensureValidSession() : null;

      sendResponse({
        isAuthenticated: Boolean(validToken),
        userEmail: session?.email || null,
        activeStoreId: activeStoreId || null,
        activeStoreName: activeStoreName || null,
        availableStores: availableStores || []
      });
    })();
    return true;
  }

  // 5. PROXY AUTENTICADO DE API (Content Script)
  // Permite que content.js faça requisições REST sem lidar diretamente com tokens
  if (action === "API_REQUEST") {
    (async () => {
      try {
        const validToken = await ensureValidSession();
        if (!validToken) {
          sendResponse({ success: false, error: "UNAUTHENTICATED", message: "Sessão expirada ou não autenticada." });
          return;
        }

        const { activeStoreId } = await getStoredSession();
        if (!activeStoreId) {
          sendResponse({ success: false, error: "NO_ACTIVE_STORE", message: "Nenhuma loja selecionada." });
          return;
        }

        const { path, method = "GET", body = null, prefer = null } = payload || {};
        const headers = {
          "Content-Type": "application/json",
          "apikey": CONFIG.supabasePublishableKey,
          "Authorization": `Bearer ${validToken}`
        };
        if (prefer) {
          headers["Prefer"] = prefer;
        }

        const url = path.startsWith("http") ? path : `${CONFIG.supabaseUrl}${path}`;
        const fetchOptions = { method, headers };
        if (body && method !== "GET" && method !== "HEAD") {
          fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          sendResponse({ success: false, status: res.status, error: data?.message || `HTTP ${res.status}` });
          return;
        }

        sendResponse({ success: true, status: res.status, data, activeStoreId });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});
