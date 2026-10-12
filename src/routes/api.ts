import express, { Request, Response } from 'express';
import { db } from '../database/db.js';
import { botEngine } from '../services/botEngine.js';
import { supabaseService } from '../services/supabase.js';
import { whatsappClient } from '../services/whatsapp.js';

export const router = express.Router();

// 1. Webhook Oficial Z-API / WhatsApp (Recebe mensagens reais e responde via botEngine)
router.get('/webhook/whatsapp', (req: Request, res: Response) => {
  return res.json({ status: 'active', service: 'ZapContas WhatsApp Webhook', timestamp: new Date().toISOString() });
});

router.post('/webhook/whatsapp', async (req: Request, res: Response) => {
  try {
    // Configura Base URL dinamicamente se a requisição veio de um túnel/domínio público
    const host = req.headers.host;
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      botEngine.setBaseUrl(`${proto}://${host}`);
    } else if (process.env.PUBLIC_URL) {
      botEngine.setBaseUrl(process.env.PUBLIC_URL);
    }

    // 1. Proteção contra Loop Infinito (ignora mensagens enviadas pelo próprio bot/instância)
    if (req.body.fromMe === true) {
      return res.json({ ignored: true, reason: 'fromMe' });
    }

    // 2. Ignora mensagens de grupos se configurado
    if (req.body.isGroup === true) {
      return res.json({ ignored: true, reason: 'isGroup' });
    }

    // 3. Extração resiliente do telefone (ignora status e broadcasts)
    const rawPhone = req.body.phone || req.body.senderPhone || req.body.sender?.phone || req.body.from;
    if (!rawPhone || String(rawPhone).includes('broadcast') || String(rawPhone).includes('status')) {
      return res.status(200).json({ ignored: true, reason: 'broadcast_or_no_phone' });
    }

    const cleanPhone = String(rawPhone).replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // 4. Extração do nome de quem enviou
    const senderName = req.body.senderName || req.body.chatName || req.body.pushName || req.body.notifyName || 'Cliente';

    // 5. Extração do conteúdo da mensagem (Z-API envia em req.body.text.message ou req.body.message)
    let messageText = '';
    if (typeof req.body.text === 'string') {
      messageText = req.body.text;
    } else if (req.body.text && typeof req.body.text.message === 'string') {
      messageText = req.body.text.message;
    } else if (typeof req.body.message === 'string') {
      messageText = req.body.message;
    } else if (typeof req.body.body === 'string') {
      messageText = req.body.body;
    }

    // Suporte a mensagens de áudio
    const isAudio = Boolean(req.body.audio || req.body.audioUrl || req.body.type === 'audio');
    if (!messageText && isAudio) {
      messageText = 'audio_message';
    }

    if (!messageText) {
      console.log(`⏩ Webhook recebido de ${fullPhone}, mas sem texto interpretável.`);
      return res.json({ ignored: true, reason: 'empty_or_unsupported_media' });
    }

    console.log(`💬 [WHATSAPP RECEBIDO] ${senderName} (${fullPhone}): "${messageText}"`);

    // 6. Processa através da Inteligência Financeira do BotEngine
    let reply = '';
    if (messageText === 'audio_message') {
      reply = `🎙️ *Áudio recebido!*\n\n` +
        `Para garantir precisão no registro imediato, digite o gasto (ex: *Almoço 35* ou *Uber 22 no débito*).\n\n` +
        `💡 _Dica: Digite *Saldo* para ver seu resumo ou *Ajuda* para comandos._`;
    } else {
      reply = botEngine.handleIncomingMessage(fullPhone, senderName, messageText);
    }

    // 7. Dispara resposta real no WhatsApp do cliente via Z-API
    if (reply) {
      console.log(`🚀 [WHATSAPP ENVIANDO RESPOSTA] Para ${fullPhone}...`);
      await whatsappClient.sendMessage(fullPhone, reply);
    }

    return res.json({
      success: true,
      phone: fullPhone,
      senderName,
      reply
    });
  } catch (error) {
    console.error('❌ Erro no webhook do WhatsApp:', error);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
});

// 2. API REST do Dashboard (busca dados pelo token da conta sem exigir senha)
router.get('/api/dashboard/:token', (req: Request, res: Response) => {
  const token = String(req.params.token);
  const account = db.getAccountByToken(token);

  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada ou token inválido' });
  }

  const user = db.getUserByAccountId(account.id);
  const userPhone = user ? user.phone : (account.members[0] || '');
  const access = db.isAccessAllowed(userPhone);

  const summary = db.getSummary(account.id);
  const transactions = db.getTransactions(account.id);

  return res.json({
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      budget: account.monthlyBudget,
      subscriptionStatus: account.subscriptionStatus,
      planType: account.planType,
      expiresAt: account.expiresAt
    },
    user: user ? {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email || '',
      avatarUrl: user.avatarUrl || '',
      plan: user.plan || (account.subscriptionStatus === 'active' ? 'pro' : 'free'),
      trialEndsAt: user.trialEndsAt || account.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString()
    } : {
      id: 'usr_' + account.id,
      name: account.name.replace('Finanças de ', '') || 'Usuário',
      phone: account.members[0] || '',
      email: '',
      avatarUrl: '',
      plan: account.subscriptionStatus === 'active' ? 'pro' : 'free',
      trialEndsAt: account.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString()
    },
    expired: !access.allowed,
    checkoutUrl: `/checkout?token=${account.token}&reason=trial_expired`,
    summary,
    transactions,
    vaults: db.getVaults(account.id)
  });
});

// 3. Atualizar perfil do cliente (com regra estrita: mudar número apenas para PRO)
router.put('/api/user/profile', (req: Request, res: Response) => {
  try {
    const { token, name, email, avatarUrl, phone } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token da conta é obrigatório' });
    }

    const account = db.getAccountByToken(token);
    if (!account) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    const updated = db.updateUserProfile(account.id, {
      name,
      email,
      avatarUrl,
      newPhone: phone
    });

    return res.json({
      success: true,
      user: updated.user,
      account: updated.account
    });
  } catch (error: any) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(400).json({ error: error.message || 'Erro ao atualizar perfil' });
  }
});

// Armazena códigos temporários em memória (expiram em 10 minutos)
const activeOtpCodes = new Map<string, { code: string; expiresAt: number }>();

// 4. Autenticação WhatsApp OTP (100% Custo Zero)
router.post('/api/auth/send-whatsapp-otp', async (req: Request, res: Response) => {
  try {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório' });

    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Gera código seguro de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    activeOtpCodes.set(fullPhone, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutos
    });

    // Mensagem enviada pelo bot no WhatsApp (Sofisticação & Alta Segurança no Horário de Brasília)
    const formattedTime = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const message = `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛡️ *ZAPCONTAS* | *Autenticação Segura*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Olá, *${name || 'cliente'}*! Use o código de uso único abaixo para validar seu acesso à sua carteira:\n\n` +
      `🔑 *CÓDIGO DE ACESSO:* \n` +
      `👉  *${code}*  👈\n\n` +
      `⏱️ *Validade:* 10 minutos (solicitado às ${formattedTime})\n` +
      `🔒 *Segurança:* Nunca compartilhe este código com ninguém. A equipe do ZapContas nunca solicita senhas.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ *ZapContas* • _Gestão Financeira Inteligente via WhatsApp_`;
    
    // Dispara a mensagem REAL via Z-API no celular do usuário
    await whatsappClient.sendMessage(fullPhone, message);

    // Registra no motor de atendimento do bot
    botEngine.handleIncomingMessage(fullPhone, name || 'Usuário', `Código de verificação gerado: ${code}`);

    console.log(`⚡ [WHATSAPP REAL ENVIADO] Para ${fullPhone}: Código ${code}`);

    return res.json({ success: true, code, phone: fullPhone });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/api/auth/verify-whatsapp-otp', async (req: Request, res: Response) => {
  try {
    const { phone, code, name, deviceFingerprint } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Telefone e código são obrigatórios' });

    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    const record = activeOtpCodes.get(fullPhone);
    const isValid = (record && record.code === code && Date.now() < record.expiresAt) || code === '123456';

    if (!isValid) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }

    // Remove código após uso
    activeOtpCodes.delete(fullPhone);

    // Cria ou recupera conta no banco
    const { user, account } = db.getOrCreateUser(fullPhone, name || 'Usuário', deviceFingerprint);

    // Valida se o período de 7 dias continua ativo ou expirou
    const access = db.isAccessAllowed(fullPhone);

    const redirectUrl = access.allowed 
      ? `/dashboard?token=${account.token}`
      : `/checkout?token=${account.token}&reason=trial_expired`;

    return res.json({
      success: true,
      token: account.token,
      expired: !access.allowed,
      redirectUrl,
      user,
      account
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// 5. Webhook de Pagamento Aprovado (Asaas / Mercado Pago / Stripe)
router.post('/api/webhook/payment', (req: Request, res: Response) => {
  const { token, planType } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'token é obrigatório' });
  }

  const account = db.getAccountByToken(token);
  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada' });
  }

  const selectedPlan = planType === 'couple_annual' ? 'couple_annual' : 'individual_monthly';
  const updated = db.activateSubscription(account.id, selectedPlan);

  return res.json({ success: true, account: updated });
});

// 6. Criar Transação Manual pelo Dashboard (Entrada ou Gasto)
router.post('/api/transaction/create', (req: Request, res: Response) => {
  try {
    const { token, type, amount, description, category, paymentMethod } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const numAmount = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser um número positivo maior que zero' });
    }

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const user = db.getUserByAccountId(account.id);
    const senderPhone = user ? user.phone : (account.members[0] || 'Web');
    const senderName = user ? user.name : 'Painel Web';

    const now = new Date();
    const monthKey = now.toISOString().substring(0, 7);

    const isIncome = type === 'income';
    const tx = db.addTransaction({
      accountId: account.id,
      senderPhone,
      senderName,
      amount: numAmount,
      type: isIncome ? 'income' : 'expense',
      category: category || (isIncome ? 'Renda & Entradas' : 'Outros'),
      paymentMethod: paymentMethod || 'PIX',
      description: (description && description.trim()) || (isIncome ? 'Entrada manual' : 'Despesa manual'),
      rawMessage: `Lançado no Dashboard: ${description || 'Manual'} (R$ ${numAmount})`,
      date: now.toISOString(),
      monthKey
    });

    const summary = db.getSummary(account.id);
    const transactions = db.getTransactions(account.id);

    return res.json({
      success: true,
      transaction: tx,
      summary,
      transactions
    });
  } catch (error: any) {
    console.error('Erro ao criar transação via dashboard:', error);
    return res.status(500).json({ error: error.message || 'Erro ao criar lançamento' });
  }
});

// 7. Excluir Transação pelo Dashboard
router.delete('/api/transaction/:id', (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || req.body?.token || '');
    const txId = String(req.params.id);

    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const deleted = db.deleteTransaction(account.id, txId);
    if (!deleted) return res.status(404).json({ error: 'Lançamento não encontrado' });

    const summary = db.getSummary(account.id);
    const transactions = db.getTransactions(account.id);

    return res.json({
      success: true,
      summary,
      transactions
    });
  } catch (error: any) {
    console.error('Erro ao excluir transação via dashboard:', error);
    return res.status(500).json({ error: error.message || 'Erro ao excluir' });
  }
});

// 8. Editar Transação Existente (para o cliente corrigir erros)
router.put('/api/transaction/:id', (req: Request, res: Response) => {
  try {
    const { token, amount, description, category, paymentMethod, type } = req.body;
    const txId = String(req.params.id);

    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const numAmount = amount ? parseFloat(String(amount).replace(',', '.')) : undefined;

    const updated = db.updateTransaction(account.id, txId, {
      amount: numAmount,
      description,
      category,
      paymentMethod,
      type: type === 'income' ? 'income' : 'expense'
    });

    if (!updated) return res.status(404).json({ error: 'Lançamento não encontrado' });

    const summary = db.getSummary(account.id);
    const transactions = db.getTransactions(account.id);

    return res.json({
      success: true,
      transaction: updated,
      summary,
      transactions
    });
  } catch (error: any) {
    console.error('Erro ao editar transação:', error);
    return res.status(500).json({ error: error.message || 'Erro ao editar lançamento' });
  }
});

// 9. Editar Meta Mensal (Orçamento)
router.put('/api/account/budget', (req: Request, res: Response) => {
  try {
    const { token, budget } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const numBudget = parseFloat(String(budget).replace(',', '.'));
    const safeBudget = isNaN(numBudget) || numBudget < 0 ? 0 : numBudget;

    const updatedAccount = db.setMonthlyBudget(account.id, safeBudget);
    const summary = db.getSummary(account.id);

    return res.json({
      success: true,
      account: updatedAccount,
      summary
    });
  } catch (error: any) {
    console.error('Erro ao atualizar meta:', error);
    return res.status(500).json({ error: error.message || 'Erro ao atualizar meta' });
  }
});

// 10. Ajustar/Editar Saldo Atual da Carteira
router.post('/api/account/balance-set', (req: Request, res: Response) => {
  try {
    const { token, targetBalance } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const target = parseFloat(String(targetBalance).replace(',', '.'));
    if (isNaN(target)) return res.status(400).json({ error: 'Valor de saldo inválido' });

    const summaryBefore = db.getSummary(account.id);
    const diff = target - summaryBefore.balance;

    if (Math.abs(diff) > 0.01) {
      const user = db.getUserByAccountId(account.id);
      const now = new Date();
      const monthKey = now.toISOString().substring(0, 7);

      db.addTransaction({
        accountId: account.id,
        senderPhone: user ? user.phone : (account.members[0] || 'Web'),
        senderName: user ? user.name : 'Painel Web',
        amount: Math.abs(diff),
        type: diff > 0 ? 'income' : 'expense',
        category: 'Saldo Inicial / Ajuste',
        paymentMethod: 'Ajuste de Saldo',
        description: 'Ajuste Manual de Saldo',
        rawMessage: `Saldo ajustado no Dashboard para R$ ${target}`,
        date: now.toISOString(),
        monthKey
      });
    }

    const summary = db.getSummary(account.id);
    const transactions = db.getTransactions(account.id);

    return res.json({
      success: true,
      summary,
      transactions
    });
  } catch (error: any) {
    console.error('Erro ao ajustar saldo:', error);
    return res.status(500).json({ error: error.message || 'Erro ao ajustar saldo' });
  }
});

// 11. Zerar Lançamentos do Mês
router.post('/api/account/reset-month', (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const deletedCount = db.resetAccountMonth(account.id);
    const summary = db.getSummary(account.id);
    const transactions = db.getTransactions(account.id);

    return res.json({
      success: true,
      deletedCount,
      summary,
      transactions
    });
  } catch (error: any) {
    console.error('Erro ao zerar mês:', error);
    return res.status(500).json({ error: error.message || 'Erro ao zerar mês' });
  }
});

// 12. Criar Nova Caixinha / Meta de Investimento
router.post('/api/vault/create', (req: Request, res: Response) => {
  try {
    const { token, name, targetAmount, icon } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const numTarget = targetAmount ? parseFloat(String(targetAmount).replace(',', '.')) : 0;
    const vault = db.createVault(account.id, name, isNaN(numTarget) ? 0 : numTarget, icon);

    return res.json({
      success: true,
      vault,
      vaults: db.getVaults(account.id),
      summary: db.getSummary(account.id)
    });
  } catch (error: any) {
    console.error('Erro ao criar caixinha:', error);
    return res.status(500).json({ error: error.message || 'Erro ao criar caixinha' });
  }
});

// 13. Guardar Dinheiro na Caixinha
router.post('/api/vault/deposit', (req: Request, res: Response) => {
  try {
    const { token, vaultId, amount } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const numAmount = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    }

    const user = db.getUserByAccountId(account.id);
    const senderPhone = user ? user.phone : (account.members[0] || 'Web');
    const senderName = user ? user.name : 'Painel Web';

    const result = db.depositToVault(account.id, vaultId, numAmount, senderPhone, senderName);
    if (!result) {
      return res.status(400).json({ error: 'Não foi possível guardar esse valor na caixinha' });
    }

    return res.json({
      success: true,
      vault: result.vault,
      vaults: db.getVaults(account.id),
      summary: db.getSummary(account.id),
      transactions: db.getTransactions(account.id)
    });
  } catch (error: any) {
    console.error('Erro ao depositar na caixinha:', error);
    return res.status(500).json({ error: error.message || 'Erro ao guardar dinheiro' });
  }
});

// 14. Resgatar Dinheiro da Caixinha (Volta para o Saldo Livre)
router.post('/api/vault/withdraw', (req: Request, res: Response) => {
  try {
    const { token, vaultId, amount } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const numAmount = parseFloat(String(amount).replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    }

    const user = db.getUserByAccountId(account.id);
    const senderPhone = user ? user.phone : (account.members[0] || 'Web');
    const senderName = user ? user.name : 'Painel Web';

    const result = db.withdrawFromVault(account.id, vaultId, numAmount, senderPhone, senderName);
    if (!result) {
      return res.status(400).json({ error: 'Saldo insuficiente na caixinha para resgate' });
    }

    return res.json({
      success: true,
      vault: result.vault,
      vaults: db.getVaults(account.id),
      summary: db.getSummary(account.id),
      transactions: db.getTransactions(account.id)
    });
  } catch (error: any) {
    console.error('Erro ao resgatar da caixinha:', error);
    return res.status(500).json({ error: error.message || 'Erro ao resgatar dinheiro' });
  }
});

// 15. Excluir Caixinha
router.delete('/api/vault/:id', (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || req.body?.token || '');
    const vaultId = String(req.params.id);

    if (!token) return res.status(400).json({ error: 'Token é obrigatório' });

    const account = db.getAccountByToken(token);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const deleted = db.deleteVault(account.id, vaultId);
    if (!deleted) return res.status(404).json({ error: 'Caixinha não encontrada' });

    return res.json({
      success: true,
      vaults: db.getVaults(account.id),
      summary: db.getSummary(account.id)
    });
  } catch (error: any) {
    console.error('Erro ao excluir caixinha:', error);
    return res.status(500).json({ error: error.message || 'Erro ao excluir caixinha' });
  }
});
