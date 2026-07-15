// ============================================
// AGENT — ZK00 IA Core
// Gerencia respostas inteligentes via Claude API
// ============================================

const axios = require('axios');
const db = require('./database');

// Prompt do sistema — personalidade do Rodrigo ZK00
const SYSTEM_PROMPT = `Você é Rodrigo ZK00, especialista em sinais de apostas para o jogo Bac Bo.
Você responde mensagens no Telegram e WhatsApp quando está offline.

IDENTIDADE:
- Você NÃO é um robô. Responda como uma pessoa real.
- Nome: Rodrigo ZK00
- Especialidade: Robô de sinais 24h para Bac Bo
- Tom: amigável, objetivo, confiante, direto

PERSONALIDADE:
- Educado mas sem formalidade excessiva
- Linguagem simples, sem termos técnicos
- Respostas curtas e naturais (máximo 3 parágrafos curtos)
- Nunca responde tudo de uma vez
- Adapta o tamanho da resposta ao que o cliente escreveu

EXPRESSÕES QUE VOCÊ USA (naturalmente, sem forçar):
- "Bora pra cima"
- "Tamo junto"
- "Pode deixar"
- "Fica tranquilo"
- "Já te explico"
- "Qualquer dúvida me chama"
- "Vamos resolver"

REGRAS ABSOLUTAS — NUNCA QUEBRE:
1. NUNCA diga "lucro garantido", "certeza absoluta", "sem risco" ou "vai ganhar"
2. NUNCA prometa valores específicos de ganho
3. NUNCA pareça um chatbot (não use "como posso ajudá-lo?" ou frases robóticas)
4. NUNCA use emojis em excesso (máximo 1-2 por mensagem)
5. NUNCA escreva mensagens enormes — seja objetivo
6. NUNCA revele que é uma IA ou sistema automatizado
7. Se perguntarem "você é um robô?" ou "é IA?" — responda naturalmente que é você mesmo, só estava ocupado

SOBRE O NEGÓCIO:
- Você tem um robô de sinais 24h para o jogo Bac Bo
- Tem grupo VIP (para quem se cadastra na casa parceira e manda print do saldo)
- Tem grupo Free (gratuito, sinais limitados)
- Lives acontecem de segunda a sexta às 20h no Telegram
- Nunca prometa ganhos — todo jogo tem risco

ESCALONAMENTO — identifique essas situações e diga que vai chamar o Rodrigo pessoalmente:
- Problemas financeiros graves
- Conta bloqueada
- Reclamações sérias
- Solicitações de parceria ou patrocínio
- Questões jurídicas
- Pedidos incomuns ou suspeitos

FORMATO DAS RESPOSTAS:
- Sem asteriscos ou markdown
- Texto limpo como mensagem real de WhatsApp/Telegram
- Máximo 2-3 frases por mensagem na maioria dos casos`;

// Verifica se precisa escalonar
function needsEscalation(text) {
  const settings = db.getSettings();
  const lower = text.toLowerCase();
  return settings.escalationTriggers.some(t => lower.includes(t.toLowerCase()));
}

// Gera resposta via Claude API
async function generateResponse(platform, userId, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.includes('COLOQUE')) {
    // Modo sem API key — usa base de conhecimento
    const knowledgeAnswer = db.searchKnowledge(userMessage);
    if (knowledgeAnswer) return knowledgeAnswer;
    return 'Oi! Recebi sua mensagem, tô um pouco ocupado mas já respondo. Tamo junto! 👊';
  }

  // Busca histórico do usuário
  const history = db.getHistory(platform, userId);
  const client = db.getClient(platform, userId);

  // Monta contexto do cliente
  let clientContext = '';
  if (client) {
    clientContext = `\n[CONTEXTO DO CLIENTE: Nome: ${client.name || 'Desconhecido'}, Plataforma: ${platform}${client.tags ? ', Tags: ' + client.tags.join(', ') : ''}]`;
  }

  // Verifica base de conhecimento primeiro (mais rápido e econômico)
  const knowledgeAnswer = db.searchKnowledge(userMessage);

  // Monta as mensagens para o Claude
  const messages = [];

  // Histórico recente (últimas 10 trocas)
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'agent' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  // Mensagem atual
  messages.push({ role: 'user', content: userMessage });

  // Se tem resposta na base, dá uma dica ao Claude
  let systemFinal = SYSTEM_PROMPT + clientContext;
  if (knowledgeAnswer) {
    systemFinal += `\n\n[BASE DE CONHECIMENTO — use como referência mas adapte naturalmente]: ${knowledgeAnswer}`;
  }

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemFinal,
        messages
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data.content[0].text;
  } catch (err) {
    console.error('Erro Claude API:', err.response?.data || err.message);
    // Fallback para base de conhecimento
    if (knowledgeAnswer) return knowledgeAnswer;
    return 'Oi! Recebi sua mensagem, tô um pouco ocupado mas já respondo em breve. Tamo junto! 👊';
  }
}

// Processador principal de mensagens
async function processMessage(platform, userId, userName, text) {
  // Salva/atualiza cliente
  const existing = db.getClient(platform, userId);
  db.saveClient(platform, userId, {
    name: userName || existing?.name || userId,
    lastSeen: new Date().toISOString()
  });

  // Salva mensagem do usuário
  db.addMessage(platform, userId, 'user', text);

  // Verifica modo humano
  if (db.isHumanMode(platform, userId)) {
    console.log(`[${platform}] Chat ${userId} em modo humano — ignorando`);
    return null;
  }

  // Verifica se agente está ativo
  const settings = db.getSettings();
  if (!settings.agentActive) {
    const offlineMsg = settings.offlineMessage;
    db.addMessage(platform, userId, 'agent', offlineMsg);
    return offlineMsg;
  }

  // Verifica se precisa escalonar
  if (needsEscalation(text)) {
    const escalMsg = 'Entendi a situação. Vou chamar o Rodrigo pessoalmente para te atender, ele vai falar com você em breve. Pode deixar! 🤝';
    db.addMessage(platform, userId, 'agent', escalMsg);
    db.setHumanMode(platform, userId, true);

    // Notifica via console (em produção poderia ser webhook)
    console.log(`⚠️ ESCALONAMENTO: ${platform} | ${userId} | Mensagem: ${text}`);

    return escalMsg;
  }

  // Gera resposta via IA
  const response = await generateResponse(platform, userId, text);
  db.addMessage(platform, userId, 'agent', response);

  return response;
}

module.exports = { processMessage, needsEscalation };
