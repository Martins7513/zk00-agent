// ============================================
// NTFY — Notificações push via ntfy.sh
// Gratuito, funciona 100% no iOS mesmo com tela bloqueada
// ============================================

const axios = require('axios');

// Configuração via variáveis de ambiente
// NTFY_TOPIC = seu tópico único (ex: tele-agent-fm-2024)
// NTFY_SERVER = opcional, padrão ntfy.sh
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_SERVER = process.env.NTFY_SERVER || 'ntfy.sh';
const NTFY_TOKEN = process.env.NTFY_TOKEN || ''; // opcional, para tópicos privados

if (NTFY_TOPIC) {
  console.log(`[NTFY] ✅ Configurado: ${NTFY_SERVER}/${NTFY_TOPIC}`);
} else {
  console.log('[NTFY] ⚠️ NTFY_TOPIC não configurado — notificações push desativadas');
}

async function sendNotification({ title, message, priority = 'default', tags = [], url = '' }) {
  if (!NTFY_TOPIC) return;

  const body = JSON.stringify({
    topic: NTFY_TOPIC,
    title,
    message,
    priority: priority === 'high' ? 4 : priority === 'urgent' ? 5 : 3,
    tags,
    ...(url ? { click: url } : {})
  });

  try {
    const res = await axios.post(`https://${NTFY_SERVER}`, JSON.parse(body), {
      headers: {
        'Content-Type': 'application/json',
        ...(NTFY_TOKEN ? { 'Authorization': `Bearer ${NTFY_TOKEN}` } : {})
      },
      timeout: 10000
    });
    console.log(`[NTFY] ✅ Push enviado: ${title} (${res.status})`);
    return res.status;
  } catch(e) {
    // Tenta HTTP como fallback
    try {
      const res2 = await axios.post(`http://${NTFY_SERVER}`, JSON.parse(body), {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      console.log(`[NTFY] ✅ Push via HTTP: ${title} (${res2.status})`);
      return res2.status;
    } catch(e2) {
      console.error('[NTFY] ❌ Falhou:', e2.message);
      return null;
    }
  }
}

// Notifica mensagem nova
async function notifyNewMessage(userName, message, platform) {
  const plat = platform?.includes('telegram') ? 'Telegram' : 'WhatsApp';
  await sendNotification({
    title: `💬 ${userName} — ${plat}`,
    message: message?.substring(0, 100) || 'Nova mensagem',
    priority: 'default',
    tags: ['speech_balloon'],
    url: 'https://zk00-agent-production.up.railway.app/mobile'
  });
}

// Notifica gatilho não encontrado (atenção)
async function notifyAttention(userName, message, platform) {
  const plat = platform?.includes('telegram') ? 'Telegram' : 'WhatsApp';
  await sendNotification({
    title: `⚠️ Atenção — ${userName}`,
    message: `${plat}: "${message?.substring(0, 80)}" — sem resposta automática`,
    priority: 'high',
    tags: ['warning'],
    url: 'https://zk00-agent-production.up.railway.app/mobile'
  });
}

// Notifica lead sem resposta há X minutos
async function notifyUnanswered(userName, minutes, platform) {
  const plat = platform?.includes('telegram') ? 'Telegram' : 'WhatsApp';
  await sendNotification({
    title: `⏰ ${userName} aguardando`,
    message: `${plat} — sem resposta há ${minutes} minutos`,
    priority: 'high',
    tags: ['alarm_clock'],
    url: 'https://zk00-agent-production.up.railway.app/mobile'
  });
}

module.exports = { sendNotification, notifyNewMessage, notifyAttention, notifyUnanswered };
