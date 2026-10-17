// CellManager CRM Extension (v10.0) — Content Script (WhatsApp & Instagram Web)
// Opera exclusivamente através do background service worker via mensagens autenticadas.
// Zero chaves hardcoded. Requer sessão válida e activeStoreId definido no popup.

console.log("%c CRM: Extension v10.0 Authenticated Loaded ", "background: #128C7E; color: white; font-weight: bold;");

let activeLead = { id: null, name: "" };
let lastSyncedText = "";
let isWorking = false;
let lastAttemptedLeadId = null;
let retryCount = 0;

/**
 * Atualiza o status local para o popup
 */
function setStatus(msg) {
  console.log(`CRM: ${msg}`);
  chrome.storage.local.set({ automationStatus: msg });
}

/**
 * Consulta o estado atual da extensão com o background service worker
 */
function getAppState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "GET_STATE" }, (response) => {
      resolve(response || { isAuthenticated: false, activeStoreId: null });
    });
  });
}

/**
 * Executa uma chamada autenticada ao Supabase através do Background Service Worker
 */
function callApi(options) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "API_REQUEST", payload: options }, (res) => {
      resolve(res || { success: false, error: "EXTENSION_OFFLINE" });
    });
  });
}

/**
 * Inicialização e verificação de sessão/loja
 */
async function initSession() {
  const stored = await chrome.storage.local.get(['activeLeadId', 'activeLeadName']);
  if (stored.activeLeadId) {
    activeLead.id = stored.activeLeadId;
    activeLead.name = stored.activeLeadName;
  }

  const state = await getAppState();
  if (!state.isAuthenticated || !state.activeStoreId) {
    setStatus("Aguardando login no popup do CellManager...");
  } else {
    setStatus(`Conectado: ${state.activeStoreName || 'Loja Ativa'}`);
  }

  startResponsePolling();
  setInterval(findTarget, 2000);
}

/**
 * Injeta o botão de captura no cabeçalho do chat
 */
async function findTarget() {
  const state = await getAppState();
  if (!state.isAuthenticated || !state.activeStoreId) {
    return; // Não opera sem autenticação e loja ativa
  }

  const waHeader = document.querySelector("#main header");
  if (waHeader && !waHeader.querySelector(".crm-capture-btn")) {
    const btn = document.createElement("button");
    btn.className = "crm-capture-btn";
    btn.style.cssText = "background: #128C7E; color: white; border: none; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 11px; font-weight: bold; margin: 5px 10px;";
    btn.innerText = "Enviar p/ CRM";
    btn.onclick = (e) => {
      e.preventDefault();
      captureLeadWhatsApp(waHeader);
    };
    (waHeader.querySelector('div[role="button"]') || waHeader).appendChild(btn);
  }

  if (waHeader) {
    setupAutoSyncWhatsApp();
  }
}

/**
 * Captura dados do chat aberto e envia para o CRM
 */
async function captureLeadWhatsApp(header) {
  const state = await getAppState();
  if (!state.isAuthenticated || !state.activeStoreId) {
    alert("Por favor, faça login e selecione uma loja no popup do CellManager antes de capturar leads.");
    return;
  }

  const rawName = (header.querySelector('span[title]') || header.querySelector('span[dir="auto"]') || header.querySelector('span'))?.innerText.trim() || "Lead WhatsApp";
  const name = sanitizeName(rawName);
  const phone = getWAContactId();
  const messages = extractMessagesWhatsApp();

  await sendToERP({
    name,
    phone,
    source: "whatsapp",
    notes: "Sincronizado via WhatsApp Web",
    store_id: state.activeStoreId
  }, messages);
}

function getWAContactId() {
  const anyMsg = document.querySelector('[data-id*="@c.us"]');
  const dataId = anyMsg?.getAttribute('data-id') || "";
  const match = dataId.match(/(\d{10,})@/);
  return match ? match[1] : "";
}

function sanitizeName(name) {
  if (!name) return "";
  return name.replace(/[^\x20-\x7E]/g, "").trim();
}

function extractMessagesWhatsApp() {
  const msgEls = document.querySelectorAll('.message-in, .message-out');
  return Array.from(msgEls).slice(-25).map(el => {
    const content = (el.querySelector('.copyable-text span')?.innerText || el.innerText).trim();
    return {
      content,
      sender_type: el.classList.contains('message-out') ? 'me' : 'lead',
      created_at: new Date().toISOString()
    };
  });
}

/**
 * Envia Lead e mensagens ao CRM com store_id obrigatório
 */
async function sendToERP(leadData, messages = []) {
  try {
    const state = await getAppState();
    if (!state.isAuthenticated || !state.activeStoreId) return;

    // Filtra busca de lead existente pela loja ativa
    const queryPath = leadData.phone
      ? `/rest/v1/leads?store_id=eq.${state.activeStoreId}&or=(name.ilike.${encodeURIComponent('%' + leadData.name + '%')},phone.eq.${leadData.phone})&select=id`
      : `/rest/v1/leads?store_id=eq.${state.activeStoreId}&name=ilike.${encodeURIComponent('%' + leadData.name + '%')}&select=id`;

    const searchRes = await callApi({ path: queryPath, method: "GET" });
    const existing = Array.isArray(searchRes.data) ? searchRes.data : [];

    let saved;
    if (existing.length > 0) {
      const updRes = await callApi({
        path: `/rest/v1/leads?id=eq.${existing[0].id}&store_id=eq.${state.activeStoreId}`,
        method: "PATCH",
        prefer: "return=representation",
        body: leadData
      });
      saved = Array.isArray(updRes.data) ? updRes.data[0] : null;
    } else {
      const creRes = await callApi({
        path: `/rest/v1/leads`,
        method: "POST",
        prefer: "return=representation",
        body: leadData
      });
      saved = Array.isArray(creRes.data) ? creRes.data[0] : null;
    }

    if (saved && saved.id) {
      activeLead = { id: saved.id, name: leadData.name };
      chrome.storage.local.set({ activeLeadId: saved.id, activeLeadName: leadData.name });
      setStatus(`Lead "${leadData.name}" sincronizado!`);

      // Envia histórico recente de mensagens se houver
      for (const msg of messages) {
        if (!msg.content) continue;
        await callApi({
          path: `/rest/v1/lead_messages`,
          method: "POST",
          body: {
            lead_id: saved.id,
            store_id: state.activeStoreId,
            content: msg.content,
            sender_type: msg.sender_type,
            created_at: msg.created_at
          }
        });
      }
    }
  } catch (err) {
    console.error("CRM sendToERP Error:", err);
  }
}

/**
 * Observa novos balões de conversa no chat aberto
 */
function setupAutoSyncWhatsApp() {
  const main = document.querySelector('#main');
  if (!main || main.dataset.crmObserved) return;
  main.dataset.crmObserved = "true";

  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList.contains('message-in') || node.classList.contains('message-out')) {
            syncSingle(node);
          } else {
            node.querySelectorAll('.message-in, .message-out').forEach(c => syncSingle(c));
          }
        }
      }
    }
  }).observe(main, { childList: true, subtree: true });
}

/**
 * Sincroniza uma única mensagem em tempo real
 */
async function syncSingle(el) {
  if (!activeLead.id) return;
  const state = await getAppState();
  if (!state.isAuthenticated || !state.activeStoreId) return;

  const content = (el.querySelector('.copyable-text span') || el.querySelector('span[dir="ltr"]') || el).innerText.trim();
  const senderType = el.classList.contains('message-out') ? 'me' : 'lead';
  if (!content || content === lastSyncedText) return;
  lastSyncedText = content;

  await callApi({
    path: `/rest/v1/lead_messages`,
    method: "POST",
    body: {
      lead_id: activeLead.id,
      store_id: state.activeStoreId,
      content,
      sender_type: senderType,
      created_at: new Date().toISOString()
    }
  });

  if (senderType === 'lead') {
    await updateLeadStatus(activeLead.id, { has_unread: true }, state.activeStoreId);
  }
}

async function updateLeadStatus(id, data, storeId) {
  await callApi({
    path: `/rest/v1/leads?id=eq.${id}&store_id=eq.${storeId}`,
    method: "PATCH",
    body: data
  });
}

/**
 * Polling periódico de respostas pendentes para disparo automático via WhatsApp Web
 */
function startResponsePolling() {
  setInterval(async () => {
    if (isWorking) return;

    try {
      const state = await getAppState();
      if (!state.isAuthenticated || !state.activeStoreId) {
        return; // Pausado se desconectado ou sem loja ativa
      }

      const res = await callApi({
        path: `/rest/v1/lead_responses?status=eq.pending&store_id=eq.${state.activeStoreId}&order=created_at.asc`,
        method: "GET"
      });

      const pending = Array.isArray(res.data) ? res.data : [];
      chrome.storage.local.set({ queueCount: pending.length });

      if (pending.length > 0) {
        const msg = pending[0];

        // Anti-infinity: Se já tentou muitas vezes este lead, pausa temporariamente
        if (msg.lead_id === lastAttemptedLeadId && retryCount > 5) {
          setStatus("Pausando busca por lead problemático...");
          setTimeout(() => { retryCount = 0; lastAttemptedLeadId = null; }, 10000);
          return;
        }

        const leadRes = await callApi({
          path: `/rest/v1/leads?id=eq.${msg.lead_id}&store_id=eq.${state.activeStoreId}&select=name,phone`,
          method: "GET"
        });

        const leadInfo = Array.isArray(leadRes.data) && leadRes.data.length > 0 ? leadRes.data[0] : null;
        if (!leadInfo) return;

        if (await checkIfLeadIsOpenStrict(msg.lead_id, leadInfo.name, leadInfo.phone)) {
          isWorking = true;
          setStatus("Enviando...");
          if (await injectAndSendWhatsApp(msg.content)) {
            await markAsSent(msg.id, state.activeStoreId);
            await updateLeadStatus(msg.lead_id, { has_unread: false }, state.activeStoreId);
            setStatus("Mensagem Enviada!");
            lastAttemptedLeadId = null;
            retryCount = 0;
          }
          isWorking = false;
        } else {
          if (await robustSwitch(leadInfo)) {
            isWorking = true;
            setStatus("Enviando...");
            if (await injectAndSendWhatsApp(msg.content)) {
              await markAsSent(msg.id, state.activeStoreId);
              await updateLeadStatus(msg.lead_id, { has_unread: false }, state.activeStoreId);
              setStatus("Mensagem Enviada!");
              lastAttemptedLeadId = null;
              retryCount = 0;
            }
            isWorking = false;
          }
        }
      }
    } catch (e) {
      if (e.message && e.message.includes("context invalidated")) return;
      console.error("CRM Polling Error:", e);
    }
  }, 4500);
}

async function checkIfLeadIsOpenStrict(id, name, phone) {
  const header = document.querySelector("#main header");
  if (!header) return false;
  const current = (header.querySelector('span[title]') || header.querySelector('span[dir="auto"]'))?.innerText.trim();
  if (!current) return false;

  const cleanCurrent = sanitizeName(current).toLowerCase();
  const cleanTarget = sanitizeName(name).toLowerCase();

  const p1 = current.replace(/\D/g, '');
  const p2 = phone ? phone.replace(/\D/g, '') : '';

  if (cleanCurrent === cleanTarget || cleanCurrent.includes(cleanTarget) || cleanTarget.includes(cleanCurrent)) return true;
  if (p1.length >= 8 && p2.length >= 8 && (p1.includes(p2) || p2.includes(p1))) return true;

  if (activeLead && activeLead.id === id) return true;
  return false;
}

async function markAsSent(id, storeId) {
  await callApi({
    path: `/rest/v1/lead_responses?id=eq.${id}&store_id=eq.${storeId}`,
    method: "PATCH",
    body: { status: 'sent', sent_at: new Date().toISOString() }
  });
}

async function robustSwitch(lead) {
  if (isWorking) return;
  isWorking = true;
  lastAttemptedLeadId = lead.id;
  retryCount++;

  try {
    const query = lead.phone || lead.name;
    setStatus(`Buscando: ${query} (Tentativa ${retryCount})`);

    const searchIcon = document.querySelector('span[data-icon="search"]') ||
                       document.querySelector('span[data-icon="chat"]');
    if (searchIcon) {
      let clickable = searchIcon.closest('button, [role="button"]') || searchIcon.parentElement;
      if (clickable) {
        clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        clickable.click();
      }
    }

    await new Promise(r => setTimeout(r, 800));

    const footer = document.querySelector('#main footer, footer.x1nqdnnd');
    const allCandidates = Array.from(document.querySelectorAll('[contenteditable="true"], [role="textbox"], input, [data-lexical-editor="true"]'));
    const validInputs = allCandidates.filter(el => !footer || !footer.contains(el));

    let foundAndTyped = false;
    for (let el of validInputs) {
      if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.getBoundingClientRect().width) continue;
      try {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, query);
        el.dispatchEvent(new Event('input', { bubbles: true }));

        if ((el.textContent && el.textContent.includes(query)) || (el.value && el.value.includes(query))) {
          foundAndTyped = true;
          break;
        }
      } catch (e) {}
    }

    if (foundAndTyped) {
      await new Promise(r => setTimeout(r, 1000));

      for (let el of validInputs) {
        if ((el.textContent && el.textContent.includes(query)) || (el.value && el.value.includes(query))) {
          ['keydown', 'keypress', 'keyup'].forEach(type => {
            el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          });
          break;
        }
      }

      await new Promise(r => setTimeout(r, 2000));

      if (document.querySelector('#main header')) {
        setStatus("Chat aberto via Enter!");
        return true;
      }

      const sidebar = document.querySelector('#pane-side') || document.querySelector('[aria-label="Lista de chats"]');
      if (sidebar) {
        const resultSelectors = ['[role="row"]', '[role="listitem"]', '._ak8l', '._ak8o', 'div[data-testid="list-item-search"]'];
        let rows = [];
        for (const sel of resultSelectors) {
          const found = Array.from(sidebar.querySelectorAll(sel)).filter(el => el.offsetHeight > 10);
          if (found.length > 0) { rows = found; break; }
        }

        if (rows.length > 0) {
          const target = rows[0].querySelector('[role="button"]') || rows[0];
          ['mousedown', 'mouseup', 'click'].forEach(type => {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          });
          target.click();

          setStatus("Chat localizado via Sniper Click!");
          activeLead = { id: lead.id, name: lead.name };
          chrome.storage.local.set({ activeLeadId: lead.id, activeLeadName: lead.name });
          await new Promise(r => setTimeout(r, 2000));
          if (document.querySelector('#main')) return true;
        }
      }
    } else {
      setStatus("Barra de busca não encontrada.");
    }
  } catch (e) {
    console.error(e);
  }

  isWorking = false;
  return false;
}

async function injectAndSendWhatsApp(text) {
  const footer = document.querySelector('#main footer, footer.x1nqdnnd');
  if (!footer) return false;

  let input = null;
  for (let i = 0; i < 5; i++) {
    input = footer.querySelector('[contenteditable="true"], [role="textbox"], [data-lexical-editor="true"]');
    if (input) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!input) {
    setStatus("Erro: Campo de texto não encontrado");
    return false;
  }

  input.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));

  await new Promise(r => setTimeout(r, 1000));
  const sendBtn = footer.querySelector('span[data-icon="send"]')?.closest('button') || footer.querySelector('[data-testid="send"]');
  if (sendBtn) {
    sendBtn.click();
    return true;
  } else {
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
    input.dispatchEvent(ev);
    return true;
  }
}

// Inicializa a extensão
initSession();
