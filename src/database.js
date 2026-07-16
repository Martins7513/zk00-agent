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
    "id": "g1",
    "type": "faq",
    "trigger": [
      "dobra",
      "dobra minha",
      "dobra a minha",
      "dobra minha banca",
      "alavancagem",
      "quero a dobra",
      "operar junto",
      "dobrar minha banca",
      "faz a dobra",
      "dobra irmão"
    ],
    "question": "Dobra de Banca / Alavancagem",
    "answer": "Bora pra cima! Cria sua conta na plataforma, deposita e me manda o print da sua banca com saldo. Quando eu selecionar eu aviso.\n\nAqui ta o link que deve se cadastrar -\n\nhttps://cadastroplataforma.com/telegram",
    "context": "A Dobra de Banca (também chamada de Alavancagem) NÃO é um grupo. Ele escolhe pessoalmente quem vai participar da dobra. Se o lead perder na sessão, Zk devolve o valor. As vagas são extremamente limitadas.",
    "objective": "Fazer o lead entender que é uma seleção exclusiva e levá-lo a mandar o print do saldo para participar.",
    "followup": null,
    "updatedAt": "2026-07-16T02:36:00.386Z",
    "createdAt": "2026-07-16T02:36:00.386Z"
  },
  {
    "id": "g2",
    "type": "faq",
    "question": "Live / Horário das lives",
    "trigger": [
      "live",
      "horario",
      "horário",
      "que horas",
      "quando tem live",
      "vai ter live",
      "live hoje",
      "que hora",
      "hora da live",
      "live on",
      "tá ao vivo"
    ],
    "answer": "A live de  é às 11h e 19h no grupo Free. Fica de olho que aviso antes de começar! 🔥",
    "context": "Zk faz lives regulares no grupo Free e VIP. O horário padrão é  às 11h e 19h no grupo Free. Muita gente pergunta sobre horário antes de entrar no grupo.",
    "objective": "Informar o horário e aproveitar para convidar o lead a entrar no grupo VIP para ter acesso preferencial às lives.",
    "updatedAt": "2026-07-16T02:03:35.633Z",
    "createdAt": "2026-07-16T02:03:35.633Z"
  },
  {
    "id": "g3",
    "type": "faq",
    "question": "Grupo VIP — como funciona e valor",
    "trigger": [
      "vip",
      "grupo vip",
      "quanto custa vip",
      "valor vip",
      "quero vip",
      "entrar no vip",
      "vip mensal",
      "vip trimestral",
      "assinar vip"
    ],
    "answer": "O VIP tem acesso às lives ao vivo, sinais em primeira mão e suporte direto. R$100 mensal ou R$200 trimestral. Chama meu suporte @SuporteZKDADOS00 que ele te explica tudo!",
    "context": "O VIP custa R$100/mês ou R$200/trimestral. O pagamento é via Pix. O suporte é o @SuporteZKDADOS00. O VIP dá acesso às lives exclusivas, sinais antes do grupo free e suporte direto com Rodrigo.",
    "objective": "Passar os valores do VIP e direcionar o lead para o suporte @SuporteZKDADOS00 para fechar a venda.",
    "updatedAt": "2026-07-16T02:03:35.836Z",
    "createdAt": "2026-07-16T02:03:35.836Z"
  },
  {
    "id": "g4",
    "type": "faq",
    "question": "Como entrar no grupo / Free",
    "trigger": [
      "como entro",
      "como faço para entrar",
      "quero entrar",
      "grupo free",
      "grupo gratuito",
      "link do grupo",
      "como participar",
      "quero o grupo",
      "me add no grupo",
      "entrar no grupo"
    ],
    "answer": "O grupo free é por aqui mesmo! Me manda mensagem que te passo o link. No free tem sinais e lives abertas. Se quiser algo mais completo, temos o VIP também.",
    "context": "Existe um grupo Free gratuito com sinais limitados e um grupo VIP pago com mais recursos. Muita gente quer entrar no grupo sem saber qual é o certo. O objetivo é dar o link do free e apresentar o VIP como upgrade.",
    "objective": "Enviar o link do grupo free e apresentar o VIP como opção superior para converter o lead.",
    "updatedAt": "2026-07-16T02:03:36.040Z",
    "createdAt": "2026-07-16T02:03:36.040Z"
  },
  {
    "id": "g9",
    "type": "faq",
    "question": "Lead perdeu dinheiro",
    "trigger": [
      "perdi",
      "perder",
      "perda",
      "tô no prejuízo",
      "tô no preju",
      "perdi tudo",
      "fui de base",
      "zerou",
      "perdi minha banca",
      "tô perdendo"
    ],
    "answer": "Cara, isso faz parte do jogo. Todo mundo passa por isso. O importante é não forçar quando a maré tá ruim. Para, respira, e volta quando sentir que tá no momento certo. Tamo junto!",
    "context": "Quando um lead perde dinheiro é um momento delicado. Rodrigo nunca prometeu ganho garantido. A resposta deve ser empática mas honesta — perdas fazem parte de apostas. Não incentivar a continuar apostando quando emocionado.",
    "objective": "Acolher o lead, ser honesto sobre os riscos e recomendar uma pausa para não tomar decisões por impulso.",
    "updatedAt": "2026-07-16T02:03:36.240Z",
    "createdAt": "2026-07-16T02:03:36.240Z"
  },
  {
    "id": "g10",
    "type": "faq",
    "question": "Devolução / Garantia de banca",
    "trigger": [
      "devolução",
      "devolucao",
      "garantia",
      "reembolso",
      "prometeu devolver",
      "disse que devolve",
      "cadê meu dinheiro",
      "me devolve",
      "garantiu"
    ],
    "answer": "A garantia da Dobra é válida apenas para as pessoas que participam da dobra e da errado. Me manda os detalhes aqui pra eu verificar a situação!",
    "context": "A garantia de devolução existe APENAS na Dobra de Banca — quando o lead foi selecionado e deu errado. Não vale para operações independentes do lead. Situações de garantia precisam ser verificadas pelo próprio Zk.",
    "objective": "Esclarecer os termos da garantia e pedir os detalhes para verificar. Escalonar para Rodrigo se necessário.",
    "updatedAt": "2026-07-16T02:03:36.442Z",
    "createdAt": "2026-07-16T02:03:36.442Z"
  },
  {
    "id": "g11",
    "type": "faq",
    "question": "Print / Comprovante recebido",
    "trigger": [
      "mandei",
      "mandei o print",
      "mandei comprovante",
      "já mandei",
      "enviei",
      "ta la",
      "tá lá",
      "acabei de mandar",
      "pronto mandei"
    ],
    "answer": "Recebi! Vou verificar e já te retorno. Fica de olho aqui!",
    "context": "Quando o lead confirma que mandou o print ou comprovante, Rodrigo deve confirmar o recebimento rapidamente e informar que vai verificar. Isso dá segurança ao lead.",
    "objective": "Confirmar recebimento e informar que vai verificar em breve para manter o lead engajado.",
    "updatedAt": "2026-07-16T02:03:36.667Z",
    "createdAt": "2026-07-16T02:03:36.667Z"
  },
  {
    "id": "g12",
    "type": "faq",
    "question": "Ajuda / Suporte geral",
    "trigger": [
      "ajuda",
      "preciso de ajuda",
      "me ajuda",
      "help",
      "suporte",
      "problema",
      "não consigo",
      "tô com problema",
      "me ajude"
    ],
    "answer": "Pode falar! Me diz o que tá acontecendo que resolvo pra você. Tamo junto!",
    "context": "Pedidos genéricos de ajuda precisam de mais contexto. O agente deve perguntar o que está acontecendo para entender melhor e direcionar para a solução correta.",
    "objective": "Entender o problema específico do lead para direcionar para a solução correta ou escalar para Rodrigo.",
    "updatedAt": "2026-07-16T02:03:36.872Z",
    "createdAt": "2026-07-16T02:03:36.872Z"
  },
  {
    "id": "k1784167597923",
    "type": "faq",
    "trigger": [
      "oi",
      "olá",
      "Oi",
      "Olá",
      "Bom dia",
      "Boa tarde",
      "boa tarde",
      "fala cmg",
      "alguem ai"
    ],
    "question": "OI, BOM DIA, BOA TARDE",
    "answer": "Fala meu amigo, minha amiga, otimo dia, otima tarde, otima noite, qual sua duvida ?",
    "context": "É pra apenas responder o lead, seja bom dia, boa tarde, Oi, olá.",
    "objective": "Objetivo é responder o seu contacto, e ver qual sua duvida.",
    "followup": null,
    "updatedAt": "2026-07-16T02:06:37.923Z",
    "createdAt": "2026-07-16T02:06:37.923Z"
  }
];

const FIXED_SETTINGS = {
  "agentName": "Rodrigo ZK00",
  "agentActive": true,
  "humanModeChats": [],
  "liveSchedule": "Segunda a Sexta, 20h",
  "welcomeMessage": "Oi! Tamo junto 👊 Vi que você chegou aqui, como posso te ajudar?",
  "offlineMessage": "Oi! Estou offline agora mas já volto. Pode deixar sua mensagem que respondo em breve! 🤝",
  "escalationTriggers": [
    "problema financeiro",
    "conta bloqueada",
    "bloqueou",
    "bloquearam",
    "parceria",
    "patrocínio",
    "jurídico",
    "advogado",
    "processo",
    "reclamação grave",
    "me enganou",
    "golpe",
    "fraude",
    "chargeBack"
  ],
  "followupRules": [
    {
      "id": "fu1",
      "name": "Print não enviado — Dobra de Banca",
      "active": true,
      "triggerKnowledgeIds": [
        "k9",
        "k10"
      ],
      "cancelOn": "photo",
      "delay": 10,
      "message": "Oi! Só passando pra lembrar que ainda preciso do print com seu saldo pra te avaliar pra Dobra. Me manda aqui quando puder! 📲"
    },
    {
      "id": "fu2",
      "name": "Print não enviado — VIP",
      "active": true,
      "triggerKnowledgeIds": [
        "k2",
        "k3"
      ],
      "cancelOn": "photo",
      "delay": 10,
      "message": "Ei, tudo certo? Lembra que pra entrar no VIP só precisamos do print do saldo. Me manda aqui e já te coloco na lista! 🔗"
    }
  ],
  "photoResponses": [
    {
      "id": "pr1",
      "name": "Print recebido — Dobra de Banca",
      "active": true,
      "linkedKnowledgeIds": [
        "k9",
        "k10"
      ],
      "message": "Boa! Print recebido ✅ Agora é só aguardar — vou avaliar seu perfil e, se você for selecionado, te chamo pessoalmente antes da próxima sessão. Fique de olho!"
    },
    {
      "id": "pr2",
      "name": "Print recebido — VIP",
      "active": true,
      "linkedKnowledgeIds": [
        "k2",
        "k3"
      ],
      "message": "Print recebido! ✅ Perfeito. Já vou confirmar e te adicionar no VIP. Fique ligado que te chamo em breve!"
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

function getAllClients(accountId = null) {
  const clients = Object.values(db.clients);
  if (!accountId || accountId === 'admin') {
    return clients.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  // Filtra por conta vinculada ao usuário
  const user = (db.settings.panelUsers || []).find(u => u.id === accountId);
  if (!user || !user.accountIds || !user.accountIds.length) {
    return clients.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  return clients
    .filter(c => user.accountIds.some(aid =>
      c.platform === `telegram_${aid}` || c.platform === `whatsapp_${aid}`
    ))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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

function getRecentConversations(limit = 20, accountId = null) {
  const result = [];
  for (const [key, msgs] of Object.entries(db.conversations)) {
    if (!msgs.length) continue;

    // Filtra por conta se accountId fornecido
    if (accountId && accountId !== 'admin') {
      // Conta específica — só mostra conversas da plataforma dela
      // platform format: "telegram_acc_123" ou "whatsapp"
      const user = (db.settings.panelUsers || []).find(u => u.id === accountId);
      if (user && user.accountIds && user.accountIds.length > 0) {
        const belongsToUser = user.accountIds.some(aid => key.startsWith(`telegram_${aid}`) || key.startsWith(`whatsapp_${aid}`));
        if (!belongsToUser) continue;
      }
    }

    const parts = key.split('_');
    const platform = parts[0];
    const userId = parts.slice(1).join('_');
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
function getStats(accountId = null) {
  let conversations = db.conversations;
  let clients = db.clients;

  // Filtra por conta do usuário
  if (accountId && accountId !== 'admin') {
    const user = (db.settings.panelUsers || []).find(u => u.id === accountId);
    if (user && user.accountIds && user.accountIds.length > 0) {
      const filteredConvs = {};
      const filteredClients = {};
      for (const [key, msgs] of Object.entries(conversations)) {
        if (user.accountIds.some(aid => key.startsWith(`telegram_${aid}`) || key.startsWith(`whatsapp_${aid}`))) {
          filteredConvs[key] = msgs;
          if (clients[key]) filteredClients[key] = clients[key];
        }
      }
      conversations = filteredConvs;
      clients = filteredClients;
    }
  }

  const allMsgs = Object.values(conversations).flat();
  const today = new Date().toDateString();
  const todayMsgs = allMsgs.filter(m => new Date(m.timestamp).toDateString() === today);
  return {
    totalClients: Object.keys(clients).length,
    totalConversations: Object.keys(conversations).length,
    totalMessages: allMsgs.length,
    todayMessages: todayMsgs.length,
    todayConversations: Object.values(conversations).filter(msgs =>
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
    accountIds: user.accountIds || [],
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
