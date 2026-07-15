// ============================================
// FOLLOW-UP — ZK00 Agent
// Timers vinculados diretamente ao gatilho
// ============================================

const db = require('./database');

let timers = {}; // { "platform_userId_ruleId": [timeoutId, ...] }

// Agenda follow-up a partir da config do gatilho
function scheduleFromKnowledge(platform, userId, knowledgeItem, sendFn) {
  if (!knowledgeItem || !knowledgeItem.followup || !knowledgeItem.followup.active) return;

  const fu = knowledgeItem.followup;
  const baseKey = `${platform}_${userId}_${knowledgeItem.id}`;

  // Cancela timers anteriores para este gatilho
  cancelTimers(baseKey);

  timers[baseKey] = [];

  // 1ª mensagem
  if (fu.message && fu.delay) {
    const t1 = setTimeout(async () => {
      if (shouldSkip(platform, userId, fu.cancelOn)) return;
      console.log(`[FOLLOWUP] Disparando 1ª msg para ${userId}`);
      const msg = fu.message;
      db.addMessage(platform, userId, 'agent', msg);
      await sendFn(userId, msg);
    }, fu.delay * 60 * 1000);
    timers[baseKey].push(t1);
  }

  // 2ª mensagem (opcional)
  if (fu.second && fu.second.message && fu.second.delay) {
    const totalDelay = (fu.delay + fu.second.delay) * 60 * 1000;
    const t2 = setTimeout(async () => {
      if (shouldSkip(platform, userId, fu.cancelOn)) return;
      console.log(`[FOLLOWUP] Disparando 2ª msg para ${userId}`);
      const msg = fu.second.message;
      db.addMessage(platform, userId, 'agent', msg);
      await sendFn(userId, msg);
    }, totalDelay);
    timers[baseKey].push(t2);
  }

  console.log(`[FOLLOWUP] Agendado para ${userId} — 1ª em ${fu.delay}min${fu.second ? `, 2ª em ${fu.delay + fu.second.delay}min` : ''}`);
}

// Verifica se deve pular o disparo
function shouldSkip(platform, userId, cancelOn) {
  if (db.isHumanMode(platform, userId)) return true;
  if (!db.getSettings().agentActive) return true;
  const client = db.getClient(platform, userId);
  if (!client) return false;
  if (cancelOn === 'photo' && client.photoReceived) return true;
  if (cancelOn === 'reply' && client.lastReplied) return true;
  return false;
}

// Cancela timers de uma chave
function cancelTimers(key) {
  if (timers[key]) {
    timers[key].forEach(t => clearTimeout(t));
    delete timers[key];
  }
}

// Cancela todos os timers de um usuário
function cancelAllForUser(platform, userId) {
  const prefix = `${platform}_${userId}_`;
  Object.keys(timers).filter(k => k.startsWith(prefix)).forEach(k => cancelTimers(k));
}

// Chamado quando chega foto — cancela follow-ups com cancelOn:'photo'
function onPhotoReceived(platform, userId) {
  const client = db.getClient(platform, userId) || {};
  db.saveClient(platform, userId, { ...client, photoReceived: true, photoReceivedAt: new Date().toISOString() });

  // Cancela todos os timers ativos desse usuário
  cancelAllForUser(platform, userId);
  console.log(`[FOLLOWUP] Foto recebida de ${userId} — todos os timers cancelados`);
}

// Chamado quando usuário responde qualquer coisa — cancela 'reply'
function onUserReply(platform, userId) {
  const client = db.getClient(platform, userId) || {};
  db.saveClient(platform, userId, { ...client, lastReplied: new Date().toISOString() });
}

function getActiveTimers() {
  return Object.keys(timers).map(key => {
    const parts = key.split('_');
    return { key, platform: parts[0], userId: parts[1], knowledgeId: parts[2], count: timers[key].length };
  });
}

module.exports = { scheduleFromKnowledge, onPhotoReceived, onUserReply, cancelAllForUser, getActiveTimers };
