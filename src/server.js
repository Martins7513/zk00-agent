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
const ntfy = require('./ntfy');

// ── Verifica leads sem resposta a cada 2 minutos ──
const notifiedUnanswered = new Set();
setInterval(async () => {
  try {
    const convs = db.getRecentConversations(100, null);
    const now = Date.now();
    const TEN_MIN = 10 * 60 * 1000;

    for (const conv of convs) {
      if (!conv.lastTime) continue;
      if (conv.lastRole !== 'user') continue; // já respondido
      if (conv.isHumanMode) continue;

      const elapsed = now - new Date(conv.lastTime).getTime();
      const block = Math.floor(elapsed / TEN_MIN);
      const key = `${conv.key}_${block}`;

      if (elapsed >= TEN_MIN && !notifiedUnanswered.has(key)) {
        notifiedUnanswered.add(key);
        if (notifiedUnanswered.size > 200) notifiedUnanswered.clear();
        const mins = Math.floor(elapsed / 60000);
        await ntfy.notifyUnanswered(conv.clientName, mins, conv.platform);
      }
    }
  } catch(e) {}
}, 2 * 60 * 1000); // a cada 2 minutos

// ── Auto-restore: carrega dados do env var BOOTSTRAP_DATA na startup ──
(function autoRestore() {
  const bootstrap = process.env.BOOTSTRAP_DATA;
  if (!bootstrap) {
    console.log('[BOOTSTRAP] Sem BOOTSTRAP_DATA — usando banco local');
    return;
  }
  try {
    const data = JSON.parse(Buffer.from(bootstrap, 'base64').toString('utf8'));
    const bootstrapUsers = data.settings?.panelUsers || [];
    const bootstrapAccounts = data.settings?.telegramAccounts || [];
    const currentUsers = db.getUsers ? db.getUsers() : [];
    const currentAccounts = db.getSettings ? (db.getSettings().telegramAccounts || []) : [];

    console.log(`[BOOTSTRAP] Banco atual: ${currentUsers.length} usuários, ${currentAccounts.length} contas`);
    console.log(`[BOOTSTRAP] BOOTSTRAP_DATA: ${bootstrapUsers.length} usuários, ${bootstrapAccounts.length} contas`);

    // Merge: sempre garante que dados do bootstrap existam no banco
    let changed = false;

    // Restaura usuários que faltam
    for (const u of bootstrapUsers) {
      if (!currentUsers.find(x => x.username === u.username)) {
        db.addUser(u);
        console.log(`[BOOTSTRAP] ✅ Usuário restaurado: ${u.username}`);
        changed = true;
      }
    }

    // Restaura accountIds dos usuários
    for (const u of bootstrapUsers) {
      if (u.accountIds?.length) {
        const existing = db.getUsers().find(x => x.username === u.username);
        if (existing && (!existing.accountIds?.length)) {
          db.updateUser(existing.id, { accountIds: u.accountIds });
          console.log(`[BOOTSTRAP] ✅ AccountIds restaurados para: ${u.username}`);
          changed = true;
        }
      }
    }

    // Restaura contas Telegram que faltam
    for (const a of bootstrapAccounts) {
      if (!currentAccounts.find(x => x.id === a.id)) {
        const accs = db.getSettings().telegramAccounts || [];
        accs.push(a);
        db.updateSettings({ telegramAccounts: accs });
        console.log(`[BOOTSTRAP] ✅ Conta restaurada: ${a.name}`);
        changed = true;
      }
    }

    if (changed) {
      console.log('[BOOTSTRAP] ✅ Banco atualizado com dados do BOOTSTRAP_DATA');
    } else {
      console.log('[BOOTSTRAP] Banco já está completo — nenhuma restauração necessária');
    }
  } catch(e) { console.error('[BOOTSTRAP] Erro ao restaurar:', e.message); }
})();

// ── Configurar Ntfy ──
app.post('/api/ntfy/test', authMiddleware, async (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const result = await ntfy.sendNotification({
    title: '✅ Tele Agent conectado!',
    message: 'Notificações push configuradas com sucesso.',
    tags: ['white_check_mark']
  });
  res.json({ success: true, status: result });
});

// ── Rota para gerar o BOOTSTRAP_DATA ──
app.get('/api/bootstrap-export', authMiddleware, (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const backup = db.exportBackup();
  const encoded = Buffer.from(JSON.stringify(backup)).toString('base64');
  res.json({ success: true, value: encoded });
});

// ── Rota simples sem auth header — usa senha na URL ──
app.get('/bootstrap', (req, res) => {
  const pwd = req.query.pwd || req.query.token;
  if (pwd !== process.env.ADMIN_PASSWORD) {
    return res.send('<h2>Senha incorreta</h2>');
  }
  const backup = db.exportBackup();
  const encoded = Buffer.from(JSON.stringify(backup)).toString('base64');
  const users = (backup.settings?.panelUsers || []).map(u => u.username).join(', ') || 'nenhum';
  const accounts = (backup.settings?.telegramAccounts || []).map(a => a.name).join(', ') || 'nenhuma';
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Bootstrap Export</title>
<style>body{font-family:monospace;background:#09090b;color:#fafafa;padding:24px;margin:0}
.box{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-bottom:12px;max-width:700px}
textarea{width:100%;height:100px;background:#0a0a0c;border:1px solid #3f3f46;border-radius:8px;padding:10px;color:#22c55e;font-size:10px;font-family:monospace;box-sizing:border-box;resize:none}
button{background:#6366f1;border:none;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:700;margin-top:8px}
.ok{color:#22c55e}.warn{color:#eab308}</style>
</head>
<body>
<div class="box">
  <h2>🔒 Bootstrap Export</h2>
  <p class="${users !== 'nenhum' ? 'ok' : 'warn'}">Usuários: ${users}</p>
  <p class="${accounts !== 'nenhuma' ? 'ok' : 'warn'}">Contas: ${accounts}</p>
</div>
<div class="box">
  <p><strong>1.</strong> Copie o valor abaixo:</p>
  <textarea id="val" onclick="this.select()">${encoded}</textarea>
  <button onclick="navigator.clipboard.writeText(document.getElementById('val').value).then(()=>alert('Copiado! Cole no Railway → Variables → BOOTSTRAP_DATA'))">📋 Copiar</button>
  <p style="margin-top:12px;color:#a1a1aa;font-size:11px"><strong>2.</strong> Railway → Variables → BOOTSTRAP_DATA → cole → Save</p>
</div>
</body></html>`);
});

// ── Graceful shutdown: salva banco antes de fechar ──
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM recebido — salvando banco antes de fechar...');
  try {
    const backup = db.exportBackup();
    const fs = require('fs');
    const dirs = ['/data', require('path').join(__dirname, '../data')];
    for (const dir of dirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.writeFileSync(require('path').join(dir, 'zk00.json'), JSON.stringify(backup, null, 2));
          console.log(`[SERVER] ✅ Banco salvo em ${dir}/zk00.json`);
          break;
        }
      } catch(e) {}
    }
  } catch(e) { console.error('[SERVER] Erro ao salvar banco:', e.message); }
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGINT', () => process.emit('SIGTERM'));

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Rota mobile
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/mobile.html'));
});

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
app.patch('/api/knowledge/:id/toggle', authMiddleware, (req, res) => {
  const { active } = req.body;
  const result = db.toggleKnowledge(req.params.id, active);
  res.json(result);
});

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
  // Usuário comum — lê accountIds frescos do banco
  const freshUser = db.getUsers().find(u => u.id === req.user?.id);
  if (!freshUser) return res.json([]);
  const userAccountIds = Array.isArray(freshUser.accountIds) ? freshUser.accountIds : [];
  if (userAccountIds.length === 0) return res.json(all); // sem vinculo = vê tudo
  const filtered = all.filter(a => userAccountIds.includes(a.id));
  console.log(`[ACCOUNTS] ${req.user.username}: ids=${JSON.stringify(userAccountIds)} found=${filtered.length}/${all.length}`);
  res.json(filtered);
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
  // Se já autenticou direto (sem código), vincula ao usuário (APPEND)
  if (result.success && result.step === 'done' && req.user?.id) {
    const accountId = req.params.accountId;
    const freshUser = db.getUsers().find(u => u.id === req.user.id);
    if (freshUser) {
      const ids = Array.isArray(freshUser.accountIds) ? [...freshUser.accountIds] : [];
      if (!ids.includes(accountId)) ids.push(accountId);
      db.updateUser(req.user.id, { accountIds: ids });
      console.log(`[AUTH] start-and-phone: ${req.user.username} accountIds: ${JSON.stringify(ids)}`);
    }
  }
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
      // Usuário comum — vincula à conta dele (APPEND seguro)
      // Lê o usuário FRESCO do banco a cada vez
      const freshUsers = db.getUsers();
      const freshUser = freshUsers.find(u => u.id === req.user.id);
      if (freshUser) {
        const currentIds = Array.isArray(freshUser.accountIds) ? [...freshUser.accountIds] : [];
        console.log(`[AUTH] ${req.user.username} accountIds ANTES: ${JSON.stringify(currentIds)}`);
        if (!currentIds.includes(accountId)) {
          currentIds.push(accountId);
        }
        // Salva o array completo
        db.updateUser(req.user.id, { accountIds: currentIds });
        console.log(`[AUTH] ✅ ${req.user.username} accountIds DEPOIS: ${JSON.stringify(currentIds)}`);
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
    const u = db.getUsers().find(u => u.id === req.user.id);
    const ids = Array.isArray(u?.accountIds) ? [...u.accountIds] : [];
    if (!ids.includes(req.params.accountId)) ids.push(req.params.accountId);
    db.updateUser(req.user.id, { accountIds: ids });
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
  // Vincula conta legacy ao usuário (APPEND)
  if (result.success && req.user?.id && !req.user?.isAdmin) {
    const legacyAccountId = 'acc_legacy_main';
    const freshUser = db.getUsers().find(u => u.id === req.user.id);
    if (freshUser) {
      const ids = Array.isArray(freshUser.accountIds) ? [...freshUser.accountIds] : [];
      if (!ids.includes(legacyAccountId)) ids.push(legacyAccountId);
      db.updateUser(req.user.id, { accountIds: ids });
    }
  }
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
// DELETAR MENSAGEM
// ==============================
// Marca conversa como lida E remove flag de atenção
app.post('/api/conversations/:platform/:userId/read', authMiddleware, (req, res) => {
  db.markAsRead(req.params.platform, req.params.userId);
  db.flagConversation(req.params.platform, req.params.userId, null); // remove flag
  res.json({ success: true });
});

// Remove/seta flag de atenção
app.post('/api/flag', authMiddleware, (req, res) => {
  const { platform, userId, flag } = req.body;
  db.flagConversation(platform, userId, flag || null);
  res.json({ success: true });
});

app.delete('/api/messages/:platform/:userId/:msgIndex', authMiddleware, async (req, res) => {
  const { platform, userId, msgIndex } = req.params;
  const { forEveryone } = req.body || {};
  const idx = parseInt(msgIndex);

  try {
    const history = db.getHistory(platform, userId);
    const msg = history[idx];
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

    // Apaga no Telegram se for para todos
    if (forEveryone && platform.startsWith('telegram_')) {
      const accountId = platform.replace('telegram_', '');
      const ac = userbotManager.activeClients[accountId];
      const legacyClient = userbot.getClient ? userbot.getClient() : null;
      const client = ac?.client || legacyClient;

      if (client && msg.telegramMsgId) {
        try {
          await client.invoke(new (require('telegram/tl').Api.messages.DeleteMessages)({
            revoke: true,
            id: [msg.telegramMsgId]
          }));
        } catch(e) {
          console.log('[DELETE] Telegram delete failed:', e.message);
          // Continua mesmo se falhar no Telegram
        }
      }
    }

    // Remove do banco local
    db.deleteMessage(platform, userId, idx);
    res.json({ success: true });
  } catch(e) {
    console.error('[DELETE]', e);
    res.status(500).json({ error: e.message });
  }
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
