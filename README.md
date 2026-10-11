# ⚡ ZapContas • Micro-SaaS Financeiro via WhatsApp Oficial

> Gestão financeira inteligente, ágil e descomplicada via WhatsApp com IA, modo casal/sócios e Dashboard Web em tempo real.

![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)
![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)
![Z-API](https://img.shields.io/badge/WhatsApp-Z--API-success.svg)
![License](https://img.shields.io/badge/License-MIT-purple.svg)

---

## 🚀 Funcionalidades

- 📱 **100% no WhatsApp:** Registre despesas e receitas por mensagens de texto e áudio ("Almoço 35 no débito", "Uber 22", "Recebi 1500 freela").
- 🤖 **IA & NLP Financeira:** Detecção automática de categorias, formas de pagamento e valores numéricos em moeda brasileira.
- 👥 **Modo Casal & Parceria:** Conexão de dois telefones no mesmo painel com divisão percentual de gastos.
- 📊 **Dashboard Web em Tempo Real:** Sem necessidade de senhas de banco ou logins complexos (Magic Token individual).
- 🔒 **Paywall & 7 Dias de Teste:** Controle automatizado de período de testes e bloqueio automático com solicitação de assinatura.
- ⚡ **Deploy Zero-Downtime:** Pronto para rodar no Render, Railway ou VPS.

---

## 🛠️ Instalação Local

```bash
# Instalar dependências
npm install

# Compilar TypeScript e sincronizar arquivos estáticos
npm run build

# Iniciar servidor em produção
npm start
```

---

## 🌐 Deploy no Render.com (24/7 Gratuito)

Este repositório já inclui o arquivo `render.yaml` pronto:
1. Conecte este repositório no [Render.com](https://render.com).
2. O Render criará o Web Service automaticamente.
3. Configure o Webhook na Z-API apontando para:
   `https://seu-app.onrender.com/webhook/whatsapp`

---

## 📄 Licença
Distribuído sob a licença MIT.
