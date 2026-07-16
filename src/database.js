// ============================================
// DATABASE — ZK00 Agent
// Banco persistente com dados fixos embutidos
// Usa arquivo JSON + fallback para memória
// ============================================

const path = require('path');
const fs = require('fs');

// Tenta salvar em /data (Railway Volume) ou /tmp como fallback
const DATA_DIRS = [
  '/data',
  path.join(__dirname, '../data'),
  '/tmp/zk00data'
];

let DATA_DIR = null;
let DB_PATH = null;

// Encontra um diretório gravável
for (const dir of DATA_DIRS) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const testFile = path.join(dir, '.write_test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    DATA_DIR = dir;
    DB_PATH = path.join(dir, 'zk00.json');
    console.log(`[DB] Usando diretório: ${dir}`);
    break;
  } catch (e) {
    console.log(`[DB] Diretório ${dir} não gravável, tentando próximo...`);
  }
}

// ==============================
// DADOS FIXOS — nunca se perdem
// Seus dados reais já estão aqui
// ==============================
const FIXED_KNOWLEDGE = [
  {
    id: 'k1', type: 'faq',
    trigger: ['como funciona', 'o que é', 'robô', 'sinais', 'bac bo'],
    question: 'Como funciona o robô de sinais?',
    answer: 'O robô analisa padrões em tempo real no Bac Bo e manda os sinais direto aqui, 24h por dia. Você só segue e aposta. Tamo junto! 🎯'
  },
  {
    id: 'k2', type: 'faq',
    trigger: ['deposito', 'depósito', 'como entrar', 'cadastro', 'cadastrar'],
    question: 'Como faço o depósito e entro no grupo?',
    answer: 'Simples! Você se cadastra na casa parceira pelo meu link, faz o depósito e me manda o print do saldo. Aí te coloco no VIP na hora. Fica tranquilo que te explico tudo! 📲'
  },
  {
    id: 'k3', type: 'faq',
    trigger: ['vip', 'grupo vip', 'grupo'],
    question: 'O que é o Grupo VIP?',
    answer: 'No VIP você recebe os sinais em primeira mão, análise completa das entradas e suporte direto. É onde estão os membros mais ativos. Bora pra cima! 🏆'
  },
  {
    id: 'k4', type: 'faq',
    trigger: ['live', 'horario', 'horário', 'quando', 'transmissão'],
    question: 'Qual o horário das lives?',
    answer: 'As lives acontecem de segunda a sexta a partir das 20h no canal do Telegram. Fica de olho lá que aviso sempre antes de começar! 🕐'
  },
  {
    id: 'k5', type: 'faq',
    trigger: ['saque', 'retirar', 'sacar'],
    question: 'Como faço o saque?',
    answer: 'O saque é direto pela plataforma da casa. Normalmente cai em até 24h úteis. Qualquer problema me chama que ajudamos! 💰'
  },
  {
    id: 'k6', type: 'faq',
    trigger: ['gratis', 'gratuito', 'free', 'grupo free'],
    question: 'Tem grupo gratuito?',
    answer: 'Sim! Temos o grupo free onde mando alguns sinais e conteúdo. Mas no VIP a qualidade e quantidade de sinais é muito maior. Me manda mensagem que te passo o link do free! 👊'
  },
  {
    id: 'k7', type: 'faq',
    trigger: ['seguro', 'confiavel', 'funciona mesmo', 'prova'],
    question: 'É confiável?',
    answer: 'Vou ser direto: todo jogo tem risco e eu nunca prometo ganho garantido. O que posso te mostrar são os resultados reais dos membros que seguem os sinais. Quer ver os prints? 📊'
  },
  {
    id: 'k8', type: 'faq',
    trigger: ['link', 'casa', 'plataforma', 'onde jogar', 'qual casa'],
    question: 'Qual a casa de apostas?',
    answer: 'Trabalhamos com casas parceiras regulamentadas. Me manda mensagem que te passo o link com o bônus de cadastro! 🔗'
  },
  {
    id: 'k9', type: 'faq',
    trigger: ['dobra', 'dobra de banca', 'operar junto', 'garantia de banca', 'opera comigo', 'operar comigo', 'sessao ao vivo', 'dobrar banca', 'quero dobra', 'dobra banca'],
    question: 'O que é a Dobra de Banca?',
    answer: 'A Dobra de Banca é um programa exclusivo e bem diferente. Não é um grupo — é uma seleção individual. Eu escolho pessoalmente quem vai operar comigo ao vivo. Você opera com seu capital, eu com o meu, usando minhas análises em tempo real. E o diferencial: se você perder na sessão, eu devolvo o valor. Eu assumo o risco. As vagas são bem limitadas porque eu preciso acompanhar cada pessoa de perto. Pra ser avaliado, você precisa se cadastrar na casa parceira, fazer um depósito e me mandar o print do saldo aqui.',
    context: 'A Dobra de Banca NÃO é um grupo. É um programa de seleção individual feita pelo Rodrigo. Cada pessoa é escolhida pessoalmente. O aluno opera com seu próprio capital, Rodrigo opera com o dele. Rodrigo dá garantia: se o aluno perder na sessão, Rodrigo devolve o valor perdido. As vagas são extremamente limitadas porque Rodrigo precisa operar junto com cada pessoa selecionada.',
    objective: 'Fazer o lead entender que é algo exclusivo e pessoal, não um grupo. Gerar desejo e senso de privilégio por ser selecionado. Levar o lead a querer ser avaliado e mandar o print do saldo para participar da seleção.'
  },
  {
    id: 'k10', type: 'faq',
    trigger: ['como participar', 'quero participar', 'como entrar dobra', 'quero operar', 'proxima sessao', 'como sou selecionado'],
    question: 'Como participar da Dobra de Banca?',
    answer: 'Pra ser avaliado para a Dobra é simples: se cadastra na casa parceira pelo meu link, faz o depósito e me manda o print do saldo aqui. Eu analiso o perfil e, se você for selecionado, te chamo pessoalmente para a próxima sessão.',
    context: 'A seleção é feita pelo Rodrigo com base no perfil do lead. Não é automático — Rodrigo avalia cada pessoa individualmente antes de selecionar.',
    objective: 'Levar o lead ao próximo passo concreto: se cadastrar na casa parceira e mandar o print do saldo para ser avaliado por Rodrigo.'
  }
];

const FIXED_SETTINGS = {
  agentName: 'Rodrigo ZK00',
  agentActive: true,
  humanModeChats: [],
  liveSchedule: 'Segunda a Sexta, 20h',
  welcomeMessage: 'Oi! Tamo junto 👊 Vi que você chegou aqui, como posso te ajudar?',
  offlineMessage: 'Oi! Estou offline agora mas já volto. Pode deixar sua mensagem que respondo em breve! 🤝',
  escalationTriggers: [
    'problema financeiro', 'conta bloqueada', 'bloqueou', 'bloquearam',
    'parceria', 'patrocínio', 'jurídico', 'advogado', 'processo',
    'reclamação grave', 'me enganou', 'golpe', 'fraude', 'chargeBack'
  ],
  followupRules: [
    {
      id: 'fu1',
      name: 'Print não enviado — Dobra de Banca',
      active: true,
      triggerKnowledgeIds: ['k9', 'k10'],
      cancelOn: 'photo',
      delay: 10,
      message: 'Oi! Só passando pra lembrar que ainda preciso do print com seu saldo pra te avaliar pra Dobra. Me manda aqui quando puder! 📲'
    },
    {
      id: 'fu2',
      name: 'Print não enviado — VIP',
      active: true,
      triggerKnowledgeIds: ['k2', 'k3'],
      cancelOn: 'photo',
      delay: 10,
      message: 'Ei, tudo certo? Lembra que pra entrar no VIP só precisamos do print do saldo. Me manda aqui e já te coloco na lista! 🔗'
    }
  ],
  photoResponses: [
    {
      id: 'pr1',
      name: 'Print recebido — Dobra de Banca',
      active: true,
      linkedKnowledgeIds: ['k9', 'k10'],
      message: 'Boa! Print recebido ✅ Agora é só aguardar — vou avaliar seu perfil e, se você for selecionado, te chamo pessoalmente antes da próxima sessão. Fique de olho!'
    },
    {
      id: 'pr2',
      name: 'Print recebido — VIP',
      active: true,
      linkedKnowledgeIds: ['k2', 'k3'],
      message: 'Print recebido! ✅ Perfeito. Já vou confirmar e te adicionar no VIP. Fique ligado que te chamo em breve!'
    }
  ]
};

// Estrutura base do banco
function getDefaultDB() {
  return {
    clients: {},
    conversations: {},
    knowledge: JSON.parse(JSON.stringify(FIXED_KNOWLEDGE)),
    settings: JSON.parse(JSON.stringify(FIXED_SETTINGS))
  };
}

// ==============================
// CARREGA O BANCO
// ==============================
function loadDB() {
  if (DB_PATH) {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const saved = JSON.parse(raw);

        // Garante que o knowledge fixo sempre está presente
        // Adiciona itens fixos que não existem no banco salvo
        const savedIds = (saved.knowledge || []).map(k => k.id);
        for (const item of FIXED_KNOWLEDGE) {
          if (!savedIds.includes(item.id)) {
            saved.knowledge = saved.knowledge || [];
            saved.knowledge.push(item);
          }
        }

        // Garante estrutura de settings com fallback para valores fixos
        saved.settings = { ...FIXED_SETTINGS, ...saved.settings };

        console.log(`[DB] Banco carregado: ${saved.knowledge.length} conhecimentos, ${Object.keys(saved.clients || {}).length} clientes`);
        return saved;
      }
    } catch (e) {
      console.error('[DB] Erro ao carregar banco:', e.message);
    }
  }
  console.log('[DB] Iniciando banco novo com dados padrão');
  return getDefaultDB();
}

// ==============================
// SALVA O BANCO
// ==============================
function saveDB(db) {
  if (!DB_PATH) {
    // Sem diretório gravável — só memória
    return;
  }
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('[DB] Erro ao salvar:', e.message);
  }
}

// Banco em memória
let db = loadDB();

// Salva a cada 30 segundos automaticamente (proteção extra)
setInterval(() => saveDB(db), 30000);

// ==============================
// CLIENTS
// ==============================
function getClient(platform, userId) {
  return db.clients[`${platform}_${userId}`] || null;
}

function saveClient(platform, userId, data) {
  const key = `${platform}_${userId}`;
  db.clients[key] = {
    ...db.clients[key],
    ...data,
    platform,
    userId,
    updatedAt: new Date().toISOString()
  };
  if (!db.clients[key].createdAt) db.clients[key].createdAt = new Date().toISOString();
  saveDB(db);
  return db.clients[key];
}

function getAllClients() {
  return Object.values(db.clients).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// ==============================
// CONVERSATIONS
// ==============================
function getHistory(platform, userId) {
  return db.conversations[`${platform}_${userId}`] || [];
}

function addMessage(platform, userId, role, content) {
  const key = `${platform}_${userId}`;
  if (!db.conversations[key]) db.conversations[key] = [];
  db.conversations[key].push({ role, content, timestamp: new Date().toISOString() });
  if (db.conversations[key].length > 40) {
    db.conversations[key] = db.conversations[key].slice(-40);
  }
  saveDB(db);
}

function getRecentConversations(limit = 20) {
  const result = [];
  for (const [key, msgs] of Object.entries(db.conversations)) {
    if (!msgs.length) continue;
    const [platform, ...rest] = key.split('_');
    const userId = rest.join('_');
    const client = db.clients[key] || {};
    const last = msgs[msgs.length - 1];
    result.push({
      key, platform, userId,
      clientName: client.name || userId,
      lastMessage: last.content,
      lastRole: last.role,
      lastTime: last.timestamp,
      unread: msgs.filter(m => m.role === 'user' && !m.read).length,
      isHumanMode: (db.settings.humanModeChats || []).includes(key),
      flag: client.flag || null
    });
  }
  return result.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime)).slice(0, limit);
}

// ==============================
// KNOWLEDGE
// ==============================
function searchKnowledge(text) {
  const lower = text.toLowerCase();
  for (const item of db.knowledge) {
    if (item.trigger && item.trigger.some(t => lower.includes(t.toLowerCase()))) {
      return item;
    }
  }
  return null;
}

function getAllKnowledge() { return db.knowledge; }

function addKnowledge(item) {
  const newItem = {
    id: item.id || ('k' + Date.now()),
    ...item,
    updatedAt: new Date().toISOString()
  };
  if (!newItem.createdAt) newItem.createdAt = new Date().toISOString();

  // Se tem ID existente, substitui
  const idx = db.knowledge.findIndex(k => k.id === newItem.id);
  if (idx >= 0) db.knowledge[idx] = newItem;
  else db.knowledge.push(newItem);

  saveDB(db);
  return newItem;
}

function deleteKnowledge(id) {
  db.knowledge = db.knowledge.filter(k => k.id !== id);
  saveDB(db);
}

// ==============================
// SETTINGS
// ==============================
function getSettings() { return db.settings; }

function updateSettings(updates) {
  db.settings = { ...db.settings, ...updates };
  saveDB(db);
  return db.settings;
}

function isHumanMode(platform, userId) {
  return (db.settings.humanModeChats || []).includes(`${platform}_${userId}`);
}

function setHumanMode(platform, userId, active) {
  const key = `${platform}_${userId}`;
  if (!db.settings.humanModeChats) db.settings.humanModeChats = [];
  if (active && !db.settings.humanModeChats.includes(key)) {
    db.settings.humanModeChats.push(key);
  } else if (!active) {
    db.settings.humanModeChats = db.settings.humanModeChats.filter(k => k !== key);
  }
  saveDB(db);
}

function flagConversation(platform, userId, flag) {
  const key = `${platform}_${userId}`;
  if (!db.clients[key]) db.clients[key] = { platform, userId };
  db.clients[key].flag = flag;
  saveDB(db);
}

// ==============================
// STATS
// ==============================
function getStats() {
  const allMsgs = Object.values(db.conversations).flat();
  const today = new Date().toDateString();
  const todayMsgs = allMsgs.filter(m => new Date(m.timestamp).toDateString() === today);
  return {
    totalClients: Object.keys(db.clients).length,
    totalConversations: Object.keys(db.conversations).length,
    totalMessages: allMsgs.length,
    todayMessages: todayMsgs.length,
    todayConversations: Object.values(db.conversations).filter(msgs =>
      msgs.some(m => new Date(m.timestamp).toDateString() === today)
    ).length,
    agentActive: db.settings.agentActive,
    humanModeCount: (db.settings.humanModeChats || []).length
  };
}

// ==============================
// USUÁRIOS DO PAINEL
// ==============================
function getUsers() {
  return db.settings.panelUsers || [];
}

function saveUsers(users) {
  db.settings.panelUsers = users;
  saveDB(db);
}

function getUserByCredentials(username, password) {
  // Admin master sempre funciona
  const adminPass = process.env.ADMIN_PASSWORD || 'zk00admin123';
  if (password === adminPass && (username === 'admin' || username === 'rodrigo' || !username)) {
    return { id: 'admin', username: 'admin', name: 'Rodrigo ZK00', role: 'admin', isAdmin: true };
  }
  // Busca nos usuários cadastrados
  const users = getUsers();
  return users.find(u => u.username === username && u.password === password && u.active !== false) || null;
}

function addUser(user) {
  // Garante que panelUsers existe no settings
  if (!db.settings.panelUsers) db.settings.panelUsers = [];

  const users = db.settings.panelUsers;
  if (users.find(u => u.username === user.username)) {
    return { error: 'Username já existe' };
  }
  const newUser = {
    id: 'usr_' + Date.now(),
    username: user.username,
    password: user.password,
    name: user.name || user.username,
    role: user.role || 'operator',
    active: true,
    createdAt: new Date().toISOString()
  };
  db.settings.panelUsers.push(newUser);
  saveDB(db);
  console.log('[DB] Usuário criado:', newUser.username);
  return newUser;
}

function updateUser(id, data) {
  if (!db.settings.panelUsers) db.settings.panelUsers = [];
  const idx = db.settings.panelUsers.findIndex(u => u.id === id);
  if (idx < 0) return { error: 'Usuário não encontrado' };
  db.settings.panelUsers[idx] = { ...db.settings.panelUsers[idx], ...data };
  saveDB(db);
  return db.settings.panelUsers[idx];
}

function deleteUser(id) {
  if (!db.settings.panelUsers) return;
  db.settings.panelUsers = db.settings.panelUsers.filter(u => u.id !== id);
  saveDB(db);
}

// Exporta backup completo
function exportBackup() {
  return JSON.parse(JSON.stringify(db));
}

// Importa backup
function importBackup(data) {
  if (data.knowledge) db.knowledge = data.knowledge;
  if (data.settings) db.settings = { ...FIXED_SETTINGS, ...data.settings };
  if (data.clients) db.clients = data.clients;
  if (data.conversations) db.conversations = data.conversations;
  saveDB(db);
}

module.exports = {
  getClient, saveClient, getAllClients,
  getUsers, getUserByCredentials, addUser, updateUser, deleteUser,
  getHistory, addMessage, getRecentConversations,
  searchKnowledge, getAllKnowledge, addKnowledge, deleteKnowledge,
  getSettings, updateSettings, isHumanMode, setHumanMode,
  flagConversation, getStats, exportBackup, importBackup
};
