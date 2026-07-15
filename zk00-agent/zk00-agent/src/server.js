// ============================================
// SERVER — ZK00 Agent
// Servidor principal Express
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./database');
const { handleUpdate, setupWebhook: setupTelegramWebhook, sendMessage: sendTelegram } = require('./telegram');
const { handleWebhook: handleWAWebhook, setupWebhook: setupWAWebhook, sendManual: sendWA, getQRCode } = require('./whatsapp');
const { processMessage } = require('./agent');

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// MIDDLEWARES
// ==============================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de autenticação para rotas admin
function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const password = process.env.ADMIN_PASSWORD || 'zk00admin123';
  if (token !== password) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

// ==============================
// WEBHOOKS
// ==============================

// Telegram webhook
app.post('/webhook/telegram', (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  // Aceita mesmo sem secret configurado (para facilitar setup inicial)
  res.sendStatus(200);
  handleUpdate(req.body).catch(console.error);
});

// WhatsApp webhook (Evolution API)
app.post('/webhook/whatsapp', (req, res) => {
  res.sendStatus(200);
  handleWAWebhook(req.body).catch(console.error);
});

// Health check (Railway usa isso)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'ZK00', uptime: process.uptime() });
});

// ==============================
// API ADMIN — Dashboard
// ==============================

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'zk00admin123';
  if (password === adminPass) {
    res.json({ token: adminPass, success: true });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

// Stats do dashboard
app.get('/api/stats', authMiddleware, (req, res) => {
  res.json(db.getStats());
});

// Lista conversas recentes
app.get('/api/conversations', authMiddleware, (req, res) => {
  res.json(db.getRecentConversations(30));
});

// Histórico de uma conversa específica
app.get('/api/conversations/:platform/:userId', authMiddleware, (req, res) => {
  const { platform, userId } = req.params;
  const history = db.getHistory(platform, userId);
  const client = db.getClient(platform, userId);
  res.json({ history, client });
});

// Enviar mensagem manual (modo humano)
app.post('/api/send', authMiddleware, async (req, res) => {
  const { platform, userId, message } = req.body;
  if (!platform || !userId || !message) {
    return res.status(400).json({ error: 'platform, userId e message são obrigatórios' });
  }

  try {
    if (platform === 'telegram') {
      await sendTelegram(userId, message);
    } else if (platform === 'whatsapp') {
      await sendWA(userId, message);
    }

    db.addMessage(platform, userId, 'agent', message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle modo humano
app.post('/api/human-mode', authMiddleware, (req, res) => {
  const { platform, userId, active } = req.body;
  db.setHumanMode(platform, userId, active);
  res.json({ success: true, humanMode: active });
});

// Toggle agente ativo/inativo
app.post('/api/agent/toggle', authMiddleware, (req, res) => {
  const settings = db.getSettings();
  db.updateSettings({ agentActive: !settings.agentActive });
  res.json({ agentActive: !settings.agentActive });
});

// ==============================
// API ADMIN — Clientes
// ==============================

app.get('/api/clients', authMiddleware, (req, res) => {
  res.json(db.getAllClients());
});

app.patch('/api/clients/:platform/:userId', authMiddleware, (req, res) => {
  const { platform, userId } = req.params;
  const updated = db.saveClient(platform, userId, req.body);
  res.json(updated);
});

// ==============================
// API ADMIN — Base de Conhecimento
// ==============================

app.get('/api/knowledge', authMiddleware, (req, res) => {
  res.json(db.getAllKnowledge());
});

app.post('/api/knowledge', authMiddleware, (req, res) => {
  const item = db.addKnowledge(req.body);
  res.json(item);
});

app.delete('/api/knowledge/:id', authMiddleware, (req, res) => {
  db.deleteKnowledge(req.params.id);
  res.json({ success: true });
});

// ==============================
// API ADMIN — Configurações
// ==============================

app.get('/api/settings', authMiddleware, (req, res) => {
  res.json(db.getSettings());
});

app.patch('/api/settings', authMiddleware, (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json(updated);
});

// ==============================
// API ADMIN — Integrações
// ==============================

// Status das integrações
app.get('/api/integrations/status', authMiddleware, (req, res) => {
  res.json({
    telegram: {
      configured: !!(process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN.includes('COLOQUE')),
      token: process.env.TELEGRAM_BOT_TOKEN ? '***' + process.env.TELEGRAM_BOT_TOKEN.slice(-8) : null
    },
    whatsapp: {
      configured: !!(process.env.EVOLUTION_API_URL && !process.env.EVOLUTION_API_URL.includes('SUA_EVOLUTION')),
      url: process.env.EVOLUTION_API_URL || null
    },
    anthropic: {
      configured: !!(process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('COLOQUE'))
    }
  });
});

// Salvar token do Telegram e reconfigura webhook
app.post('/api/integrations/telegram', authMiddleware, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token obrigatório' });
  process.env.TELEGRAM_BOT_TOKEN = token;
  const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
  await setupTelegramWebhook(serverUrl);
  res.json({ success: true, message: 'Token salvo e webhook configurado!' });
});

// QR Code do WhatsApp
app.get('/api/integrations/whatsapp/qr', authMiddleware, async (req, res) => {
  const qr = await getQRCode();
  res.json(qr);
});

// ==============================
// SIMULADOR DE TESTE
// Envia mensagem de teste sem precisar de TG/WA conectados
// ==============================
app.post('/api/test/message', authMiddleware, async (req, res) => {
  const { platform = 'test', userId = 'test_user', name = 'Usuário Teste', message } = req.body;
  if (!message) return res.status(400).json({ error: 'message obrigatório' });

  const response = await processMessage(platform, userId, name, message);
  res.json({ message, response });
});

// ==============================
// PAINEL ADMIN (SPA)
// ==============================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==============================
// INICIALIZAÇÃO
// ==============================
app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════╗
║         ZK00 AGENT — ONLINE          ║
╠═══════════════════════════════════════╣
║  Porta: ${PORT}                           ║
║  Painel: http://localhost:${PORT}        ║
╠═══════════════════════════════════════╣
║  Status das integrações:             ║
║  • Telegram: ${process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN.includes('COLOQUE') ? '✅ Configurado' : '⚠️  Aguardando token'}       ║
║  • WhatsApp: ${process.env.EVOLUTION_API_URL && !process.env.EVOLUTION_API_URL.includes('SUA_EVOLUTION') ? '✅ Configurado' : '⚠️  Aguardando URL  '}       ║
║  • Claude AI: ${process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('COLOQUE') ? '✅ Configurado' : '⚠️  Aguardando key '}      ║
╚═══════════════════════════════════════╝
  `);

  // Configura webhooks se URLs estiverem disponíveis
  const serverUrl = process.env.SERVER_URL;
  if (serverUrl && !serverUrl.includes('SEU_APP')) {
    await setupTelegramWebhook(serverUrl);
    await setupWAWebhook(serverUrl);
  }
});

module.exports = app;
