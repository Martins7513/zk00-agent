// ============================================
// SESSIONS — Armazenamento via Railway API
// As sessões ficam nas variáveis de ambiente
// e NUNCA somem com redeploys
// ============================================

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Arquivo local como cache ──
const SESSION_DIRS = ['/data', path.join(__dirname, '../data'), '/tmp/zk00data'];
let SESSION_FILE = null;
for (const dir of SESSION_DIRS) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const test = path.join(dir, '.sess_test');
    fs.writeFileSync(test, 'ok'); fs.unlinkSync(test);
    SESSION_FILE = path.join(dir, 'tg_sessions.json');
    break;
  } catch(e) {}
}

// ── Cache em memória ──
let memCache = {};

// ── Carrega do arquivo ──
function loadFromFile() {
  if (!SESSION_FILE) return {};
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
}

// ── Salva no arquivo ──
function saveToFile(sessions) {
  if (!SESSION_FILE) return;
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2)); } catch(e) {}
}

// ── Salva uma sessão ──
function saveSession(accountId, sessionData) {
  memCache[accountId] = { ...sessionData, updatedAt: new Date().toISOString() };
  const all = { ...loadFromFile(), [accountId]: memCache[accountId] };
  saveToFile(all);
  console.log(`[SESSIONS] ✅ Sessão salva: ${sessionData.name} (${accountId})`);
}

// ── Busca uma sessão ──
function getSession(accountId) {
  if (memCache[accountId]) return memCache[accountId];
  const all = loadFromFile();
  if (all[accountId]) { memCache[accountId] = all[accountId]; return all[accountId]; }
  return null;
}

// ── Lista todas ──
function getAllSessions() {
  const fromFile = loadFromFile();
  memCache = { ...fromFile, ...memCache };
  return memCache;
}

// ── Remove ──
function removeSession(accountId) {
  delete memCache[accountId];
  const all = loadFromFile();
  delete all[accountId];
  saveToFile(all);
}

// ── Atualiza string de sessão ──
function updateSessionString(accountId, sessionString) {
  if (memCache[accountId]) memCache[accountId].session = sessionString;
  const all = loadFromFile();
  if (all[accountId]) { all[accountId].session = sessionString; saveToFile(all); }
}

// ── Inicializa ──
memCache = loadFromFile();
const count = Object.keys(memCache).length;
console.log(`[SESSIONS] Arquivo: ${SESSION_FILE || 'N/A'} | Sessões: ${count}`);
if (count > 0) console.log(`[SESSIONS] Contas: ${Object.values(memCache).map(s=>s.name).join(', ')}`);

module.exports = { saveSession, getSession, getAllSessions, removeSession, updateSessionString };
