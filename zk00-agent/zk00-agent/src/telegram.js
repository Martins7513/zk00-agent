// ============================================
// TELEGRAM — ZK00 Agent
// Integração com Telegram Bot API
// ============================================

const axios = require('axios');
const { processMessage } = require('./agent');

const BASE_URL = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Envia mensagem via Telegram
async function sendMessage(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN.includes('COLOQUE')) {
    console.log(`[TG SIMULADO] Para ${chatId}: ${text}`);
    return;
  }

  try {
    await axios.post(`${BASE_URL()}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('[TG] Erro ao enviar:', err.response?.data || err.message);
  }
}

// Configura o webhook no Telegram
async function setupWebhook(serverUrl) {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN.includes('COLOQUE')) {
    console.log('[TG] Token não configurado — modo simulado');
    return;
  }

  const webhookUrl = `${serverUrl}/webhook/telegram`;
  try {
    const res = await axios.post(`${BASE_URL()}/setWebhook`, {
      url: webhookUrl,
      secret_token: process.env.WEBHOOK_SECRET || 'zk00secret'
    });
    console.log('[TG] Webhook configurado:', res.data.description);
  } catch (err) {
    console.error('[TG] Erro ao configurar webhook:', err.message);
  }
}

// Processa update do Telegram
async function handleUpdate(update) {
  const message = update.message || update.channel_post;
  if (!message || !message.text) return;

  const chatId = String(message.chat.id);
  const userId = String(message.from?.id || chatId);
  const userName = message.from?.first_name || message.from?.username || 'Usuário';
  const text = message.text;

  // Ignora comandos internos
  if (text.startsWith('/start')) {
    const settings = require('./database').getSettings();
    await sendMessage(chatId, settings.welcomeMessage);
    return;
  }

  console.log(`[TG] Mensagem de ${userName} (${userId}): ${text.substring(0, 50)}`);

  // Processa e responde
  const response = await processMessage('telegram', userId, userName, text);
  if (response) {
    // Simula digitação natural (pequeno delay)
    const delay = Math.min(text.length * 50, 2000);
    await new Promise(r => setTimeout(r, delay));
    await sendMessage(chatId, response);
  }
}

// Envia mensagem manual (modo humano)
async function sendManual(chatId, text) {
  await sendMessage(chatId, text);
}

module.exports = { handleUpdate, setupWebhook, sendMessage: sendManual };
