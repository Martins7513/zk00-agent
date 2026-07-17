// ============================================
// DATABASE — ZK00 Agent
// Banco multi-usuário com isolamento total
// ============================================

const path = require('path');
const fs = require('fs');

const DATA_DIRS = ['/data', path.join(__dirname, '../data'), '/tmp/zk00data'];
let DATA_DIR = null, DB_PATH = null;

for (const dir of DATA_DIRS) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const t = path.join(dir, '.test');
    fs.writeFileSync(t, 'ok'); fs.unlinkSync(t);
    DATA_DIR = dir; DB_PATH = path.join(dir, 'zk00.json');
    console.log(`[DB] Usando: ${dir}`);
    break;
  } catch(e) {}
}

// ==============================
// DADOS FIXOS (seus dados reais)
// ==============================
const FIXED_KNOWLEDGE = [
  { id:'g1', type:'faq', trigger:['dobra','dobra minha','dobra a minha','dobra minha banca','alavancagem','quero a dobra','operar junto','dobrar minha banca','faz a dobra','dobra irmão'], question:'Dobra de Banca / Alavancagem', answer:'Bora pra cima! Cria sua conta na plataforma, deposita e me manda o print da sua banca com saldo. Quando eu selecionar eu aviso.\n\nAqui ta o link que disponibilizo pra quem vai entrar: COLOQUE_SEU_LINK_AQUI', context:'A Dobra de Banca NÃO é um grupo. É um programa de seleção individual feita pelo FM. Cada pessoa é escolhida pessoalmente. O aluno opera com seu próprio capital, FM opera com o dele. FM dá garantia: se o aluno perder na sessão, FM devolve o valor perdido.', objective:'Fazer o lead entender que é algo exclusivo e pessoal, não um grupo. Levar o lead a mandar o print do saldo para ser avaliado.' },
  { id:'g2', type:'faq', trigger:['live','horario','horário','que horas','quando tem live','vai ter live','live hoje','hora da live','live on','tá ao vivo'], question:'Live / Horário das lives', answer:'A live de hoje começa às 20h no grupo. Fica de olho que aviso antes de começar! 🔥', context:'FM faz lives regulares no grupo Free e VIP. O horário padrão é às 20h mas pode variar.', objective:'Informar o horário e aproveitar para convidar o lead a entrar no grupo VIP.' },
  { id:'g3', type:'faq', trigger:['vip','grupo vip','quanto custa vip','valor vip','quero vip','entrar no vip','vip mensal'], question:'Grupo VIP', answer:'O VIP tem acesso às lives ao vivo, sinais em primeira mão e suporte direto. Chama meu suporte @SuporteZKDADOS00 que ele te explica tudo!', context:'O VIP custa R$100/mês ou R$200/trimestral. Suporte é @SuporteZKDADOS00.', objective:'Passar os valores do VIP e direcionar para o suporte.' },
  { id:'g4', type:'faq', trigger:['como entro','como faço para entrar','quero entrar','grupo free','grupo gratuito','link do grupo','como participar','quero o grupo','me add no grupo','entrar no grupo'], question:'Como entrar no grupo / Free', answer:'O grupo free é por aqui mesmo! Me manda mensagem que te passo o link.', context:'Existe grupo Free gratuito e VIP pago.', objective:'Enviar link do free e apresentar o VIP como upgrade.' },
  { id:'g5', type:'faq', trigger:['link','plataforma','qual site','qual casa','cadastro','onde me cadastro','me manda o link','onde jogar'], question:'Link da plataforma', answer:'Cria sua conta pela plataforma que operamos e já deposita. Me manda o print da banca depois! O link é: COLOQUE_SEU_LINK_AQUI', context:'FM tem link de afiliado da casa parceira.', objective:'Passar o link e pedir o print da banca.' },
  { id:'g6', type:'faq', trigger:['saque','sacar','retirar','como saco','demora pra sacar','problema no saque'], question:'Saque', answer:'O saque é direto pela plataforma, normalmente cai rápido. Se tiver algum problema, me manda aqui que verifico pra você!', context:'Saques feitos diretamente na plataforma parceira.', objective:'Tranquilizar o lead e oferecer ajuda.' },
  { id:'g7', type:'faq', trigger:['robô','robo','sinais','como funciona o robô','como funciona','o que é','funciona mesmo'], question:'Robô de sinais', answer:'O robô analisa os padrões do Bac Bo em tempo real e manda os sinais direto aqui. Funciona 24h e tamo sempre de olho nos resultados!', context:'O robô analisa padrões do Bac Bo e envia alertas automáticos 24h.', objective:'Explicar e levar o lead a criar conta e entrar no grupo.' },
  { id:'g8', type:'faq', trigger:['senha','login','usuário','manda senha','manda login','esqueci senha'], question:'Senha / Login', answer:'Irmão, nunca mando senha de ninguém aqui não! Por segurança, acessa o site da plataforma e clica em esqueci minha senha.', context:'FM NUNCA deve mandar senhas. Orientar a recuperar no site.', objective:'Recusar educadamente e orientar.' },
  { id:'g9', type:'faq', trigger:['perdi','perder','perda','tô no prejuízo','perdi tudo','zerou','perdi minha banca'], question:'Lead perdeu dinheiro', answer:'Cara, isso faz parte do jogo. Todo mundo passa por isso. O importante é não forçar quando a maré tá ruim. Para, respira, e volta quando sentir que tá no momento certo. Tamo junto!', context:'Quando um lead perde dinheiro é um momento delicado. Resposta empática mas honesta.', objective:'Acolher o lead e recomendar uma pausa.' }
];

const FIXED_SETTINGS = {
  agentName: 'FM',
  agentActive: true,
  humanModeChats: [],
  liveSchedule: 'Segunda a Sexta, 20h',
  welcomeMessage: 'Oi! Tamo junto 👊 Como posso te ajudar?',
  offlineMessage: 'Oi! Estou offline agora mas já volto. Pode deixar sua mensagem! 🤝',
  escalationTriggers: ['problema financeiro','conta bloqueada','parceria','patrocínio','jurídico','advogado','golpe','fraude'],
  followupRules: [
    { id:'fu1', name:'Print não enviado — Dobra', active:true, triggerKnowledgeIds:['g1'], cancelOn:'photo', delay:10, message:'Oi! Só passando pra lembrar que ainda preciso do print com seu saldo pra te avaliar pra Dobra. Me manda aqui quando puder! 📲' }
  ],
  photoResponses: [
    { id:'pr1', name:'Print recebido — Dobra', active:true, linkedKnowledgeIds:['g1'], message:'Boa! Print recebido ✅ Agora é só aguardar — vou avaliar seu perfil e, se você for selecionado, te chamo pessoalmente. Fique de olho!' }
  ],
  panelUsers: []
};

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
        const saved = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        // Garante knowledge fixo
        const savedIds = (saved.knowledge||[]).map(k=>k.id);
        for (const item of FIXED_KNOWLEDGE) {
          if (!savedIds.includes(item.id)) {
            saved.knowledge = saved.knowledge || [];
            saved.knowledge.push(item);
          }
        }
        saved.settings = { ...FIXED_SETTINGS, ...saved.settings };
        if (!saved.settings.panelUsers) saved.settings.panelUsers = [];
        console.log(`[DB] Carregado: ${(saved.knowledge||[]).length} conhecimentos, ${Object.keys(saved.clients||{}).length} clientes`);
        return saved;
      }
    } catch(e) { console.error('[DB] Erro ao carregar:', e.message); }
  }
  return getDefaultDB();
}

function saveDB(db) {
  if (!DB_PATH) return;
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
  catch(e) { console.error('[DB] Erro ao salvar:', e.message); }
}

let db = loadDB();
setInterval(() => saveDB(db), 30000);

// ==============================
// USUÁRIOS
// ==============================
function getUsers() { return db.settings.panelUsers || []; }

function getUserByCredentials(username, password) {
  const adminPass = process.env.ADMIN_PASSWORD || 'zk00admin123';
  if (password === adminPass && (!username || username === 'admin' || username === 'fm')) {
    return { id: 'admin', username: 'admin', name: 'FM', role: 'admin', isAdmin: true };
  }
  return getUsers().find(u => u.username === username && u.password === password && u.active !== false) || null;
}

function addUser(user) {
  if (!db.settings.panelUsers) db.settings.panelUsers = [];
  if (db.settings.panelUsers.find(u => u.username === user.username)) return { error: 'Username já existe' };
  const newUser = { id:'usr_'+Date.now(), username:user.username, password:user.password, name:user.name||user.username, role:'operator', active:true, createdAt:new Date().toISOString() };
  db.settings.panelUsers.push(newUser);
  saveDB(db);
  console.log('[DB] Usuário criado:', newUser.username);
  return newUser;
}

function updateUser(id, data) {
  if (!db.settings.panelUsers) db.settings.panelUsers = [];
  const idx = db.settings.panelUsers.findIndex(u=>u.id===id);
  if (idx<0) return { error:'Usuário não encontrado' };
  db.settings.panelUsers[idx] = { ...db.settings.panelUsers[idx], ...data };
  saveDB(db);
  return db.settings.panelUsers[idx];
}

function deleteUser(id) {
  if (!db.settings.panelUsers) return;
  db.settings.panelUsers = db.settings.panelUsers.filter(u=>u.id!==id);
  saveDB(db);
}

// ==============================
// CLIENTES — com filtro por owner
// ==============================
function getClientKey(platform, userId) { return `${platform}_${userId}`; }

function getClient(platform, userId) { return db.clients[getClientKey(platform,userId)] || null; }

function saveClient(platform, userId, data) {
  const key = getClientKey(platform, userId);
  console.log(`[DB] saveClient - platform:${platform} userId:${userId} key:${key}`);
  db.clients[key] = { ...db.clients[key], ...data, platform, userId, updatedAt:new Date().toISOString() };
  if (!db.clients[key].createdAt) db.clients[key].createdAt = new Date().toISOString();
  // owner = prefixo da plataforma (ex: acc_usr_123 de telegram_acc_usr_123)
  if (!db.clients[key].owner) {
    if (platform.startsWith('telegram_')) db.clients[key].owner = platform.replace('telegram_','');
    else db.clients[key].owner = platform;
  }
  saveDB(db);
  return db.clients[key];
}

function getAllClients(ownerId = null) {
  const clients = Object.values(db.clients);
  if (!ownerId || ownerId === 'admin') return clients.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  return clients.filter(c => c.owner === ownerId || c.platform === `telegram_${ownerId}` || c.platform === `whatsapp_${ownerId}`)
    .sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
}

// ==============================
// CONVERSAS — com filtro por owner
// ==============================
function getHistory(platform, userId) { return db.conversations[getClientKey(platform,userId)] || []; }

function addMessage(platform, userId, role, content) {
  const key = getClientKey(platform, userId);
  if (!db.conversations[key]) db.conversations[key] = [];
  db.conversations[key].push({ role, content, timestamp:new Date().toISOString() });
  if (db.conversations[key].length > 40) db.conversations[key] = db.conversations[key].slice(-40);
  saveDB(db);
}

function getRecentConversations(limit=20, ownerId=null) {
  const allKeys = Object.keys(db.conversations);
  console.log(`[DB] getRecentConversations - ownerId:${ownerId} total keys:${allKeys.length} keys:${allKeys.join(',')}`);
  const result = [];
  for (const [key, msgs] of Object.entries(db.conversations)) {
    if (!msgs.length) continue;

    const client = db.clients[key] || {};

    // Usa platform e userId do client (correto) em vez de parsear a key
    const platform = client.platform || key.split('_')[0];
    const userId = client.userId || (() => {
      // Fallback: remove o platform prefix da key
      const prefix = platform + '_';
      return key.startsWith(prefix) ? key.slice(prefix.length) : key;
    })();

    // Filtro por owner
    if (ownerId && ownerId !== 'admin') {
      if (!String(client.owner||'').includes(ownerId) && !key.includes(ownerId)) continue;
    }

    const last = msgs[msgs.length-1];
    result.push({
      key, platform, userId,
      clientName: client.name || userId,
      lastMessage: last.content,
      lastRole: last.role,
      lastTime: last.timestamp,
      unread: msgs.filter(m=>m.role==='user'&&!m.read).length,
      isHumanMode: (db.settings.humanModeChats||[]).includes(key),
      flag: client.flag || null
    });
  }
  return result.sort((a,b)=>new Date(b.lastTime)-new Date(a.lastTime)).slice(0,limit);
}

// ==============================
// KNOWLEDGE
// ==============================
function searchKnowledge(text) {
  const lower = text.toLowerCase();
  for (const item of db.knowledge) {
    if (item.trigger && item.trigger.some(t=>lower.includes(t.toLowerCase()))) return item;
  }
  return null;
}
function getAllKnowledge() { return db.knowledge; }
function addKnowledge(item) {
  const newItem = { id:item.id||('k'+Date.now()), ...item, updatedAt:new Date().toISOString() };
  if (!newItem.createdAt) newItem.createdAt = new Date().toISOString();
  const idx = db.knowledge.findIndex(k=>k.id===newItem.id);
  if (idx>=0) db.knowledge[idx]=newItem; else db.knowledge.push(newItem);
  saveDB(db); return newItem;
}
function deleteKnowledge(id) { db.knowledge=db.knowledge.filter(k=>k.id!==id); saveDB(db); }

// ==============================
// SETTINGS
// ==============================
function getSettings() { return db.settings; }
function updateSettings(updates) { db.settings={...db.settings,...updates}; saveDB(db); return db.settings; }
function isHumanMode(platform,userId) { return (db.settings.humanModeChats||[]).includes(getClientKey(platform,userId)); }
function setHumanMode(platform,userId,active) {
  const key=getClientKey(platform,userId);
  if(!db.settings.humanModeChats) db.settings.humanModeChats=[];
  if(active&&!db.settings.humanModeChats.includes(key)) db.settings.humanModeChats.push(key);
  else if(!active) db.settings.humanModeChats=db.settings.humanModeChats.filter(k=>k!==key);
  saveDB(db);
}
function flagConversation(platform,userId,flag) {
  const key=getClientKey(platform,userId);
  if(!db.clients[key]) db.clients[key]={platform,userId};
  db.clients[key].flag=flag; saveDB(db);
}

// ==============================
// STATS
// ==============================
function getStats(ownerId=null) {
  let convs = db.conversations;
  let clients = db.clients;
  if (ownerId && ownerId !== 'admin') {
    convs = Object.fromEntries(Object.entries(convs).filter(([k])=>k.includes(ownerId)));
    clients = Object.fromEntries(Object.entries(clients).filter(([k,v])=>(v.owner||'').includes(ownerId)||k.includes(ownerId)));
  }
  const allMsgs = Object.values(convs).flat();
  const today = new Date().toDateString();
  const todayMsgs = allMsgs.filter(m=>new Date(m.timestamp).toDateString()===today);
  return {
    totalClients: Object.keys(clients).length,
    totalConversations: Object.keys(convs).length,
    totalMessages: allMsgs.length,
    todayMessages: todayMsgs.length,
    todayConversations: Object.values(convs).filter(msgs=>msgs.some(m=>new Date(m.timestamp).toDateString()===today)).length,
    agentActive: db.settings.agentActive,
    humanModeCount: (db.settings.humanModeChats||[]).length
  };
}

function exportBackup() { return JSON.parse(JSON.stringify(db)); }
function importBackup(data) {
  if(data.knowledge) db.knowledge=data.knowledge;
  if(data.settings) db.settings={...FIXED_SETTINGS,...data.settings};
  if(data.clients) db.clients=data.clients;
  if(data.conversations) db.conversations=data.conversations;
  saveDB(db);
}

module.exports = {
  getClient, saveClient, getAllClients,
  getHistory, addMessage, getRecentConversations,
  searchKnowledge, getAllKnowledge, addKnowledge, deleteKnowledge,
  getSettings, updateSettings, isHumanMode, setHumanMode, flagConversation,
  getStats, exportBackup, importBackup,
  getUsers, getUserByCredentials, addUser, updateUser, deleteUser
};
