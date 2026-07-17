require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./database');
const userbot = require('./userbot');
const userbotManager = require('./userbot-manager');
const { handleWebhook: handleWAWebhook, setupWebhook: setupWAWebhook, sendManual: sendWA, getQRCode } = require('./whatsapp');
const { processMessage } = require('./agent');
const broadcast = require('./broadcast');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const adminPass = process.env.ADMIN_PASSWORD || 'zk00admin123';

  // 1. Senha admin direta
  if (token === adminPass) {
    req.user = { id: 'admin', username: 'admin', name: 'FM', role: 'admin', isAdmin: true };
    return next();
  }

  // 2. Token base64 "username:password"
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx > 0) {
      const username = decoded.substring(0, colonIdx);
      const password = decoded.substring(colonIdx + 1);
      const user = db.getUserByCredentials(username, password);
      if (user) {
        req.user = user;
        return next();
      }
    }
  } catch(e) {}

  // 3. Token = "username:password" texto puro (fallback)
  try {
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const username = token.substring(0, colonIdx);
      const password = token.substring(colonIdx + 1);
      const user = db.getUserByCredentials(username, password);
      if (user) {
        req.user = user;
        return next();
      }
    }
  } catch(e) {}

  console.log('[AUTH] Token rejeitado:', token.substring(0, 20) + '...');
  return res.status(401).json({ error: 'Não autorizado — faça login novamente' });
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
  const { username, password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });

  const user = db.getUserByCredentials(username || 'admin', password);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos' });

  // Gera token base64: "username:password"
  const token = Buffer.from(`${user.username}:${password}`).toString('base64');
  res.json({
    success: true,
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role }
  });
});

// ==============================
// USUÁRIOS DO PAINEL
// ==============================
app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.getUsers().map(u => ({ ...u, password: undefined }));
  res.json(users);
});

app.post('/api/users', authMiddleware, (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });
  const result = db.addUser({ username, password, name });
  if (result.error) return res.status(400).json(result);
  res.json({ ...result, password: undefined });
});

app.patch('/api/users/:id', authMiddleware, (req, res) => {
  const result = db.updateUser(req.params.id, req.body);
  if (result.error) return res.status(404).json(result);
  res.json({ ...result, password: undefined });
});

app.delete('/api/users/:id', authMiddleware, (req, res) => {
  db.deleteUser(req.params.id);
  res.json({ success: true });
});

// Retorna dados do usuário logado
app.get('/api/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// ==============================
// DASHBOARD
// ==============================
app.get('/api/stats', authMiddleware, (req, res) => {
  const accountId = req.user?.isAdmin ? null : req.user?.id;
  const stats = db.getStats(req.user?.isAdmin ? null : req.user?.id);
  res.json({ ...stats, uptime: process.uptime() });
});

app.get('/api/conversations', authMiddleware, (req, res) => {
  const isAdmin = req.user?.isAdmin;
  const ownerId = isAdmin ? null : req.user?.id;
  const convs = db.getRecentConversations(100, ownerId);
  console.log(`[CONV API] user:${req.user?.username} isAdmin:${isAdmin} ownerId:${ownerId} returning:${convs.length}`);
  // Debug: show all conversation keys in DB
  const allKeys = Object.keys(db.getSettings ? [] : []);
  res.json(convs);
});

app.get('/api/conversations/:platform/:userId', authMiddleware, (req, res) => {
  const { platform, userId } = req.params;
  res.json({ history: db.getHistory(platform, userId), client: db.getClient(platform, userId) });
});

app.post('/api/send', authMiddleware, async (req, res) => {
  const { platform, userId, message } = req.body;
  if (!platform || !userId || !message) return res.status(400).json({ error: 'Dados incompletos' });
  try {
    if (platform.startsWith('telegram_') || platform === 'telegram') {
      const accountId = platform.startsWith('telegram_') ? platform.replace('telegram_', '') : null;
      console.log(`[SEND] platform=${platform} accountId=${accountId} userId=${userId}`);
      console.log(`[SEND] activeClients keys:`, Object.keys(userbotManager.activeClients));
      console.log(`[SEND] userbot connected:`, userbot.getStatus().connected);

      // Tenta enviar em todas as contas ativas que tiverem esse userId
      let sent = false;

      // 1. Tenta pela conta específica do manager
      if (accountId && userbotManager.activeClients[accountId]?.isConnected) {
        await userbotManager.sendManual(accountId, userId, message);
        console.log(`[SEND] Enviado via manager account ${accountId}`);
        sent = true;
      }

      // 2. Tenta por qualquer conta ativa no manager
      if (!sent) {
        for (const [accId, ac] of Object.entries(userbotManager.activeClients)) {
          if (ac.isConnected) {
            try {
              await ac.client.sendMessage(parseInt(userId), { message });
              console.log(`[SEND] Enviado via manager conta ${accId}`);
              sent = true;
              break;
            } catch(e) { console.log(`[SEND] Falhou conta ${accId}:`, e.message); }
          }
        }
      }

      // 3. Fallback: userbot legado
      if (!sent) {
        console.log(`[SEND] Usando userbot legado`);
        await userbot.sendManual(userId, message);
        sent = true;
      }

    } else if (platform === 'whatsapp') {
      await sendWA(userId, message);
    }
    db.addMessage(platform, userId, 'agent', message);
    res.json({ success: true });
  } catch (err) {
    console.error('[SEND]', err.message);
    res.status(500).json({ error: err.message });
  }
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
app.get('/api/clients', authMiddleware, (req, res) => {
  const accountId = req.user?.isAdmin ? null : req.user?.id;
  res.json(db.getAllClients(req.user?.isAdmin ? null : req.user?.id));
});
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
// MULTI-CONTA TELEGRAM
// ==============================

// Lista contas — admin vê todas, usuário vê só a dele
app.get('/api/accounts', authMiddleware, (req, res) => {
  const all = userbotManager.getStatus();
  if (req.user?.isAdmin) return res.json(all);
  // Usuário comum — só vê a conta vinculada a ele
  const user = db.getUsers().find(u => u.id === req.user?.id);
  if (!user) return res.json([]);
  const userAccountIds = user.accountIds || [];
  res.json(all.filter(a => userAccountIds.includes(a.id)));
});

// Inicia auth — gera accountId único por usuário
app.post('/api/accounts/start', authMiddleware, async (req, res) => {
  const { apiId, apiHash, name } = req.body;
  const accountId = req.user?.isAdmin
    ? (req.body.accountId || ('acc_' + Date.now()))
    : ('acc_' + req.user.id);
  if (!apiId || !apiHash) return res.status(400).json({ error: 'apiId e apiHash obrigatórios' });
  const result = await userbotManager.startAuth(accountId, apiId, apiHash, name || req.user?.name);
  // Retorna o accountId para o frontend usar nas próximas etapas
  res.json({ ...result, accountId });
});

// Rota combinada: inicia auth + envia telefone em UMA chamada (resolve problema de restart)
app.post('/api/accounts/:accountId/start-and-phone', authMiddleware, async (req, res) => {
  const { apiId, apiHash, name, phone } = req.body;
  if (!apiId || !apiHash || !phone) return res.status(400).json({ error: 'apiId, apiHash e phone obrigatórios' });
  const result = await userbotManager.startAuthAndPhone(req.params.accountId, apiId, apiHash, name, phone);
  res.json(result);
});

// Envia telefone
app.post('/api/accounts/:accountId/phone', authMiddleware, async (req, res) => {
  res.json(await userbotManager.sendPhone(req.params.accountId, req.body.phone));
});

// Envia código — após autenticar, vincula conta ao usuário
app.post('/api/accounts/:accountId/code', authMiddleware, async (req, res) => {
  const result = await userbotManager.sendCode(req.params.accountId, req.body.code);
  // Se autenticou com sucesso, vincula ao usuário (admin ou não)
  if (result.success && result.step === 'done') {
    const accountId = req.params.accountId;
    if (!req.user?.isAdmin && req.user?.id) {
      // Usuário comum — vincula à conta dele
      const user = db.getUsers().find(u => u.id === req.user.id);
      const currentIds = user?.accountIds || [];
      if (!currentIds.includes(accountId)) {
        db.updateUser(req.user.id, { accountIds: [...currentIds, accountId] });
      }
      console.log(`[AUTH] Conta ${accountId} vinculada ao usuário ${req.user.username}`);
    }
    // Para admin: salva o accountId nas settings para rastreamento
    const settings = db.getSettings();
    const adminAccounts = settings.adminAccountIds || [];
    if (!adminAccounts.includes(accountId)) {
      db.updateSettings({ adminAccountIds: [...adminAccounts, accountId] });
    }
  }
  res.json(result);
});

// Envia senha 2FA — após autenticar, vincula conta ao usuário
app.post('/api/accounts/:accountId/password', authMiddleware, async (req, res) => {
  const result = await userbotManager.sendPassword(req.params.accountId, req.body.password);
  if (result.success && result.step === 'done' && !req.user?.isAdmin) {
    db.updateUser(req.user.id, {
      accountIds: [req.params.accountId]
    });
  }
  res.json(result);
});

// Remove uma conta
app.delete('/api/accounts/:accountId', authMiddleware, (req, res) => {
  userbotManager.removeAccount(req.params.accountId);
  res.json({ success: true });
});

// Toggle ativo/inativo
app.patch('/api/accounts/:accountId', authMiddleware, (req, res) => {
  const accounts = userbotManager.getAccounts();
  const acc = accounts.find(a => a.id === req.params.accountId);
  if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
  userbotManager.addOrUpdateAccount({ ...acc, active: req.body.active });
  res.json({ success: true });
});

// Envia mensagem manual por conta específica
app.post('/api/accounts/:accountId/send', authMiddleware, async (req, res) => {
  const { userId, message } = req.body;
  await userbotManager.sendManual(req.params.accountId, userId, message);
  res.json({ success: true });
});

// ==============================
// USERBOT TELEGRAM — AUTENTICAÇÃO (legado — conta principal)
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
// ANALISADOR DE CONVERSAS
// ==============================
app.post('/api/analyze-conversations', authMiddleware, async (req, res) => {
  const { prompt, messageCount } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.includes('COLOQUE')) {
    return res.status(400).json({ error: 'API key não configurada' });
  }

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 30000
      }
    );

    const text = response.data.content[0].text;
    // Extrai JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Formato inválido na resposta da IA' });

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    console.error('[ANALYZER]', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// BROADCAST — DISPARO EM MASSA
// ==============================

// Função de envio unificada (Telegram + WhatsApp)
async function broadcastSendFn(platform, userId, message, imageUrl) {
  if (platform.startsWith('telegram')) {
    // Pega o cliente certo pelo accountId
    const accountId = platform.replace('telegram_', '');
    const ac = userbotManager.activeClients[accountId];
    const legacyClient = userbot.getClient ? userbot.getClient() : null;

    const client = (ac?.client) || legacyClient;
    if (!client) throw new Error('Cliente Telegram não conectado');

    if (imageUrl) {
      await client.sendFile(parseInt(userId), {
        file: imageUrl,
        caption: message
      });
    } else {
      await client.sendMessage(parseInt(userId), { message });
    }
  } else if (platform === 'whatsapp') {
    const { sendManual } = require('./whatsapp');
    await sendManual(userId, message);
  }
}

// Preview dos leads antes de disparar
app.post('/api/broadcast/preview', authMiddleware, (req, res) => {
  const result = broadcast.previewLeads(req.body.filters || {});
  res.json(result);
});

// Inicia o disparo
app.post('/api/broadcast/start', authMiddleware, async (req, res) => {
  const { message, imageUrl, filters } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });
  const result = await broadcast.startBroadcast({
    message,
    imageUrl,
    filters: filters || {},
    sendFn: broadcastSendFn
  });
  res.json(result);
});

// Status do disparo em andamento
app.get('/api/broadcast/status', authMiddleware, (req, res) => {
  res.json(broadcast.getStatus());
});

// Aborta o disparo
app.post('/api/broadcast/abort', authMiddleware, (req, res) => {
  res.json(broadcast.abort());
});

// Vincula uma conta Telegram a um usuário manualmente (admin)
app.post('/api/users/:userId/link-account', authMiddleware, (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'accountId obrigatório' });
  const user = db.getUsers().find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const currentIds = user.accountIds || [];
  if (!currentIds.includes(accountId)) {
    db.updateUser(req.params.userId, { accountIds: [...currentIds, accountId] });
  }
  res.json({ success: true, accountIds: [...currentIds, accountId] });
});

// ==============================
// BACKUP & RESTORE
// ==============================
app.get('/api/backup', authMiddleware, (req, res) => {
  const backup = db.exportBackup();
  res.setHeader('Content-Disposition', 'attachment; filename=zk00-backup.json');
  res.setHeader('Content-Type', 'application/json');
  res.json(backup);
});

app.post('/api/restore', authMiddleware, (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    db.importBackup(data);
    res.json({ success: true, message: 'Backup restaurado com sucesso!' });
  } catch (e) {
    console.error('[RESTORE]', e);
    res.status(500).json({ error: e.message });
  }
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

  // Inicia todas as contas do manager
  await userbotManager.initAll();

  // Fallback: conta legada (sessão única)
  const settings = db.getSettings();
  const savedSession = process.env.TELEGRAM_SESSION || settings.telegramSession || '';
  if (savedSession && savedSession.length > 10 && userbotManager.getAccounts().length === 0) {
    process.env.TELEGRAM_SESSION = savedSession;
    console.log('[SERVER] Sessão legada encontrada — iniciando userbot principal...');
    await userbot.initUserbot();
  }

  // WhatsApp
  const serverUrl = process.env.SERVER_URL;
  if (serverUrl && !serverUrl.includes('SEU_APP')) {
    await setupWAWebhook(serverUrl);
  }
});

module.exports = app;
