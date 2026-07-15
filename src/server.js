require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./database');
const userbot = require('./userbot');
const { handleWebhook: handleWAWebhook, setupWebhook: setupWAWebhook, sendManual: sendWA, getQRCode } = require('./whatsapp');
const { processMessage } = require('./agent');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const password = process.env.ADMIN_PASSWORD || 'zk00admin123';
  if (token !== password) return res.status(401).json({ error: 'Não autorizado' });
  next();
}

// ==============================
// WEBHOOKS
// ==============================
app.post('/webhook/whatsapp', (req, res) => {
  res.sendStatus(200);
  handleWAWebhook(req.body).catch(console.error);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'ZK00', uptime: process.uptime() });
});

// ==============================
// AUTH
// ==============================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'zk00admin123';
  if (password === adminPass) res.json({ token: adminPass, success: true });
  else res.status(401).json({ error: 'Senha incorreta' });
});

// ==============================
// DASHBOARD
// ==============================
app.get('/api/stats', authMiddleware, (req, res) => {
  const stats = db.getStats();
  res.json({ ...stats, uptime: process.uptime() });
});

app.get('/api/conversations', authMiddleware, (req, res) => {
  res.json(db.getRecentConversations(30));
});

app.get('/api/conversations/:platform/:userId', authMiddleware, (req, res) => {
  const { platform, userId } = req.params;
  res.json({ history: db.getHistory(platform, userId), client: db.getClient(platform, userId) });
});

app.post('/api/send', authMiddleware, async (req, res) => {
  const { platform, userId, message } = req.body;
  if (!platform || !userId || !message) return res.status(400).json({ error: 'Dados incompletos' });
  try {
    if (platform === 'telegram') await userbot.sendManual(userId, message);
    else if (platform === 'whatsapp') await sendWA(userId, message);
    db.addMessage(platform, userId, 'agent', message);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/human-mode', authMiddleware, (req, res) => {
  const { platform, userId, active } = req.body;
  db.setHumanMode(platform, userId, active);
  res.json({ success: true, humanMode: active });
});

app.post('/api/agent/toggle', authMiddleware, (req, res) => {
  const settings = db.getSettings();
  db.updateSettings({ agentActive: !settings.agentActive });
  res.json({ agentActive: !settings.agentActive });
});

// ==============================
// CLIENTS
// ==============================
app.get('/api/clients', authMiddleware, (req, res) => res.json(db.getAllClients()));
app.patch('/api/clients/:platform/:userId', authMiddleware, (req, res) => {
  res.json(db.saveClient(req.params.platform, req.params.userId, req.body));
});

// ==============================
// KNOWLEDGE
// ==============================
app.get('/api/knowledge', authMiddleware, (req, res) => res.json(db.getAllKnowledge()));
app.post('/api/knowledge', authMiddleware, (req, res) => res.json(db.addKnowledge(req.body)));
app.delete('/api/knowledge/:id', authMiddleware, (req, res) => {
  db.deleteKnowledge(req.params.id);
  res.json({ success: true });
});

// ==============================
// SETTINGS
// ==============================
app.get('/api/settings', authMiddleware, (req, res) => res.json(db.getSettings()));
app.patch('/api/settings', authMiddleware, (req, res) => res.json(db.updateSettings(req.body)));

// ==============================
// USERBOT TELEGRAM — AUTENTICAÇÃO
// ==============================
app.get('/api/userbot/status', authMiddleware, (req, res) => {
  res.json(userbot.getStatus());
});

// Passo 1: inicia auth com API ID e HASH
app.post('/api/userbot/start', authMiddleware, async (req, res) => {
  const { apiId, apiHash } = req.body;
  if (!apiId || !apiHash) return res.status(400).json({ error: 'apiId e apiHash obrigatórios' });
  process.env.TELEGRAM_API_ID = apiId;
  process.env.TELEGRAM_API_HASH = apiHash;
  const result = await userbot.startAuth(apiId, apiHash);
  res.json(result);
});

// Passo 2: envia número de telefone
app.post('/api/userbot/phone', authMiddleware, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone obrigatório' });
  const result = await userbot.sendPhone(phone);
  res.json(result);
});

// Passo 3: envia código recebido
app.post('/api/userbot/code', authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });
  const result = await userbot.sendCode(code);
  res.json(result);
});

// Passo 4 (opcional): senha 2FA
app.post('/api/userbot/password', authMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
  const result = await userbot.sendPassword(password);
  res.json(result);
});

// ==============================
// INTEGRAÇÕES
// ==============================
app.get('/api/integrations/status', authMiddleware, (req, res) => {
  const ubStatus = userbot.getStatus();
  res.json({
    telegram: {
      type: 'userbot',
      connected: ubStatus.connected,
      hasSession: ubStatus.hasSession,
      authStep: ubStatus.authStep
    },
    whatsapp: {
      configured: !!(process.env.EVOLUTION_API_URL && !process.env.EVOLUTION_API_URL.includes('SUA_EVOLUTION'))
    },
    anthropic: {
      configured: !!(process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('COLOQUE'))
    }
  });
});

app.get('/api/integrations/whatsapp/qr', authMiddleware, async (req, res) => {
  res.json(await getQRCode());
});

// ==============================
// TESTE
// ==============================
app.post('/api/test/message', authMiddleware, async (req, res) => {
  const { platform = 'test', userId = 'test_user', name = 'Teste', message } = req.body;
  if (!message) return res.status(400).json({ error: 'message obrigatório' });
  const response = await processMessage(platform, userId, name, message);
  res.json({ message, response });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==============================
// START
// ==============================
app.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════╗
║        ZK00 AGENT — ONLINE          ║
╠══════════════════════════════════════╣
║  Porta: ${PORT}                          ║
║  Painel: http://localhost:${PORT}       ║
╠══════════════════════════════════════╣
║  Telegram Userbot: iniciando...      ║
╚══════════════════════════════════════╝
  `);

  // Tenta iniciar userbot se já tiver sessão salva
  const settings = db.getSettings();
  if (process.env.TELEGRAM_SESSION || settings.telegramSession) {
    process.env.TELEGRAM_SESSION = process.env.TELEGRAM_SESSION || settings.telegramSession;
    await userbot.initUserbot();
  } else {
    console.log('[USERBOT] Sem sessão — acesse o painel para autenticar');
  }

  // WhatsApp
  const serverUrl = process.env.SERVER_URL;
  if (serverUrl && !serverUrl.includes('SEU_APP')) {
    await setupWAWebhook(serverUrl);
  }
});

module.exports = app;
