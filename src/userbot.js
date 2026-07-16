// ============================================
// TELEGRAM USERBOT — ZK00 Agent
// Conecta na conta PESSOAL do Telegram
// Usa GramJS (gramjs.dev)
// ============================================

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { processMessage, processPhoto, registerSendFn } = require('./agent');
const db = require('./database');
const axios = require('axios');

// Salva a sessão como variável de ambiente no Railway
// Assim persiste entre redeploys sem precisar re-autenticar
async function saveSessionToRailway(sessionStr) {
  try {
    const projectId = process.env.RAILWAY_PROJECT_ID;
    const serviceId = process.env.RAILWAY_SERVICE_ID;
    const token = process.env.RAILWAY_API_TOKEN; // você adiciona isso manualmente

    if (!token || !projectId || !serviceId) {
      console.log('[USERBOT] Railway API não configurada — sessão salva apenas no banco local');
      return;
    }

    // Atualiza a variável TELEGRAM_SESSION no Railway via API
    await axios.post(
      'https://backboard.railway.app/graphql/v2',
      {
        query: `mutation {
          variableUpsert(input: {
            projectId: "${projectId}",
            serviceId: "${serviceId}",
            environmentId: "${process.env.RAILWAY_ENVIRONMENT_ID || ''}",
            name: "TELEGRAM_SESSION",
            value: "${sessionStr.replace(/"/g, '\"')}"
          })
        }`
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('[USERBOT] ✅ Sessão salva no Railway como variável de ambiente!');
  } catch (err) {
    console.log('[USERBOT] Sessão salva no banco local (Railway API não disponível)');
  }
}

// Recupera sessão de todas as fontes disponíveis
function getStoredSession() {
  // 1. Variável de ambiente (Railway)
  if (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.length > 10) {
    console.log('[USERBOT] Sessão encontrada nas variáveis de ambiente');
    return process.env.TELEGRAM_SESSION;
  }
  // 2. Banco de dados local
  const settings = db.getSettings();
  if (settings.telegramSession && settings.telegramSession.length > 10) {
    console.log('[USERBOT] Sessão encontrada no banco local');
    return settings.telegramSession;
  }
  return null;
}

let client = null;
let isConnected = false;

// IDs que o agente NUNCA responde (seus contatos VIP, você mesmo, etc)
const IGNORE_IDS = [];

// ==============================
// INICIALIZA O CLIENT
// ==============================
async function initUserbot() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    console.log('[USERBOT] API_ID ou API_HASH não configurados — acesse o painel para autenticar');
    return null;
  }

  // Busca sessão de todas as fontes
  const sessionStr = getStoredSession();

  if (!sessionStr) {
    console.log('[USERBOT] Sem sessão salva — acesse o painel → Integrações para autenticar');
    return null;
  }

  try {
    const session = new StringSession(sessionStr);
    client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
    });

    await client.connect();
    isConnected = true;
    console.log('[USERBOT] ✅ Conectado à conta pessoal do Telegram!');

    // Atualiza sessão se mudou (token de sessão pode ser renovado pelo Telegram)
    const newSession = client.session.save();
    if (newSession && newSession !== sessionStr) {
      console.log('[USERBOT] Sessão renovada — salvando...');
      db.updateSettings({ telegramSession: newSession });
      process.env.TELEGRAM_SESSION = newSession;
      await saveSessionToRailway(newSession);
    }

    // Inicia o listener de mensagens
    startMessageListener();

    return client;
  } catch (err) {
    console.error('[USERBOT] Erro ao conectar:', err.message);
    isConnected = false;

    // Se sessão expirou, limpa para forçar nova autenticação
    if (err.message.includes('AUTH_KEY') || err.message.includes('SESSION')) {
      console.log('[USERBOT] Sessão expirada — será necessário re-autenticar no painel');
      db.updateSettings({ telegramSession: '' });
      process.env.TELEGRAM_SESSION = '';
    }
    return null;
  }
}

// ==============================
// LISTENER DE MENSAGENS
// ==============================
function startMessageListener() {
  if (!client) return;

  // Registra função de envio no agente (para follow-ups)
  registerSendFn('telegram', async (userId, msg) => {
    try {
      await client.sendMessage(parseInt(userId), { message: msg });
    } catch (e) {
      console.error('[USERBOT] Erro no sendFn:', e.message);
    }
  });

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message) return;

      // Só mensagens recebidas (não enviadas por você)
      if (message.out) return;

      // Só DMs
      const peer = message.peerId;
      if (!peer || peer.className !== 'PeerUser') return;

      const userId = String(peer.userId);
      if (IGNORE_IDS.includes(userId)) return;

      // Nome do contato
      let userName = userId;
      try {
        const entity = await client.getEntity(peer);
        userName = entity.firstName || entity.username || userId;
      } catch (e) {}

      // ============ DETECTA FOTO/PRINT ============
      const hasPhoto = message.media &&
        (message.media.className === 'MessageMediaPhoto' ||
         message.media.className === 'MessageMediaDocument');

      if (hasPhoto) {
        console.log(`[USERBOT] 📸 Foto recebida de ${userName} (${userId})`);

        // Marca como lida
        try {
          await client.invoke(new Api.messages.ReadHistory({
            peer: peer,
            maxId: message.id
          }));
        } catch (e) {}

        const response = await processPhoto('telegram', userId, userName);
        if (response) {
          await new Promise(r => setTimeout(r, 1500));
          await client.invoke(new Api.messages.SetTyping({
            peer, action: new Api.SendMessageTypingAction()
          }));
          await new Promise(r => setTimeout(r, 1200));
          await client.sendMessage(peer, { message: response });
        }
        return;
      }

      // ============ MENSAGEM DE TEXTO ============
      const text = message.message;
      if (!text || text.trim() === '') return;

      console.log(`[USERBOT] Mensagem de ${userName} (${userId}): ${text.substring(0, 60)}`);

      // Marca mensagem como LIDA (2 setinhas azuis) antes de responder
      try {
        await client.invoke(new Api.messages.ReadHistory({
          peer: peer,
          maxId: message.id
        }));
      } catch (e) {}

      const response = await processMessage('telegram', userId, userName, text);
      if (response) {
        const delay = Math.min(text.length * 60, 3000) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        await client.invoke(new Api.messages.SetTyping({
          peer, action: new Api.SendMessageTypingAction()
        }));
        await new Promise(r => setTimeout(r, 1500));
        await client.sendMessage(peer, { message: response });
        console.log(`[USERBOT] Respondido: ${response.substring(0, 60)}`);
      }
    } catch (err) {
      console.error('[USERBOT] Erro no handler:', err.message);
    }
  }, new (require('telegram/events').NewMessage)({}));

  console.log('[USERBOT] 🎧 Ouvindo mensagens e fotos...');
}

// ==============================
// AUTENTICAÇÃO (fluxo via API)
// ==============================
let authState = {
  step: 'idle', // idle | waiting_phone | waiting_code | waiting_password | done
  phone: null,
  phoneCodeHash: null,
  tempClient: null
};

async function startAuth(apiId, apiHash) {
  try {
    const session = new StringSession('');
    authState.tempClient = new TelegramClient(session, parseInt(apiId), apiHash, {
      connectionRetries: 3
    });
    await authState.tempClient.connect();
    authState.step = 'waiting_phone';
    return { success: true, step: 'waiting_phone', message: 'Conectado! Agora envie seu número de telefone.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendPhone(phone) {
  if (authState.step !== 'waiting_phone' || !authState.tempClient) {
    return { success: false, error: 'Inicie a autenticação primeiro' };
  }
  try {
    const result = await authState.tempClient.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: parseInt(process.env.TELEGRAM_API_ID),
        apiHash: process.env.TELEGRAM_API_HASH,
        settings: new Api.CodeSettings({})
      })
    );
    authState.phone = phone;
    authState.phoneCodeHash = result.phoneCodeHash;
    authState.step = 'waiting_code';
    return { success: true, step: 'waiting_code', message: 'Código enviado! Digite o código que chegou no Telegram.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendCode(code) {
  if (authState.step !== 'waiting_code' || !authState.tempClient) {
    return { success: false, error: 'Envie o telefone primeiro' };
  }
  try {
    await authState.tempClient.invoke(
      new Api.auth.SignIn({
        phoneNumber: authState.phone,
        phoneCodeHash: authState.phoneCodeHash,
        phoneCode: code.trim()
      })
    );

    // Sessão salva!
    const sessionStr = authState.tempClient.session.save();
    db.updateSettings({ telegramSession: sessionStr });
    process.env.TELEGRAM_SESSION = sessionStr;

    // Salva no Railway via API (persiste entre redeploys)
    await saveSessionToRailway(sessionStr);

    authState.step = 'done';
    client = authState.tempClient;
    isConnected = true;
    startMessageListener();

    return {
      success: true,
      step: 'done',
      session: sessionStr,
      message: '✅ Autenticado com sucesso! Userbot ativo.'
    };
  } catch (err) {
    // Se precisar de senha 2FA
    if (err.message.includes('SESSION_PASSWORD_NEEDED')) {
      authState.step = 'waiting_password';
      return { success: true, step: 'waiting_password', message: 'Conta tem 2FA. Envie sua senha.' };
    }
    return { success: false, error: err.message };
  }
}

async function sendPassword(password) {
  if (authState.step !== 'waiting_password' || !authState.tempClient) {
    return { success: false, error: 'Estado inválido' };
  }
  try {
    const pwd = await authState.tempClient.invoke(new Api.account.GetPassword());
    const { computeCheck } = require('telegram/Password');
    const passwordCheck = await computeCheck(pwd, password);
    await authState.tempClient.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

    const sessionStr = authState.tempClient.session.save();
    db.updateSettings({ telegramSession: sessionStr });
    process.env.TELEGRAM_SESSION = sessionStr;

    // Salva no Railway via API (persiste entre redeploys)
    await saveSessionToRailway(sessionStr);

    authState.step = 'done';
    client = authState.tempClient;
    isConnected = true;
    startMessageListener();

    return {
      success: true,
      step: 'done',
      session: sessionStr,
      message: '✅ Autenticado com 2FA! Userbot ativo.'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Envia mensagem manual
async function sendManual(userId, text) {
  if (!client || !isConnected) {
    console.log(`[USERBOT SIMULADO] Para ${userId}: ${text}`);
    return;
  }
  try {
    await client.sendMessage(parseInt(userId), { message: text });
  } catch (err) {
    console.error('[USERBOT] Erro ao enviar manual:', err.message);
  }
}

function getStatus() {
  return {
    connected: isConnected,
    authStep: authState.step,
    hasSession: !!(process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.length > 10)
  };
}

module.exports = {
  initUserbot,
  startAuth,
  sendPhone,
  sendCode,
  sendPassword,
  sendManual,
  getStatus
};
