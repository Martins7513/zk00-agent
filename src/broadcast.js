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
  aborted: false,
  paused: false
};

// Histórico de quem já recebeu (persiste entre sessões)
const sentHistory = new Set(); // "platform_userId" ou "username"


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
  // Handle username list (format: username:accountId:username)
  // REPLACE all leads with username list only
  if (filters._usernameList && filters._usernameList.length > 0) {
    leads = filters._usernameList.map(item => {
      // format: "username:accountId:actualUsername"
      const firstColon = item.indexOf(':');
      const secondColon = item.indexOf(':', firstColon + 1);
      const accountId = item.substring(firstColon + 1, secondColon);
      const username = item.substring(secondColon + 1).replace('@','').trim();
      console.log(`[BC] Username item: accountId=${accountId} username=${username}`);
      return {
        userId: username,
        platform: `telegram_${accountId}`,
        name: `@${username}`,
        isUsername: true
      };
    });
    return leads; // retorna imediatamente, ignora outros filtros
  }

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
async function startBroadcast({ message, aiObjective, aiTone, linkUrl, linkText, linkMode, mediaBase64, mediaMime, mediaType, videoRound, filters, sendFn, generateAiMsg }) {
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

      // Verifica se pausado
      while (broadcastState.paused && !broadcastState.aborted) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (broadcastState.aborted) break;

      // Verifica se já foi enviado antes
      const histKey = lead.isUsername ? lead.userId : `${platform}_${userId}`;
      if (sentHistory.has(histKey)) {
        broadcastState.skipped++;
        broadcastState.log.push({ name, userId, platform, status: 'skipped', time: new Date().toISOString(), reason: 'já enviado' });
        console.log(`[BROADCAST] ⏭ Pulando ${name} — já enviado antes`);
        continue;
      }

      // Gera mensagem personalizada para este lead
      let personalMessage = message;

      if (aiObjective) {
        // IA gera mensagem única para cada pessoa
        try {
          if (generateAiMsg) {
            personalMessage = await generateAiMsg(aiObjective, aiTone, name);
            console.log(`[BROADCAST] IA gerou para ${name}: "${personalMessage?.substring(0,50)}"`);
          } else {
            personalMessage = message || aiObjective;
          }
        } catch(e) {
          console.error('[BROADCAST] IA falhou para', name, ':', e.message);
          personalMessage = message || aiObjective; // fallback
        }
      }

      // Substitui {nome} pelo nome real
      if (personalMessage && personalMessage.includes('{nome}')) {
        const firstName = (name || '').split(' ')[0] || name;
        personalMessage = personalMessage.replace(/\{nome\}/g, firstName);
      }

      // Adiciona link à mensagem
      if (linkUrl && linkUrl.length > 5) {
        const base = personalMessage || '';
        const sep = base ? '\n\n' : '';
        if (linkMode === 'hidden' && linkText) {
          personalMessage = base + sep + `[${linkText}](${linkUrl})`;
        } else {
          personalMessage = base + sep + linkUrl;
        }
        console.log(`[BROADCAST] ✅ Link adicionado (${linkMode}): "${personalMessage?.substring(0,80)}"`);
      } else if (!linkUrl) {
        console.log(`[BROADCAST] Sem link para adicionar`);
      }

      // Detecta se mensagem tem markdown
      const hasMarkdown = personalMessage && /\*\*.*\*\*|__.*__|`.*`|\[.+\]\(https?:\/\/.+\)/.test(personalMessage);

      // Marca como enviando
      broadcastState.log = broadcastState.log.filter(l => !(l.userId === userId && l.status === 'sending'));
      broadcastState.log.push({ name, userId, platform, status: 'sending', time: new Date().toISOString() });

      try {
        await sendFn(platform, userId, personalMessage, mediaBase64, mediaMime, mediaType, videoRound, hasMarkdown);

        broadcastState.sent++;
        sentHistory.add(histKey); // marca como enviado
        broadcastState.log.push({
          name,
          userId,
          platform,
          status: 'sent',
          time: new Date().toISOString(),
          index: broadcastState.sent + broadcastState.failed + broadcastState.skipped - 1
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

function pauseBroadcast() { broadcastState.paused = true; }
function resumeBroadcast() { broadcastState.paused = false; }
function clearSentHistory() { sentHistory.clear(); }
function getSentHistory() { return [...sentHistory]; }

module.exports = { startBroadcast, getStatus, abort, previewLeads, filterLeads, pauseBroadcast, resumeBroadcast, clearSentHistory, getSentHistory };
