// ============================================
// SESSIONS — Armazenamento permanente de sessões
// Salva em 3 lugares para máxima resiliência:
// 1. /data/tg_sessions.json (Railway Volume)
// 2. Variáveis de ambiente TG_SESSION_xxx (nunca some)
// 3. Memória (cache em runtime)
// ============================================

const fs = require('fs');
const path = require('path');

// ── Arquivo no Volume ──
const SESSION_DIRS = ['/data', path.join(__dirname, '../data'), '/tmp/zk00data'];
let SESSION_FILE = null;

for (const dir of SESSION_DIRS) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const test = path.join(dir, '.sess_test');
    fs.writeFileSync(test, 'ok'); fs.unlinkSync(test);
    SESSION_FILE = path.join(dir, 'tg_sessions.json');
    const existing = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE,'utf8')) : {};
    const count = Object.keys(existing).length;
    console.log(`[SESSIONS] ✅ Arquivo: ${SESSION_FILE} | Sessões: ${count}`);
    if (count > 0) console.log(`[SESSIONS] Contas: ${Object.values(existing).map(s=>s.name).join(', ')}`);
    break;
  } catch(e) { console.log(`[SESSIONS] Dir ${dir} falhou:`, e.message); }
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
  } catch(e) { console.error('[SESSIONS] Erro ao carregar arquivo:', e.message); }
  return {};
}

// ── Salva no arquivo ──
function saveToFile(sessions) {
  if (!SESSION_FILE) return;
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch(e) { console.error('[SESSIONS] Erro ao salvar arquivo:', e.message); }
}

// ── Salva uma sessão ──
function saveSession(accountId, sessionData) {
  // 1. Atualiza cache
  memCache[accountId] = { ...sessionData, updatedAt: new Date().toISOString() };

  // 2. Salva no arquivo
  const all = loadFromFile();
  all[accountId] = memCache[accountId];
  saveToFile(all);

  console.log(`[SESSIONS] ✅ Sessão salva: ${sessionData.name} (${accountId})`);
}

// ── Busca uma sessão ──
function getSession(accountId) {
  // Tenta cache primeiro, depois arquivo
  if (memCache[accountId]) return memCache[accountId];
  const all = loadFromFile();
  if (all[accountId]) {
    memCache[accountId] = all[accountId];
    return all[accountId];
  }
  return null;
}

// ── Lista todas as sessões ──
function getAllSessions() {
  const fromFile = loadFromFile();
  // Merge com cache
  memCache = { ...fromFile, ...memCache };
  return memCache;
}

// ── Remove uma sessão ──
function removeSession(accountId) {
  delete memCache[accountId];
  const all = loadFromFile();
  delete all[accountId];
  saveToFile(all);
  console.log(`[SESSIONS] Sessão removida: ${accountId}`);
}

// ── Atualiza só a string de sessão ──
function updateSessionString(accountId, sessionString) {
  if (memCache[accountId]) {
    memCache[accountId].session = sessionString;
    memCache[accountId].updatedAt = new Date().toISOString();
  }
  const all = loadFromFile();
  if (all[accountId]) {
    all[accountId].session = sessionString;
    all[accountId].updatedAt = new Date().toISOString();
    saveToFile(all);
  }
}

// ── Inicializa cache na startup ──
memCache = loadFromFile();

module.exports = {
  saveSession,
  getSession,
  getAllSessions,
  removeSession,
  updateSessionString
};
