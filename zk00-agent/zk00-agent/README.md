# 🤖 ZK00 Agent — Sistema de Atendimento Automático

Agente de IA que responde seu Telegram e WhatsApp automaticamente quando você estiver offline.

---

## 🚀 COMO SUBIR NO AR (Railway — grátis)

### PASSO 1 — Criar conta no GitHub
1. Acesse **github.com** e crie uma conta gratuita
2. Clique em **"New repository"**
3. Nome: `zk00-agent`
4. Marque **"Private"** (para proteger suas configs)
5. Clique em **"Create repository"**

### PASSO 2 — Fazer upload dos arquivos
1. No repositório criado, clique em **"uploading an existing file"**
2. Arraste TODOS os arquivos desta pasta (exceto `node_modules` e `.env`)
3. Clique em **"Commit changes"**

### PASSO 3 — Subir no Railway
1. Acesse **railway.app** e faça login com sua conta GitHub
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Escolha o repositório `zk00-agent`
5. Railway vai detectar automaticamente e fazer o deploy

### PASSO 4 — Configurar variáveis de ambiente no Railway
No painel do Railway, clique na sua aplicação → **"Variables"** → adicione:

```
PORT=3000
ADMIN_PASSWORD=coloque_sua_senha_aqui
ANTHROPIC_API_KEY=sk-ant-COLOQUE_SUA_KEY
TELEGRAM_BOT_TOKEN=COLOQUE_SEU_TOKEN
EVOLUTION_API_URL=https://SUA_EVOLUTION_API.com
EVOLUTION_API_KEY=COLOQUE_SUA_KEY
EVOLUTION_INSTANCE=zk00agent
WEBHOOK_SECRET=uma_string_secreta_qualquer
```

### PASSO 5 — Pegar a URL pública
1. No Railway, vá em **"Settings"** → **"Networking"** → **"Generate Domain"**
2. Você vai receber algo como: `zk00-agent-production.up.railway.app`
3. Adicione essa URL como variável: `SERVER_URL=https://zk00-agent-production.up.railway.app`
4. Faça um **"Redeploy"**

### PASSO 6 — Acessar o painel
1. Abra no navegador: `https://SUA_URL.railway.app`
2. Senha: o que você configurou em `ADMIN_PASSWORD`
3. Pronto! 🎉

---

## 🔌 CONECTANDO AS PLATAFORMAS

### Telegram
1. Abra o Telegram e procure por **@BotFather**
2. Digite `/newbot`
3. Escolha um nome (ex: "Rodrigo ZK00 Assistant")
4. Escolha um username (ex: `rodrigozk00_bot`)
5. Copie o **token** que o BotFather te mandar
6. No painel admin → **Integrações** → cole o token → clique **Conectar**
7. O webhook é configurado automaticamente!

### WhatsApp (Evolution API — gratuita)
1. Acesse **railway.app** → New Project → **"Deploy from GitHub"**
2. Use o template: `https://github.com/EvolutionAPI/evolution-api`
   (ou fork o repositório primeiro)
3. Adicione as variáveis:
   ```
   AUTHENTICATION_API_KEY=qualquer_chave_secreta_aqui
   ```
4. Gere um domínio para esta segunda aplicação
5. No painel do ZK00 Agent → **Integrações** → cole a URL da Evolution API
6. Clique em **"Ver QR Code"**
7. Abra o WhatsApp no seu celular → **Dispositivos vinculados** → **Vincular dispositivo**
8. Escaneie o QR Code
9. Pronto! Seu WhatsApp pessoal está conectado 📱

### Claude AI (Anthropic)
1. Acesse **console.anthropic.com**
2. Vá em **"API Keys"** → **"Create Key"**
3. Copie a chave (começa com `sk-ant-`)
4. Adicione no Railway como `ANTHROPIC_API_KEY`

---

## 🧪 TESTANDO SEM CONECTAR NADA

O sistema funciona em modo simulado mesmo sem as integrações!

1. Acesse o painel
2. Vá em **"Testar Agente"**
3. Digite qualquer mensagem
4. O agente responde com a base de conhecimento local

---

## 📁 ESTRUTURA DO PROJETO

```
zk00-agent/
├── src/
│   ├── server.js      ← Servidor principal (Express)
│   ├── agent.js       ← Lógica da IA (Claude)
│   ├── telegram.js    ← Integração Telegram
│   ├── whatsapp.js    ← Integração WhatsApp
│   └── database.js    ← Banco de dados (JSON local)
├── public/
│   └── index.html     ← Painel administrativo
├── data/              ← Criado automaticamente
│   └── zk00.json      ← Dados persistidos
├── .env.example       ← Template de variáveis
├── package.json
├── railway.toml       ← Config Railway
└── README.md
```

---

## 🔄 FLUXO DE UMA MENSAGEM

```
Cliente envia mensagem (TG ou WA)
         ↓
Webhook recebe no servidor
         ↓
Verifica: modo humano? → SIM → ignora (você responde)
         ↓ NÃO
Verifica: agente ativo? → NÃO → envia msg offline
         ↓ SIM
Verifica: precisa escalonar? → SIM → pausa IA + avisa cliente
         ↓ NÃO
Busca na base de conhecimento
         ↓
Envia para Claude API com histórico + personalidade
         ↓
Claude gera resposta humanizada
         ↓
Envia resposta ao cliente
         ↓
Salva no banco (histórico, cliente)
```

---

## ⚙️ FUNCIONALIDADES

- ✅ Responde Telegram e WhatsApp automaticamente
- ✅ Memória por usuário (lembra de conversas anteriores)
- ✅ Base de conhecimento editável pelo painel
- ✅ Modo humano (você assume qualquer chat)
- ✅ Escalonamento automático para situações críticas
- ✅ Painel admin com dashboard em tempo real
- ✅ Funciona sem API key (modo base de conhecimento)
- ✅ Deploy com 1 clique no Railway

---

## 💰 CUSTO

| Serviço | Custo |
|---------|-------|
| Railway (servidor) | Grátis até 500h/mês |
| Evolution API (WhatsApp) | Grátis (open source) |
| Telegram Bot API | Grátis |
| Claude API (IA) | ~$0.01 por conversa |

**Para começar: custo zero.** Só paga pela IA quando tiver muitas conversas.

---

## 🆘 SUPORTE

Se travar em algum passo:
1. Verifique os logs no Railway (aba "Logs")
2. Teste o endpoint: `https://SUA_URL/health`
3. Verifique se todas as variáveis estão configuradas
