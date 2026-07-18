// ============================================
// SESSIONS — Armazenamento permanente de sessões
// Completamente separado do banco de dados
// Não é afetado por backup/restore
// ============================================

const fs = require('fs');
const path = require('path');

// Arquivo separado do banco principal
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
    console.log(`[SESSIONS] ✅ Arquivo: ${SESSION_FILE} | Sessões salvas: ${count}`);
    if (count > 0) console.log(`[SESSIONS] Contas: ${Object.values(existing).map(s=>s.name).join(', ')}`);
    break;
  } catch(e) { console.log(`[SESSIONS] Dir ${dir} falhou:`, e.message); }
}

// Carrega sessões salvas
function loadSessions() {
  if (!SESSION_FILE) return {};
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
  } catch(e) { console.error('[SESSIONS] Erro ao carregar:', e.message); }
  return {};
}

// Salva sessões
function saveSessions(sessions) {
  if (!SESSION_FILE) return;
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch(e) { console.error('[SESSIONS] Erro ao salvar:', e.message); }
}

// Salva uma sessão específica
function saveSession(accountId, sessionData) {
  const sessions = loadSessions();
  sessions[accountId] = {
    ...sessionData,
    updatedAt: new Date().toISOString()
  };
  saveSessions(sessions);
  console.log(`[SESSIONS] ✅ Sessão salva: ${accountId} (${sessionData.name})`);
}

// Busca uma sessão específica
function getSession(accountId) {
  const sessions = loadSessions();
  return sessions[accountId] || null;
}

// Lista todas as sessões salvas
function getAllSessions() {
  return loadSessions();
}

// Remove uma sessão
function removeSession(accountId) {
  const sessions = loadSessions();
  if (sessions[accountId]) {
    delete sessions[accountId];
    saveSessions(sessions);
    console.log(`[SESSIONS] Sessão removida: ${accountId}`);
  }
}

// Atualiza só a string de sessão (após renovação automática)
function updateSessionString(accountId, sessionString) {
  const sessions = loadSessions();
  if (sessions[accountId]) {
    sessions[accountId].session = sessionString;
    sessions[accountId].updatedAt = new Date().toISOString();
    saveSessions(sessions);
  }
}

module.exports = {
  saveSession,
  getSession,
  getAllSessions,
  removeSession,
  updateSessionString
};
