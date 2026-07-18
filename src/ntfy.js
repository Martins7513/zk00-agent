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

  // Tenta HTTPS primeiro, depois HTTP
  const tryRequest = (useHttps) => {
    const lib = useHttps ? https : http;
    const port = useHttps ? 443 : 80;
    const options = {
      hostname: NTFY_SERVER,
      port,
      path: '/',
      method: 'POST',
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(NTFY_TOKEN ? { 'Authorization': `Bearer ${NTFY_TOKEN}` } : {})
      }
    };

    return new Promise((resolve) => {
      const req = lib.request(options, (res) => {
        console.log(`[NTFY] ✅ Push enviado: ${title} (${useHttps?'HTTPS':'HTTP'} ${res.statusCode})`);
        resolve(res.statusCode);
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', (e) => {
        if (useHttps) {
          // Tenta HTTP como fallback
          tryRequest(false).then(resolve);
        } else {
          console.error('[NTFY] ❌ Falhou em ambos HTTPS e HTTP:', e.message);
          resolve(null);
        }
      });
      req.write(body);
      req.end();
    });
  };

  return tryRequest(true);
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
