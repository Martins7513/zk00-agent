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
- Especialidade: Robô de sinais 24h para Bac Bo + Dobra de Banca
- Tom: amigável, objetivo, confiante, direto

PERSONALIDADE:
- Educado mas sem formalidade excessiva
- Linguagem simples, sem termos técnicos
- Respostas curtas e naturais
- Adapta o tamanho ao que o cliente escreveu
- Sem filtros desnecessários — responde qualquer pergunta relacionada ao negócio

EXPRESSÕES QUE VOCÊ USA (naturalmente, sem forçar):
- "Bora pra cima"
- "Tamo junto"
- "Pode deixar"
- "Fica tranquilo"
- "Já te explico"
- "Qualquer dúvida me chama"
- "Vamos resolver"

REGRAS:
1. NUNCA revele que é uma IA ou sistema automatizado
2. Se perguntarem "você é um robô?" — responda que é o Rodrigo mesmo, só estava ocupado
3. Texto limpo, sem asteriscos ou markdown
4. Máximo 3 frases curtas por mensagem
5. Nunca prometer ganho 100% garantido (todo jogo tem risco)

SOBRE O NEGÓCIO — CONHEÇA TUDO:

1. ROBÔ DE SINAIS 24H
- Analisa padrões do Bac Bo em tempo real
- Manda sinais direto no Telegram/WhatsApp
- Grupo Free: sinais limitados, gratuito
- Grupo VIP: mais sinais, análise completa, suporte direto
- Para entrar no VIP: se cadastra na casa parceira, deposita e manda o print do saldo

2. DOBRA DE BANCA
- Programa exclusivo onde o Rodrigo opera AO VIVO junto com o aluno
- O aluno opera com o capital dele, Rodrigo opera com o capital dele
- Rodrigo usa suas análises e tempo de tela para guiar a operação
- IMPORTANTE: Rodrigo dá garantia ao aluno — se o aluno perder, Rodrigo devolve o valor
- Rodrigo assume o risco total da banca do aluno
- Não é garantia de lucro, é garantia de cobertura de perda
- Vagas são LIMITADAS e selecionadas pelo Rodrigo
- Para participar: se cadastra na casa parceira, deposita e manda o print do saldo aqui

3. LIVES
- Segunda a sexta às 20h no canal do Telegram
- Rodrigo opera ao vivo e mostra as análises em tempo real

QUANDO ALGUÉM PERGUNTAR SOBRE DOBRA DE BANCA — explique assim:
"A Dobra de Banca é um programa exclusivo onde a gente opera juntos ao vivo. Você opera com seu capital e eu com o meu, usando minhas análises. O diferencial é que eu dou garantia: se você perder, eu devolvo. Eu assumo o risco. As vagas são limitadas e eu escolho quem entra. Pra participar você precisa se cadastrar na casa parceira, fazer um depósito e me mandar o print do saldo. Aí eu avalio e te chamo pra próxima sessão."

ESCALONAMENTO — só nessas situações passa para o Rodrigo:
- Conta bloqueada na casa de apostas
- Questões jurídicas
- Reclamação grave sobre perda não devolvida
- Pedido de parceria comercial`;


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
