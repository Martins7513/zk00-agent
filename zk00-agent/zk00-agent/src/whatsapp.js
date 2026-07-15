// ============================================
// WHATSAPP — ZK00 Agent
// Integração via Evolution API (open source, gratuita)
// Docs: https://doc.evolution-api.com
// ============================================

const axios = require('axios');
const { processMessage } = require('./agent');

function getHeaders() {
  return {
    'apikey': process.env.EVOLUTION_API_KEY || '',
    'Content-Type': 'application/json'
  };
}

function getBaseUrl() {
  return process.env.EVOLUTION_API_URL || '';
}

function getInstance() {
  return process.env.EVOLUTION_INSTANCE || 'zk00agent';
}

// Envia mensagem via WhatsApp
async function sendMessage(phone, text) {
  const url = getBaseUrl();
  if (!url || url.includes('SUA_EVOLUTION')) {
    console.log(`[WA SIMULADO] Para ${phone}: ${text}`);
    return;
  }

  try {
    await axios.post(
      `${url}/message/sendText/${getInstance()}`,
      {
        number: phone,
        text,
        delay: 1000
      },
      { headers: getHeaders() }
    );
  } catch (err) {
    console.error('[WA] Erro ao enviar:', err.response?.data || err.message);
  }
}

// Configura webhook na Evolution API
async function setupWebhook(serverUrl) {
  const url = getBaseUrl();
  if (!url || url.includes('SUA_EVOLUTION')) {
    console.log('[WA] URL não configurada — modo simulado');
    return;
  }

  try {
    await axios.post(
      `${url}/webhook/set/${getInstance()}`,
      {
        url: `${serverUrl}/webhook/whatsapp`,
        webhook_by_events: true,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT']
      },
      { headers: getHeaders() }
    );
    console.log('[WA] Webhook configurado!');
  } catch (err) {
    console.error('[WA] Erro ao configurar webhook:', err.message);
  }
}

// Cria instância e retorna QR Code para conexão
async function getQRCode() {
  const url = getBaseUrl();
  if (!url || url.includes('SUA_EVOLUTION')) {
    return { error: 'Evolution API não configurada' };
  }

  try {
    // Verifica se instância já existe
    const check = await axios.get(
      `${url}/instance/connectionState/${getInstance()}`,
      { headers: getHeaders() }
    );

    if (check.data?.instance?.state === 'open') {
      return { status: 'connected', message: 'WhatsApp já conectado!' };
    }
  } catch (e) {
    // Instância não existe, cria uma
    try {
      await axios.post(
        `${url}/instance/create`,
        {
          instanceName: getInstance(),
          token: process.env.EVOLUTION_API_KEY,
          qrcode: true
        },
        { headers: getHeaders() }
      );
    } catch (err2) {
      console.log('[WA] Instância pode já existir, tentando QR...');
    }
  }

  try {
    const res = await axios.get(
      `${url}/instance/connect/${getInstance()}`,
      { headers: getHeaders() }
    );
    return res.data;
  } catch (err) {
    return { error: err.message };
  }
}

// Processa webhook do WhatsApp
async function handleWebhook(body) {
  try {
    // Estrutura da Evolution API v2
    const event = body.event;
    if (event !== 'messages.upsert') return;

    const data = body.data;
    if (!data?.messages) return;

    for (const msg of data.messages) {
      // Ignora mensagens próprias e de grupos
      if (msg.key?.fromMe) continue;
      if (msg.key?.remoteJid?.includes('@g.us')) continue;

      const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
      const pushName = msg.pushName || phone;
      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   msg.message?.imageMessage?.caption ||
                   '';

      if (!text) continue;

      console.log(`[WA] Mensagem de ${pushName} (${phone}): ${text.substring(0, 50)}`);

      const response = await processMessage('whatsapp', phone, pushName, text);
      if (response) {
        const delay = Math.min(text.length * 60, 2500);
        await new Promise(r => setTimeout(r, delay));
        await sendMessage(phone + '@s.whatsapp.net', response);
      }
    }
  } catch (err) {
    console.error('[WA] Erro no webhook:', err.message);
  }
}

// Envia mensagem manual (modo humano)
async function sendManual(phone, text) {
  const target = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
  await sendMessage(target, text);
}

module.exports = { handleWebhook, setupWebhook, sendManual, getQRCode };
