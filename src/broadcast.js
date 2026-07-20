// ============================================
// BROADCAST — ZK00 Agent
// Disparo em massa com delay anti-ban
// ============================================

const db = require('./database');

// Estado do disparo em andamento
let broadcastState = {
  active: false,
  total: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  startedAt: null,
  finishedAt: null,
  log: [],
  aborted: false
};

// Delay aleatório entre envios (anti-ban)
// Entre 8 e 20 segundos por mensagem
function randomDelay(min = 8000, max = 20000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Filtra leads conforme critérios
function filterLeads(filters = {}) {
  // Pega clientes do banco de clientes E das conversas
  const clientsMap = {};
  
  // 1. Clientes registrados
  db.getAllClients().forEach(c => {
    const key = `${c.platform}_${c.userId}`;
    clientsMap[key] = c;
  });
  
  // 2. Leads das conversas (garante que todos apareçam)
  const convs = db.getRecentConversations(1000, null);
  convs.forEach(c => {
    const key = `${c.platform}_${c.userId}`;
    if (!clientsMap[key]) {
      clientsMap[key] = {
        platform: c.platform,
        userId: c.userId,
        name: c.clientName || c.userId,
        createdAt: c.lastTime,
        updatedAt: c.lastTime
      };
    }
  });

  let leads = Object.values(clientsMap);

  // Filtro por plataforma
  if (filters.platform && filters.platform !== 'all') {
    leads = leads.filter(c => c.platform === filters.platform ||
      c.platform?.startsWith(filters.platform));
  }

  // Filtro por data de primeiro contato
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    leads = leads.filter(c => new Date(c.createdAt) >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59);
    leads = leads.filter(c => new Date(c.createdAt) <= to);
  }

  // Filtro por tag
  if (filters.tag) {
    leads = leads.filter(c => (c.tags || []).includes(filters.tag));
  }

  // Filtro por status/flag
  if (filters.flag) {
    leads = leads.filter(c => c.flag === filters.flag);
  }

  // Lista manual de IDs/usernames (substitui os outros filtros se fornecida)
  if (filters.manualList && filters.manualList.length > 0) {
    // Suporta formato "platform:userId" ou só "userId"
    leads = filters.manualList.map(item => {
      const trimmed = item.trim();
      
      // Formato platform:userId (ex: telegram_acc_xxx:123456789)
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const platform = trimmed.substring(0, colonIdx);
        const userId = trimmed.substring(colonIdx + 1);
        // Busca nos clientes existentes
        const found = Object.values(clientsMap).find(c => 
          c.platform === platform && c.userId === userId
        );
        return found || { userId, platform, name: userId };
      }
      
      // Formato só userId
      const found = Object.values(clientsMap).find(c => c.userId === trimmed);
      return found || { userId: trimmed, platform: filters.platform || 'telegram', name: trimmed };
    }).filter(Boolean);
  }

  // Remove duplicatas por userId+platform
  const seen = new Set();
  leads = leads.filter(c => {
    const key = `${c.platform}_${c.userId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return leads;
}

// Executa o disparo
async function startBroadcast({ message, imageUrl, audioUrl, button, filters, sendFn }) {
  if (broadcastState.active) {
    return { error: 'Já existe um disparo em andamento' };
  }

  const leads = filterLeads(filters);
  if (!leads.length) {
    return { error: 'Nenhum lead encontrado com esses filtros' };
  }

  broadcastState = {
    active: true,
    total: leads.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
    aborted: false
  };

  console.log(`[BROADCAST] Iniciando disparo para ${leads.length} leads...`);

  // Executa em background
  (async () => {
    for (const lead of leads) {
      if (broadcastState.aborted) {
        broadcastState.log.push({ name: '⛔ Disparo interrompido manualmente', status: 'aborted' });
        break;
      }

      const platform = lead.platform || 'telegram';
      const userId = lead.userId;
      const name = lead.name || userId;

      try {
        await sendFn(platform, userId, message, imageUrl, audioUrl, button);

        broadcastState.sent++;
        broadcastState.log.push({
          name,
          userId,
          platform,
          status: 'sent',
          time: new Date().toISOString()
        });

        // Salva no histórico do lead
        db.addMessage(platform, userId, 'agent', `[BROADCAST] ${message}`);

        console.log(`[BROADCAST] ✅ ${name} (${broadcastState.sent}/${broadcastState.total})`);

      } catch (err) {
        broadcastState.failed++;
        broadcastState.log.push({
          name,
          userId,
          platform,
          status: 'failed',
          error: err.message,
          time: new Date().toISOString()
        });
        console.log(`[BROADCAST] ❌ ${name}: ${err.message}`);
      }

      // Delay anti-ban entre envios
      if (broadcastState.sent + broadcastState.failed < broadcastState.total) {
        const delay = randomDelay(8000, 20000);
        console.log(`[BROADCAST] Aguardando ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    broadcastState.active = false;
    broadcastState.finishedAt = new Date().toISOString();
    console.log(`[BROADCAST] Concluído! Enviados: ${broadcastState.sent}, Falhas: ${broadcastState.failed}`);
  })();

  return {
    success: true,
    total: leads.length,
    message: `Disparo iniciado para ${leads.length} leads`
  };
}

function getStatus() {
  return { ...broadcastState };
}

function abort() {
  if (broadcastState.active) {
    broadcastState.aborted = true;
    return { success: true, message: 'Disparo interrompido' };
  }
  return { error: 'Nenhum disparo ativo' };
}

function previewLeads(filters) {
  const leads = filterLeads(filters);
  return {
    total: leads.length,
    preview: leads.slice(0, 20).map(l => ({
      name: l.name || l.userId,
      userId: l.userId,
      platform: l.platform,
      createdAt: l.createdAt
    }))
  };
}

module.exports = { startBroadcast, getStatus, abort, previewLeads, filterLeads };
