// ============================================
// USERBOT MANAGER — ZK00 Agent
// Gerencia múltiplas contas Telegram
// Cada conta tem sessão e dados separados
// ============================================

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('./database');
const axios = require('axios');

// Mapa de clientes ativos: { accountId: { client, isConnected, info } }
const activeClients = {};

// Estado de autenticação por conta
const authStates = {};

// ==============================
// SALVA/CARREGA CONTAS
// ==============================
function getAccounts() {
  const settings = db.getSettings();
  return settings.telegramAccounts || [];
}

function saveAccounts(accounts) {
  db.updateSettings({ telegramAccounts: accounts });
}

function getAccount(accountId) {
  return getAccounts().find(a => a.id === accountId) || null;
}

function addOrUpdateAccount(accountData) {
  const accounts = getAccounts();
  const idx = accounts.findIndex(a => a.id === accountData.id);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], ...accountData };
    console.log(`[MANAGER] Updated account: ${accountData.name} (${accountData.id}). Total: ${accounts.length}`);
  } else {
    accounts.push(accountData);
    console.log(`[MANAGER] Added NEW account: ${accountData.name} (${accountData.id}). Total: ${accounts.length}`);
  }
  saveAccounts(accounts);
  console.log(`[MANAGER] All accounts: ${accounts.map(a=>a.name).join(', ')}`);
}

function removeAccount(accountId) {
  const accounts = getAccounts().filter(a => a.id !== accountId);
  saveAccounts(accounts);
  // Desconecta se estiver ativo
  if (activeClients[accountId]) {
    try { activeClients[accountId].client.disconnect(); } catch(e) {}
    delete activeClients[accountId];
  }
}

// ==============================
// CONECTA UMA CONTA
// ==============================
async function connectAccount(account, sendFn) {
  const { id, apiId, apiHash, session, name } = account;

  if (!apiId || !apiHash || !session) {
    console.log(`[USERBOT:${name}] Sem credenciais — precisa autenticar`);
    return false;
  }

  try {
    const client = new TelegramClient(
      new StringSession(session),
      parseInt(apiId),
      apiHash,
      { connectionRetries: 5, retryDelay: 1000, autoReconnect: true }
    );

    await client.connect();
    activeClients[id] = { client, isConnected: true, info: account };
    console.log(`[USERBOT:${name}] ✅ Conectado!`);

    // Atualiza sessão se renovada
    const newSession = client.session.save();
    if (newSession && newSession !== session) {
      addOrUpdateAccount({ ...account, session: newSession });
    }

    // Inicia listener específico desta conta
    startListener(id, client, account, sendFn);
    return true;
  } catch (err) {
    console.error(`[USERBOT:${name}] Erro:`, err.message);
    if (activeClients[id]) activeClients[id].isConnected = false;
    return false;
  }
}

// ==============================
// LISTENER POR CONTA
// ==============================
const pendingMessages = {};

function startListener(accountId, client, account, sendFn) {
  const { name } = account;

  // Registra sendFn no agent para follow-ups
  const { registerSendFn } = require('./agent');
  registerSendFn(`telegram_${accountId}`, async (userId, msg) => {
    try { await client.sendMessage(parseInt(userId), { message: msg }); }
    catch (e) { console.error(`[USERBOT:${name}] Erro sendFn:`, e.message); }
  });

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || message.out) return;

      const peer = message.peerId;
      if (!peer || peer.className !== 'PeerUser') return;

      const userId = String(peer.userId);
      const hasPhoto = message.media &&
        (message.media.className === 'MessageMediaPhoto' ||
         message.media.className === 'MessageMediaDocument');

      // Nome do contato
      let userName = userId;
      try {
        const entity = await client.getEntity(peer);
        userName = entity.firstName || entity.username || userId;
      } catch (e) {}

      // Plataforma única por conta (separa dados)
      const platform = `telegram_${accountId}`;

      // ===== FOTO =====
      if (hasPhoto) {
        console.log(`[USERBOT:${name}] 📸 Foto de ${userName}`);
        try {
          await client.invoke(new Api.messages.ReadHistory({ peer, maxId: message.id }));
        } catch (e) {}

        const { processPhoto } = require('./agent');
        const response = await processPhoto(platform, userId, userName);
        if (response) {
          await new Promise(r => setTimeout(r, 5000 + Math.random() * 2000));
          await client.invoke(new Api.messages.SetTyping({ peer, action: new Api.SendMessageTypingAction() }));
          await new Promise(r => setTimeout(r, 1500));
          await client.sendMessage(peer, { message: response });
        }
        return;
      }

      // ===== TEXTO =====
      const text = message.message;
      if (!text || text.trim().length < 2) return;

      console.log(`[USERBOT:${name}] 💬 accountId:${accountId} platform:${platform} userId:${userId} msg:${text.substring(0, 40)}`);

      // Agrupa mensagens rápidas
      const batchKey = `${accountId}_${userId}`;
      if (pendingMessages[batchKey]) {
        clearTimeout(pendingMessages[batchKey].timer);
        pendingMessages[batchKey].texts.push(text);
        pendingMessages[batchKey].msgId = message.id;
      } else {
        pendingMessages[batchKey] = { texts: [text], msgId: message.id, peer };
      }

      pendingMessages[batchKey].timer = setTimeout(async () => {
        const batch = pendingMessages[batchKey];
        delete pendingMessages[batchKey];

        const fullText = batch.texts.join(' | ');

        try {
          await client.invoke(new Api.messages.ReadHistory({ peer: batch.peer, maxId: batch.msgId }));
        } catch (e) {}

        const { processMessage } = require('./agent');
        const response = await processMessage(platform, userId, userName, fullText);

        if (response) {
          const delay = 5000 + Math.min(fullText.length * 40, 4000) + Math.random() * 2000;
          await new Promise(r => setTimeout(r, delay));
          await client.invoke(new Api.messages.SetTyping({ peer: batch.peer, action: new Api.SendMessageTypingAction() }));
          await new Promise(r => setTimeout(r, Math.min(response.length * 50, 3000) + 800));
          await client.sendMessage(batch.peer, { message: response });
          console.log(`[USERBOT:${name}] Respondido: ${response.substring(0, 60)}`);
        }
      }, 3000);

    } catch (err) {
      console.error(`[USERBOT:${name}] Erro handler:`, err.message);
    }
  }, new (require('telegram/events').NewMessage)({}));

  console.log(`[USERBOT:${name}] 🎧 Ouvindo mensagens...`);
}

// ==============================
// INICIALIZA TODAS AS CONTAS
// ==============================
async function initAll() {
  const accounts = getAccounts();
  if (!accounts.length) {
    console.log('[USERBOT MANAGER] Nenhuma conta configurada');
    return;
  }
  console.log(`[USERBOT MANAGER] Iniciando ${accounts.length} conta(s)...`);
  for (const account of accounts) {
    if (account.active !== false) {
      await connectAccount(account);
    }
  }
}

// ==============================
// AUTENTICAÇÃO
// ==============================
async function startAuth(accountId, apiId, apiHash, accountName) {
  try {
    const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, { connectionRetries: 3 });
    await client.connect();
    authStates[accountId] = {
      step: 'waiting_phone',
      apiId, apiHash,
      name: accountName || `Conta ${accountId}`,
      tempClient: client
    };
    console.log(`[MANAGER] startAuth OK - accountId: ${accountId}, authStates keys: ${Object.keys(authStates).join(',')}`);

    // Salva no banco para recuperar se servidor reiniciar
    try {
      const db = require('./database');
      const settings = db.getSettings();
      const pendingAuths = settings.pendingAuths || {};
      pendingAuths[accountId] = { apiId, apiHash, name: accountName, createdAt: new Date().toISOString() };
      db.updateSettings({ pendingAuths });
    } catch(e) { console.error('[MANAGER] Erro ao salvar pendingAuth:', e.message); }

    return { success: true, step: 'waiting_phone' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendPhone(accountId, phone) {
  let state = authStates[accountId];
  console.log(`[MANAGER] sendPhone - accountId: ${accountId}, authStates keys: ${Object.keys(authStates).join(',')}`);

  // Se perdeu o estado (ex: reinício do servidor), tenta recriar do banco
  if (!state) {
    const db = require('./database');
    const settings = db.getSettings();
    const pendingAuth = (settings.pendingAuths || {})[accountId];
    if (pendingAuth) {
      console.log(`[MANAGER] Recriando authState do banco para ${accountId}`);
      try {
        const client = new TelegramClient(new StringSession(''), parseInt(pendingAuth.apiId), pendingAuth.apiHash, { connectionRetries: 3 });
        await client.connect();
        authStates[accountId] = {
          step: 'waiting_phone',
          apiId: pendingAuth.apiId,
          apiHash: pendingAuth.apiHash,
          name: pendingAuth.name,
          tempClient: client
        };
        state = authStates[accountId];
      } catch(e) {
        console.error('[MANAGER] Falhou ao recriar state:', e.message);
      }
    }
    if (!state) return { success: false, error: 'Sessão expirou. Volte ao Passo 1 e clique em Iniciar conexão novamente.' };
  }
  try {
    const result = await state.tempClient.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: parseInt(state.apiId),
      apiHash: state.apiHash,
      settings: new Api.CodeSettings({})
    }));
    state.phone = phone;
    state.phoneCodeHash = result.phoneCodeHash;
    state.step = 'waiting_code';
    return { success: true, step: 'waiting_code' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Função combinada: inicia auth E envia telefone em uma única chamada
async function startAuthAndPhone(accountId, apiId, apiHash, accountName, phone) {
  try {
    // Passo 1: cria o cliente
    const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, { connectionRetries: 5 });
    await client.connect();

    // Passo 2: envia o código imediatamente
    const result = await client.invoke(new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: parseInt(apiId),
      apiHash: apiHash,
      settings: new Api.CodeSettings({})
    }));

    // Salva o estado
    authStates[accountId] = {
      step: 'waiting_code',
      apiId, apiHash,
      name: accountName,
      phone,
      phoneCodeHash: result.phoneCodeHash,
      tempClient: client
    };

    console.log(`[MANAGER] startAuthAndPhone OK - ${accountId} - código enviado para ${phone}`);
    return { success: true, step: 'waiting_code', message: 'Código enviado! Verifique seu Telegram.' };
  } catch(err) {
    console.error('[MANAGER] startAuthAndPhone error:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendCode(accountId, code) {
  const state = authStates[accountId];
  if (!state) return { success: false, error: 'Estado inválido' };
  try {
    await state.tempClient.invoke(new Api.auth.SignIn({
      phoneNumber: state.phone,
      phoneCodeHash: state.phoneCodeHash,
      phoneCode: code.trim()
    }));
    return await finalizeAuth(accountId);
  } catch (err) {
    if (err.message.includes('SESSION_PASSWORD_NEEDED')) {
      state.step = 'waiting_password';
      return { success: true, step: 'waiting_password' };
    }
    return { success: false, error: err.message };
  }
}

async function sendPassword(accountId, password) {
  const state = authStates[accountId];
  if (!state) return { success: false, error: 'Estado inválido' };
  try {
    const pwd = await state.tempClient.invoke(new Api.account.GetPassword());
    const { computeCheck } = require('telegram/Password');
    await state.tempClient.invoke(new Api.auth.CheckPassword({ password: await computeCheck(pwd, password) }));
    return await finalizeAuth(accountId);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function finalizeAuth(accountId) {
  const state = authStates[accountId];
  const session = state.tempClient.session.save();
  const account = {
    id: accountId,
    name: state.name,
    apiId: state.apiId,
    apiHash: state.apiHash,
    session,
    active: true,
    createdAt: new Date().toISOString()
  };
  addOrUpdateAccount(account);
  activeClients[accountId] = { client: state.tempClient, isConnected: true, info: account };
  startListener(accountId, state.tempClient, account);
  delete authStates[accountId];
  return { success: true, step: 'done', message: '✅ Conta conectada!' };
}

// ==============================
// STATUS
// ==============================
function getStatus() {
  const accounts = getAccounts();
  return accounts.map(acc => ({
    id: acc.id,
    name: acc.name,
    active: acc.active !== false,
    connected: !!(activeClients[acc.id]?.isConnected),
    hasSession: !!(acc.session && acc.session.length > 10),
    authStep: authStates[acc.id]?.step || null,
    createdAt: acc.createdAt
  }));
}

async function sendManual(accountId, userId, text) {
  const ac = activeClients[accountId];
  if (!ac || !ac.isConnected) {
    console.log(`[USERBOT:${accountId}] Não conectado — simulando envio`);
    return;
  }
  try {
    await ac.client.sendMessage(parseInt(userId), { message: text });
  } catch (e) {
    console.error(`[USERBOT:${accountId}] Erro manual:`, e.message);
  }
}

module.exports = {
  initAll, connectAccount, removeAccount,
  startAuth, startAuthAndPhone, sendPhone, sendCode, sendPassword,
  getStatus, getAccounts, addOrUpdateAccount,
  sendManual, activeClients, authStates
};
