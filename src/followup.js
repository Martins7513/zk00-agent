// ============================================
// FOLLOW-UP — ZK00 Agent
// Mensagens automáticas por tempo
// ============================================

const db = require('./database');

let followupTimers = {}; // { "platform_userId_ruleId": timeoutId }

// ============================================
// REGRAS DE FOLLOW-UP
// Configuradas pelo painel ou manualmente aqui
// ============================================
function getFollowupRules() {
  const settings = db.getSettings();
  return settings.followupRules || [
    {
      id: 'fu1',
      name: 'Print não enviado — Dobra de Banca',
      active: true,
      triggerOn: 'knowledge', // dispara quando gatilho específico for ativado
      triggerKnowledgeIds: ['k9', 'k10'], // IDs do conhecimento (dobra de banca)
      cancelOn: 'photo', // cancela se receber foto
      delay: 10, // minutos
      message: 'Oi! Só passando pra lembrar que ainda preciso do print com seu saldo pra te avaliar pra Dobra. Me manda aqui quando puder! 📲'
    },
    {
      id: 'fu2',
      name: 'Print não enviado — VIP',
      active: true,
      triggerOn: 'knowledge',
      triggerKnowledgeIds: ['k2', 'k3'],
      cancelOn: 'photo',
      delay: 10,
      message: 'Ei, tudo certo? Lembra que pra entrar no VIP só precisamos do print do saldo. Me manda aqui e já te coloco na lista! 🔗'
    }
  ];
}

// Inicia um timer de follow-up
function scheduleFollowup(platform, userId, ruleId, message, delayMinutes, sendFn) {
  const key = `${platform}_${userId}_${ruleId}`;

  // Cancela timer existente se tiver
  cancelFollowup(platform, userId, ruleId);

  const ms = delayMinutes * 60 * 1000;
  console.log(`[FOLLOWUP] Agendado para ${userId} em ${delayMinutes}min (rule: ${ruleId})`);

  followupTimers[key] = setTimeout(async () => {
    // Verifica se o chat ainda está ativo e não em modo humano
    if (db.isHumanMode(platform, userId)) {
      console.log(`[FOLLOWUP] ${userId} em modo humano — cancelado`);
      return;
    }

    const settings = db.getSettings();
    if (!settings.agentActive) return;

    // Verifica se já recebeu foto (flag)
    const client = db.getClient(platform, userId);
    if (client && client.photoReceived) {
      console.log(`[FOLLOWUP] ${userId} já mandou foto — cancelado`);
      return;
    }

    console.log(`[FOLLOWUP] Disparando follow-up para ${userId}`);
    db.addMessage(platform, userId, 'agent', message);
    await sendFn(userId, message);

    delete followupTimers[key];
  }, ms);
}

// Cancela um timer específico
function cancelFollowup(platform, userId, ruleId) {
  const key = `${platform}_${userId}_${ruleId}`;
  if (followupTimers[key]) {
    clearTimeout(followupTimers[key]);
    delete followupTimers[key];
    console.log(`[FOLLOWUP] Cancelado: ${key}`);
  }
}

// Cancela TODOS os timers de um usuário
function cancelAllFollowups(platform, userId) {
  const prefix = `${platform}_${userId}_`;
  Object.keys(followupTimers).forEach(key => {
    if (key.startsWith(prefix)) {
      clearTimeout(followupTimers[key]);
      delete followupTimers[key];
    }
  });
  console.log(`[FOLLOWUP] Todos cancelados para ${userId}`);
}

// Verifica se deve disparar follow-up após um gatilho
function checkAndSchedule(platform, userId, knowledgeItem, sendFn) {
  if (!knowledgeItem || !knowledgeItem.id) return;
  const rules = getFollowupRules();

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.triggerOn === 'knowledge' && rule.triggerKnowledgeIds.includes(knowledgeItem.id)) {
      scheduleFollowup(platform, userId, rule.id, rule.message, rule.delay, sendFn);
    }
  }
}

// Chamado quando usuário manda uma FOTO
function onPhotoReceived(platform, userId) {
  const rules = getFollowupRules();
  const client = db.getClient(platform, userId) || {};

  // Marca que recebeu foto
  db.saveClient(platform, userId, { ...client, photoReceived: true, photoReceivedAt: new Date().toISOString() });

  // Cancela follow-ups que dependem de foto
  for (const rule of rules) {
    if (rule.cancelOn === 'photo') {
      cancelFollowup(platform, userId, rule.id);
    }
  }

  console.log(`[FOLLOWUP] Foto recebida de ${userId} — follow-ups cancelados`);
}

// Lista timers ativos (para o painel)
function getActiveTimers() {
  return Object.keys(followupTimers).map(key => {
    const parts = key.split('_');
    return { key, platform: parts[0], userId: parts[1], ruleId: parts[2] };
  });
}

module.exports = { checkAndSchedule, onPhotoReceived, cancelAllFollowups, getFollowupRules, scheduleFollowup, getActiveTimers };
