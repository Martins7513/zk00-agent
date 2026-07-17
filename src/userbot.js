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

// Agrupa mensagens rápidas do mesmo usuário antes de responder
const pendingMessages = {};

// Fila de envio — evita responder muitos usuários ao mesmo tempo
// (protege contra ban do Telegram)
const sendQueue = [];
let sendingQueue = false;

async function processSendQueue() {
  if (sendingQueue || sendQueue.length === 0) return;
  sendingQueue = true;
  while (sendQueue.length > 0) {
    const task = sendQueue.shift();
    try {
      await task();
    } catch (e) {
      console.error('[USERBOT] Erro na fila de envio:', e.message);
    }
    // Intervalo entre envios para diferentes usuários (anti-ban)
    const interval = 2000 + Math.random() * 2000;
    await new Promise(r => setTimeout(r, interval));
  }
  sendingQueue = false;
}

function queueSend(fn) {
  sendQueue.push(fn);
  processSendQueue();
}

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
          // Delay mínimo de 5s para foto também
          await new Promise(r => setTimeout(r, 5000 + Math.random() * 2000));
          await client.invoke(new Api.messages.SetTyping({
            peer, action: new Api.SendMessageTypingAction()
          }));
          await new Promise(r => setTimeout(r, 1500));
          await client.sendMessage(peer, { message: response });
        }
        return;
      }

      // ============ MENSAGEM DE TEXTO ============
      const text = message.message;
      if (!text || text.trim() === '') return;

      console.log(`[USERBOT] Mensagem de ${userName} (${userId}): ${text.substring(0, 60)}`);

      // Agrupa mensagens rápidas do mesmo usuário (espera 3s por mais mensagens)
      if (pendingMessages[userId]) {
        clearTimeout(pendingMessages[userId].timer);
        pendingMessages[userId].texts.push(text);
        pendingMessages[userId].msgId = message.id;
      } else {
        pendingMessages[userId] = { texts: [text], msgId: message.id, peer };
      }

      pendingMessages[userId].timer = setTimeout(async () => {
        const batch = pendingMessages[userId];
        delete pendingMessages[userId];

        // Junta todas as mensagens em uma só para a IA processar
        const fullText = batch.texts.join(' | ');
        const lastMsgId = batch.msgId;

        // Marca como lida
        try {
          await client.invoke(new Api.messages.ReadHistory({
            peer: batch.peer,
            maxId: lastMsgId
          }));
        } catch (e) {}

        const response = await processMessage('telegram', userId, userName, fullText);
        if (response) {
          // Delay mínimo de 5s + tempo proporcional ao texto (mais humano)
          const minDelay = 5000;
          const extraDelay = Math.min(fullText.length * 40, 4000);
          const randomDelay = Math.random() * 2000;
          const totalDelay = minDelay + extraDelay + randomDelay;

          console.log(`[USERBOT] Aguardando ${Math.round(totalDelay/1000)}s antes de responder...`);
          await new Promise(r => setTimeout(r, totalDelay));

          // Mostra "digitando..." por tempo proporcional à resposta
          await client.invoke(new Api.messages.SetTyping({
            peer: batch.peer, action: new Api.SendMessageTypingAction()
          }));

          const typingTime = Math.min(response.length * 50, 4000) + 1000;
          await new Promise(r => setTimeout(r, typingTime));

          await client.sendMessage(batch.peer, { message: response });
          console.log(`[USERBOT] Respondido após ${Math.round(totalDelay/1000)}s: ${response.substring(0, 60)}`);
        }
      }, 3000); // aguarda 3s por mais mensagens antes de processar
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
async function async sendManual(userId, text) {
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
