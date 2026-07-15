// ============================================
// TELEGRAM USERBOT — ZK00 Agent
// Conecta na conta PESSOAL do Telegram
// Usa GramJS (gramjs.dev)
// ============================================

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { processMessage } = require('./agent');
const db = require('./database');

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
  const sessionStr = process.env.TELEGRAM_SESSION || '';

  if (!apiId || !apiHash) {
    console.log('[USERBOT] API_ID ou API_HASH não configurados — modo simulado');
    return null;
  }

  try {
    const session = new StringSession(sessionStr);
    client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
    });

    // Se não tem sessão salva, precisa autenticar
    if (!sessionStr) {
      console.log('[USERBOT] Sem sessão — use /api/userbot/auth para autenticar');
      return null;
    }

    await client.connect();
    isConnected = true;
    console.log('[USERBOT] ✅ Conectado à conta pessoal do Telegram!');

    // Salva a sessão atualizada
    const newSession = client.session.save();
    if (newSession !== sessionStr) {
      db.updateSettings({ telegramSession: newSession });
    }

    // Inicia o listener de mensagens
    startMessageListener();

    return client;
  } catch (err) {
    console.error('[USERBOT] Erro ao conectar:', err.message);
    isConnected = false;
    return null;
  }
}

// ==============================
// LISTENER DE MENSAGENS
// ==============================
function startMessageListener() {
  if (!client) return;

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message) return;

      // Só responde mensagens recebidas (não enviadas por você)
      if (message.out) return;

      // Só DMs (não grupos ou canais)
      const peer = message.peerId;
      if (!peer || peer.className !== 'PeerUser') return;

      const userId = String(peer.userId);
      const text = message.message;

      if (!text || text.trim() === '') return;

      // Verifica lista de ignorados
      if (IGNORE_IDS.includes(userId)) return;

      // Busca o nome do contato
      let userName = userId;
      try {
        const entity = await client.getEntity(peer);
        userName = entity.firstName || entity.username || userId;
      } catch (e) {}

      console.log(`[USERBOT] Mensagem de ${userName} (${userId}): ${text.substring(0, 60)}`);

      // Verifica modo humano
      if (db.isHumanMode('telegram', userId)) {
        console.log(`[USERBOT] Chat ${userId} em modo humano — ignorando`);
        return;
      }

      // Verifica se agente está ativo
      const settings = db.getSettings();
      if (!settings.agentActive) return;

      // Processa e responde
      const response = await processMessage('telegram', userId, userName, text);
      if (response) {
        // Delay natural antes de responder
        const delay = Math.min(text.length * 60, 3000) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));

        // Marca como "digitando"
        await client.invoke(new Api.messages.SetTyping({
          peer: peer,
          action: new Api.SendMessageTypingAction()
        }));

        await new Promise(r => setTimeout(r, 1500));

        // Envia a resposta
        await client.sendMessage(peer, { message: response });
        console.log(`[USERBOT] Respondido: ${response.substring(0, 60)}`);
      }
    } catch (err) {
      console.error('[USERBOT] Erro no handler:', err.message);
    }
  }, new (require('telegram/events').NewMessage)({}));

  console.log('[USERBOT] 🎧 Ouvindo mensagens...');
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
