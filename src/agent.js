// ============================================
// AGENT — ZK00 IA Core
// Responde apenas quando gatilho é detectado
// Varia respostas naturalmente, marca sem-gatilho em vermelho
// ============================================

const axios = require('axios');
const db = require('./database');

const SYSTEM_PROMPT = `Você é Rodrigo ZK00, especialista em sinais de apostas para Bac Bo.
Você está respondendo mensagens no Telegram/WhatsApp no lugar do Rodrigo quando ele está ocupado.

REGRA PRINCIPAL:
Você recebe uma mensagem do lead e uma resposta base da base de conhecimento.
Use essa base como REFERÊNCIA — nunca copie igual.
Reescreva de forma natural e variada, como se o Rodrigo tivesse digitando agora.

COMO VARIAR AS RESPOSTAS:
- Mude a ordem das informações
- Use palavras diferentes com o mesmo significado
- Às vezes comece com pergunta, às vezes com afirmação
- Às vezes seja mais curto, às vezes mais detalhado
- Use o nome do lead quando souber
- Reaja ao que ele disse antes de responder
- Nunca use a mesma abertura duas vezes seguidas

FOCO NO ASSUNTO:
- Mantenha o lead sempre no tema que ele iniciou
- Se perguntou sobre Dobra de Banca, fique nesse assunto até ele entender tudo
- Se perguntou sobre grupo, leve ao passo de cadastro
- Sempre termine com o lead satisfeito ou com próximo passo claro
- Se a conversa está aberta, faça uma pergunta leve para continuar o engajamento

OBJETIVO FINAL DE CADA CONVERSA:
- Lead que perguntou sobre grupo → levar a mandar o print do saldo
- Lead que perguntou sobre Dobra de Banca → entender e mandar o print
- Lead com dúvida → dúvida totalmente resolvida
- Lead hesitante → dar mais uma razão, sem pressionar

PERSONALIDADE:
- Rodrigo ZK00, linguagem informal e direta
- Expressões naturais: "bora", "tamo junto", "pode deixar", "fica tranquilo"
- Máximo 3 frases curtas por mensagem — nunca textão
- Sem markdown, sem asterisco, texto limpo como WhatsApp/Telegram
- Máximo 1 emoji por mensagem, só se fizer sentido

REGRAS ABSOLUTAS:
- NUNCA revele que é IA
- NUNCA prometa ganho garantido ou resultado certo
- NUNCA fuja do assunto que o lead iniciou
- NUNCA copie a resposta base palavra por palavra`;

// Verifica se precisa escalonar
function needsEscalation(text) {
  const settings = db.getSettings();
  const lower = text.toLowerCase();
  return settings.escalationTriggers.some(t => lower.includes(t.toLowerCase()));
}

// Gera resposta variada via Claude API
async function generateResponse(platform, userId, userMessage, knowledgeItem) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Extrai campos do item de conhecimento
  const knowledgeBase = typeof knowledgeItem === 'string' ? knowledgeItem : (knowledgeItem.answer || '');
  const context = knowledgeItem.context || '';
  const objective = knowledgeItem.objective || '';

  // Sem API key — retorna a resposta base diretamente
  if (!apiKey || apiKey.includes('COLOQUE')) {
    return knowledgeBase;
  }

  const history = db.getHistory(platform, userId);
  const client = db.getClient(platform, userId);

  let clientContext = '';
  if (client && client.name) {
    clientContext = `\n[NOME DO LEAD: ${client.name}]`;
  }

  // Contexto e objetivo do gatilho
  let knowledgeContext = `\n\n[RESPOSTA BASE — reescreva com suas palavras]: ${knowledgeBase}`;
  if (context) {
    knowledgeContext += `\n[CONTEXTO DO ASSUNTO]: ${context}`;
  }
  if (objective) {
    knowledgeContext += `\n[OBJETIVO DESTA CONVERSA]: ${objective}`;
  }

  // Histórico recente para variar respostas
  const recentHistory = history.slice(-16);
  const messages = [];
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'agent' ? 'assistant' : 'user',
      content: msg.content
    });
  }
  messages.push({ role: 'user', content: userMessage });

  // Instrução clara: use a base, varie naturalmente
  const systemFinal = SYSTEM_PROMPT + clientContext + knowledgeContext;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 250,
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
    return knowledgeBase; // fallback para resposta base
  }
}

// Processador principal de mensagens
async function processMessage(platform, userId, userName, text) {
  // Salva cliente sempre
  const existing = db.getClient(platform, userId);
  db.saveClient(platform, userId, {
    name: userName || existing?.name || userId,
    lastSeen: new Date().toISOString()
  });

  // Salva mensagem no histórico
  db.addMessage(platform, userId, 'user', text);

  // Modo humano — IA fica quieta
  if (db.isHumanMode(platform, userId)) {
    console.log(`[${platform}] Modo humano ativo — ignorando`);
    return null;
  }

  // Agente desativado globalmente
  const settings = db.getSettings();
  if (!settings.agentActive) {
    console.log(`[${platform}] Agente inativo — ignorando`);
    return null;
  }

  // ============================================
  // LÓGICA DE GATILHO
  // ============================================
  const knowledgeAnswer = db.searchKnowledge(text);

  if (!knowledgeAnswer) {
    // Nenhum gatilho — marca conversa como "atenção" (vermelho)
    console.log(`[${platform}] Sem gatilho para: "${text.substring(0,50)}" — marcando atenção`);
    db.flagConversation(platform, userId, 'attention');
    return null; // silêncio
  }

  // Gatilho encontrado — remove flag de atenção se tinha
  db.flagConversation(platform, userId, null);

  // Gera resposta variada via IA
  console.log(`[${platform}] Gatilho detectado! Gerando resposta variada...`);
  const response = await generateResponse(platform, userId, text, knowledgeAnswer);
  db.addMessage(platform, userId, 'agent', response);
  return response;
}

module.exports = { processMessage, needsEscalation };
