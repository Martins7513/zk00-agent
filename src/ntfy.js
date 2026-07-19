// ============================================
// NTFY — Notificações push via ntfy.sh
// Gratuito, funciona 100% no iOS mesmo com tela bloqueada
// ============================================

const axios = require('axios');

// Configuração via variáveis de ambiente
// NTFY_TOPIC = seu tópico único (ex: tele-agent-fm-2024)
// NTFY_SERVER = host (+ porta, se for rede privada do Railway!) do servidor ntfy
//   Ex. rede privada Railway: NTFY_SERVER=ntfy.railway.internal:8080
//   (a porta é a que aparece em Settings > Networking > Private Networking
//   do serviço ntfy no Railway — NÃO assuma 80/443)
// NTFY_USE_HTTPS = 'true' para forçar HTTPS (padrão: false — rede interna do
//   Railway já é criptografada via WireGuard, o ntfy self-hosted normalmente
//   não tem TLS configurado nela)
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_SERVER = process.env.NTFY_SERVER || 'ntfy.sh';
const NTFY_TOKEN = process.env.NTFY_TOKEN || ''; // opcional, para tópicos privados
const NTFY_USE_HTTPS = process.env.NTFY_USE_HTTPS === 'true';
const NTFY_TIMEOUT_MS = parseInt(process.env.NTFY_TIMEOUT_MS || '5000', 10);

if (NTFY_TOPIC) {
  console.log(`[NTFY] ✅ Configurado: ${NTFY_SERVER}/${NTFY_TOPIC} (https=${NTFY_USE_HTTPS})`);
} else {
  console.log('[NTFY] ⚠️ NTFY_TOPIC não configurado — notificações push desativadas');
}

function describeError(e) {
  const code = e.code || (e.response ? `HTTP ${e.response.status}` : 'UNKNOWN');
  return `${code} — ${e.message}`;
}

async function postTo(protocol, body) {
  return axios.post(`${protocol}://${NTFY_SERVER}`, JSON.parse(body), {
    headers: {
      'Content-Type': 'application/json',
      ...(NTFY_TOKEN ? { 'Authorization': `Bearer ${NTFY_TOKEN}` } : {})
    },
    timeout: NTFY_TIMEOUT_MS
  });
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

  // Tenta primeiro o protocolo configurado (HTTP por padrão — mais rápido em
  // rede privada Railway, que normalmente não tem TLS entre serviços).
  const primary = NTFY_USE_HTTPS ? 'https' : 'http';
  const fallback = NTFY_USE_HTTPS ? 'http' : 'https';

  try {
    const res = await postTo(primary, body);
    console.log(`[NTFY] ✅ Push enviado via ${primary}: ${title} (${res.status})`);
    return res.status;
  } catch (e) {
    console.warn(`[NTFY] ⚠️ Falhou via ${primary} (${describeError(e)}), tentando ${fallback}...`);
    try {
      const res2 = await postTo(fallback, body);
      console.log(`[NTFY] ✅ Push enviado via ${fallback}: ${title} (${res2.status})`);
      return res2.status;
    } catch (e2) {
      console.error(`[NTFY] ❌ Falhou nas duas tentativas. ${primary}: ${describeError(e)} | ${fallback}: ${describeError(e2)}`);
      console.error(`[NTFY] ℹ️ Dica: se o erro for ETIMEDOUT/ECONNREFUSED, confira se NTFY_SERVER inclui a porta correta (Railway > serviço ntfy > Settings > Networking > Private Networking).`);
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
