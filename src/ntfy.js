// ============================================
// NTFY — Notificações push via ntfy.sh
// Gratuito, funciona 100% no iOS mesmo com tela bloqueada
// ============================================

const https = require('https');
const http = require('http');

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
    ...(url ? { actions: [{ action: 'view', label: 'Abrir', url }] } : {})
  });

  const options = {
    hostname: NTFY_SERVER,
    port: 443,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...(NTFY_TOKEN ? { 'Authorization': `Bearer ${NTFY_TOKEN}` } : {})
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      resolve(res.statusCode);
      console.log(`[NTFY] Push enviado: ${title} (status: ${res.statusCode})`);
    });
    req.on('error', (e) => {
      console.error('[NTFY] Erro ao enviar push:', e.message);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
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
