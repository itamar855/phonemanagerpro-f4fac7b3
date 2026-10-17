// CellManager CRM Extension (v10.0) — Popup Script
// Interface do operador: Login, Seleção de Loja, Monitoramento de Leads e Logout

const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

const userDisplayEmail = document.getElementById('user-display-email');
const storeSelect = document.getElementById('store-select');
const logoutBtn = document.getElementById('logout-btn');

const crmStatus = document.getElementById('crm-status');
const crmStatusText = document.getElementById('crm-status-text');
const activeLeadName = document.getElementById('active-lead-name');
const activeLeadId = document.getElementById('active-lead-id');
const queueCount = document.getElementById('queue-count');
const automationStatus = document.getElementById('automation-status');
const progressFill = document.getElementById('progress-fill');
const openWhatsappBtn = document.getElementById('open-whatsapp');

/**
 * Consulta o estado da sessão e lojas com o background service worker
 */
async function syncState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "GET_STATE" }, (response) => {
      resolve(response || { isAuthenticated: false });
    });
  });
}

/**
 * Atualiza a UI conforme o estado de autenticação e seleção de loja
 */
async function refreshUI() {
  const state = await syncState();

  if (!state.isAuthenticated) {
    // Estado Não Autenticado
    loginSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    crmStatus.classList.add('offline');
    crmStatusText.innerText = "Desconectado";
    return;
  }

  // Estado Autenticado
  loginSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  crmStatus.classList.remove('offline');
  crmStatusText.innerText = "Online";

  userDisplayEmail.innerText = state.userEmail || "Operador";

  // Preenche o seletor de lojas
  const stores = state.availableStores || [];
  storeSelect.innerHTML = '';

  if (stores.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.innerText = 'Nenhuma loja vinculada';
    storeSelect.appendChild(opt);
    storeSelect.disabled = true;
  } else {
    storeSelect.disabled = false;
    for (const store of stores) {
      const opt = document.createElement('option');
      opt.value = store.id;
      opt.innerText = store.name;
      if (store.id === state.activeStoreId) {
        opt.selected = true;
      }
      storeSelect.appendChild(opt);
    }
  }

  // Atualiza métricas locais de lead e fila
  const localData = await chrome.storage.local.get([
    'activeLeadId',
    'activeLeadName',
    'automationStatus',
    'queueCount'
  ]);

  activeLeadName.innerText = localData.activeLeadName || 'Nenhum';
  activeLeadId.innerText = localData.activeLeadId
    ? `ID: ${localData.activeLeadId.slice(0, 8)}...`
    : 'Nenhum lead monitorado';
  queueCount.innerText = localData.queueCount || '0';
  automationStatus.innerText = localData.automationStatus || 'Pronto';

  if (localData.automationStatus && localData.automationStatus.includes('Enviando')) {
    progressFill.style.width = '70%';
  } else if (localData.automationStatus && localData.automationStatus.includes('Busca')) {
    progressFill.style.width = '40%';
  } else {
    progressFill.style.width = '0%';
  }
}

// 1. Submit do Formulário de Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginError.innerText = '';
  loginBtn.disabled = true;
  loginBtn.innerText = 'Entrando...';

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  chrome.runtime.sendMessage(
    { action: "LOGIN", payload: { email, password } },
    (res) => {
      loginBtn.disabled = false;
      loginBtn.innerText = 'Entrar no CellManager';

      if (!res || !res.success) {
        loginError.innerText = res?.error || "Falha na autenticação. Verifique suas credenciais.";
        loginError.classList.remove('hidden');
        return;
      }

      loginPassword.value = '';
      refreshUI();
    }
  );
});

// 2. Troca de Loja Ativa
storeSelect.addEventListener('change', (e) => {
  const storeId = e.target.value;
  if (!storeId) return;

  chrome.runtime.sendMessage(
    { action: "SELECT_STORE", payload: { storeId } },
    (res) => {
      if (res && res.success) {
        refreshUI();
      } else {
        alert(res?.error || "Erro ao trocar de loja.");
      }
    }
  );
});

// 3. Logout do Operador
logoutBtn.addEventListener('click', () => {
  if (!confirm("Deseja desconectar a extensão CellManager deste navegador?")) return;

  chrome.runtime.sendMessage({ action: "LOGOUT" }, () => {
    refreshUI();
  });
});

// 4. Abertura do WhatsApp Web
openWhatsappBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://web.whatsapp.com' });
});

// Inicialização
refreshUI();
setInterval(refreshUI, 2500);
