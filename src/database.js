// ============================================
// DATABASE — ZK00 Agent
// Banco SQLite local (Railway persiste automaticamente)
// ============================================

const path = require('path');
const fs = require('fs');

// Usa SQLite em memória-like via JSON para compatibilidade máxima
// (não precisa instalar nada além do Node)
const DB_PATH = path.join(__dirname, '../data/zk00.json');

// Garante que a pasta data existe
if (!fs.existsSync(path.join(__dirname, '../data'))) {
  fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
}

// Estrutura inicial do banco
const DEFAULT_DB = {
  clients: {},
  conversations: {},
  knowledge: [
    {
      id: 'k1',
      type: 'faq',
      trigger: ['como funciona', 'o que é', 'robô', 'sinais', 'bac bo'],
      question: 'Como funciona o robô de sinais?',
      answer: 'O robô analisa padrões em tempo real no Bac Bo e manda os sinais direto aqui, 24h por dia. Você só segue e aposta. Tamo junto! 🎯'
    },
    {
      id: 'k2',
      type: 'faq',
      trigger: ['deposito', 'depósito', 'como entrar', 'cadastro', 'cadastrar'],
      question: 'Como faço o depósito e entro no grupo?',
      answer: 'Simples! Você se cadastra na casa parceira pelo meu link, faz o depósito e me manda o print do saldo. Aí te coloco no VIP na hora. Fica tranquilo que te explico tudo! 📲'
    },
    {
      id: 'k3',
      type: 'faq',
      trigger: ['vip', 'grupo vip', 'grupo'],
      question: 'O que é o Grupo VIP?',
      answer: 'No VIP você recebe os sinais em primeira mão, análise completa das entradas e suporte direto. É onde estão os membros mais ativos. Bora pra cima! 🏆'
    },
    {
      id: 'k4',
      type: 'faq',
      trigger: ['live', 'horario', 'horário', 'quando', 'transmissão'],
      question: 'Qual o horário das lives?',
      answer: 'As lives acontecem de segunda a sexta a partir das 20h no canal do Telegram. Fica de olho lá que aviso sempre antes de começar! 🕐'
    },
    {
      id: 'k5',
      type: 'faq',
      trigger: ['saque', 'retirar', 'sacar'],
      question: 'Como faço o saque?',
      answer: 'O saque é direto pela plataforma da casa. Normalmente cai em até 24h úteis. Qualquer problema me chama que ajudamos! 💰'
    },
    {
      id: 'k6',
      type: 'faq',
      trigger: ['gratis', 'gratuito', 'free', 'grupo free'],
      question: 'Tem grupo gratuito?',
      answer: 'Sim! Temos o grupo free onde mando alguns sinais e conteúdo. Mas no VIP a qualidade e quantidade de sinais é muito maior. Me manda mensagem que te passo o link do free! 👊'
    },
    {
      id: 'k7',
      type: 'faq',
      trigger: ['seguro', 'confiavel', 'funciona mesmo', 'prova'],
      question: 'É confiável?',
      answer: 'Vou ser direto: todo jogo tem risco e eu nunca prometo ganho garantido. O que posso te mostrar são os resultados reais dos membros que seguem os sinais. Quer ver os prints? 📊'
    },
    {
      id: 'k8',
      type: 'faq',
      trigger: ['link', 'casa', 'plataforma', 'onde jogar', 'qual casa'],
      question: 'Qual a casa de apostas?',
      answer: 'Trabalhamos com casas parceiras regulamentadas. Me manda mensagem que te passo o link com o bônus de cadastro! 🔗'
    },
    {
      id: 'k9',
      type: 'faq',
      trigger: ['dobra', 'dobra de banca', 'operar junto', 'garantia de banca', 'opera comigo', 'operar comigo', 'sessao ao vivo', 'dobrar banca', 'quero dobra', 'dobra banca'],
      question: 'O que e a Dobra de Banca?',
      answer: 'A Dobra de Banca e um programa exclusivo e bem diferente. Nao e um grupo — e uma selecao individual. Eu escolho pessoalmente quem vai operar comigo ao vivo. Voce opera com seu capital, eu com o meu, usando minhas analises em tempo real. E o diferencial: se voce perder na sessao, eu devolvo o valor. Eu assumo o risco. As vagas sao bem limitadas porque eu preciso acompanhar cada pessoa de perto. Pra ser avaliado, voce precisa se cadastrar na casa parceira, fazer um deposito e me mandar o print do saldo aqui.',
      context: 'A Dobra de Banca NAO e um grupo. E um programa de selecao individual feita pelo Rodrigo. Cada pessoa e escolhida pessoalmente. O aluno opera com seu proprio capital, Rodrigo opera com o dele. Rodrigo da garantia: se o aluno perder na sessao, Rodrigo devolve o valor perdido. As vagas sao extremamente limitadas porque Rodrigo precisa operar junto com cada pessoa selecionada.',
      objective: 'Fazer o lead entender que e algo exclusivo e pessoal, nao um grupo. Gerar desejo e senso de privilegio por ser selecionado. Levar o lead a querer ser avaliado e mandar o print do saldo para participar da selecao.'
    },
    {
      id: 'k10',
      type: 'faq',
      trigger: ['como participar', 'quero participar', 'como entrar dobra', 'quero operar', 'proxima sessao', 'como sou selecionado'],
      question: 'Como participar da Dobra de Banca?',
      answer: 'Pra ser avaliado para a Dobra e simples: se cadastra na casa parceira pelo meu link, faz o deposito e me manda o print do saldo aqui. Eu analiso o perfil e, se voce for selecionado, te chamo pessoalmente para a proxima sessao.',
      context: 'A selecao e feita pelo Rodrigo com base no perfil do lead. Nao e automatico — Rodrigo avalia cada pessoa individualmente antes de selecionar.',
      objective: 'Levar o lead ao proximo passo concreto: se cadastrar na casa parceira e mandar o print do saldo para ser avaliado por Rodrigo.'
    }
  ],
  settings: {
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
  }
};

// Carrega o banco
function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

// Salva o banco
function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Erro ao salvar banco:', e.message);
  }
}

// Inicializa o banco em memória
let db = loadDB();

// ==============================
// CLIENTS
// ==============================

function getClient(platform, userId) {
  const key = `${platform}_${userId}`;
  return db.clients[key] || null;
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
  if (!db.clients[key].createdAt) {
    db.clients[key].createdAt = new Date().toISOString();
  }
  saveDB(db);
  return db.clients[key];
}

function getAllClients() {
  return Object.values(db.clients).sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

// ==============================
// CONVERSATIONS
// ==============================

function getHistory(platform, userId) {
  const key = `${platform}_${userId}`;
  return db.conversations[key] || [];
}

function addMessage(platform, userId, role, content) {
  const key = `${platform}_${userId}`;
  if (!db.conversations[key]) db.conversations[key] = [];

  db.conversations[key].push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  // Mantém apenas as últimas 40 mensagens por conversa
  if (db.conversations[key].length > 40) {
    db.conversations[key] = db.conversations[key].slice(-40);
  }

  saveDB(db);
}

function getRecentConversations(limit = 20) {
  const result = [];
  for (const [key, msgs] of Object.entries(db.conversations)) {
    if (msgs.length === 0) continue;
    const [platform, ...rest] = key.split('_');
    const userId = rest.join('_');
    const client = db.clients[key] || {};
    const last = msgs[msgs.length - 1];
    result.push({
      key,
      platform,
      userId,
      clientName: client.name || userId,
      lastMessage: last.content,
      lastRole: last.role,
      lastTime: last.timestamp,
      unread: msgs.filter(m => m.role === 'user' && !m.read).length,
      isHumanMode: db.settings.humanModeChats.includes(key),
      flag: client.flag || null
    });
  }
  return result
    .sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime))
    .slice(0, limit);
}

// ==============================
// KNOWLEDGE
// ==============================

function searchKnowledge(text) {
  const lower = text.toLowerCase();
  for (const item of db.knowledge) {
    if (item.trigger && item.trigger.some(t => lower.includes(t))) {
      return item; // retorna o item completo (answer + context + objective)
    }
  }
  return null;
}

function getAllKnowledge() {
  return db.knowledge;
}

function addKnowledge(item) {
  const newItem = {
    id: item.id || ('k' + Date.now()), // preserva ID se for edição
    ...item,
    updatedAt: new Date().toISOString()
  };
  if (!newItem.createdAt) newItem.createdAt = new Date().toISOString();
  db.knowledge.push(newItem);
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

function getSettings() {
  return db.settings;
}

function updateSettings(updates) {
  db.settings = { ...db.settings, ...updates };
  saveDB(db);
  return db.settings;
}

function isHumanMode(platform, userId) {
  const key = `${platform}_${userId}`;
  return db.settings.humanModeChats.includes(key);
}

function setHumanMode(platform, userId, active) {
  const key = `${platform}_${userId}`;
  if (active && !db.settings.humanModeChats.includes(key)) {
    db.settings.humanModeChats.push(key);
  } else if (!active) {
    db.settings.humanModeChats = db.settings.humanModeChats.filter(k => k !== key);
  }
  saveDB(db);
}

// Flag de atenção — marca conversa em vermelho quando sem gatilho
function flagConversation(platform, userId, flag) {
  const key = `${platform}_${userId}`;
  if (!db.clients[key]) return;
  db.clients[key].flag = flag; // 'attention' ou null
  saveDB(db);
}

// Estatísticas
function getStats() {
  const clients = Object.values(db.clients);
  const allMsgs = Object.values(db.conversations).flat();
  const today = new Date().toDateString();
  const todayMsgs = allMsgs.filter(m => new Date(m.timestamp).toDateString() === today);

  return {
    totalClients: clients.length,
    totalConversations: Object.keys(db.conversations).length,
    totalMessages: allMsgs.length,
    todayMessages: todayMsgs.length,
    todayConversations: Object.values(db.conversations).filter(msgs =>
      msgs.some(m => new Date(m.timestamp).toDateString() === today)
    ).length,
    agentActive: db.settings.agentActive,
    humanModeCount: db.settings.humanModeChats.length
  };
}

module.exports = {
  getClient, saveClient, getAllClients,
  getHistory, addMessage, getRecentConversations,
  searchKnowledge, getAllKnowledge, addKnowledge, deleteKnowledge,
  getSettings, updateSettings, isHumanMode, setHumanMode,
  flagConversation, getStats
};
