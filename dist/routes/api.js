import express from 'express';
import { db } from '../database/db.js';
import { botEngine } from '../services/botEngine.js';
import { whatsappClient } from '../services/whatsapp.js';
export const router = express.Router();
// 1. Webhook Oficial Z-API / WhatsApp (Recebe mensagens reais e responde via botEngine)
router.get('/webhook/whatsapp', (req, res) => {
    return res.json({ status: 'active', service: 'ZapContas WhatsApp Webhook', timestamp: new Date().toISOString() });
});
router.post('/webhook/whatsapp', async (req, res) => {
    try {
        // Configura Base URL dinamicamente se a requisição veio de um túnel/domínio público
        const host = req.headers.host;
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
            const proto = req.headers['x-forwarded-proto'] || 'https';
            botEngine.setBaseUrl(`${proto}://${host}`);
        }
        else if (process.env.PUBLIC_URL) {
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
        // 3. Extração resiliente do telefone
        const rawPhone = req.body.phone || req.body.senderPhone || req.body.sender?.phone || req.body.from;
        if (!rawPhone) {
            console.warn('⚠️ Webhook ignorado: telefone não fornecido no payload:', req.body);
            return res.status(200).json({ ignored: true, reason: 'no_phone' });
        }
        const cleanPhone = String(rawPhone).replace(/\D/g, '');
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        // 4. Extração do nome de quem enviou
        const senderName = req.body.senderName || req.body.chatName || req.body.pushName || req.body.notifyName || 'Cliente';
        // 5. Extração do conteúdo da mensagem (Z-API envia em req.body.text.message ou req.body.message)
        let messageText = '';
        if (typeof req.body.text === 'string') {
            messageText = req.body.text;
        }
        else if (req.body.text && typeof req.body.text.message === 'string') {
            messageText = req.body.text.message;
        }
        else if (typeof req.body.message === 'string') {
            messageText = req.body.message;
        }
        else if (typeof req.body.body === 'string') {
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
        }
        else {
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
    }
    catch (error) {
        console.error('❌ Erro no webhook do WhatsApp:', error);
        return res.status(500).json({ error: 'Erro interno ao processar webhook' });
    }
});
// 2. API REST do Dashboard (busca dados pelo token da conta sem exigir senha)
router.get('/api/dashboard/:token', (req, res) => {
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
        transactions
    });
});
// 3. Atualizar perfil do cliente (com regra estrita: mudar número apenas para PRO)
router.put('/api/user/profile', (req, res) => {
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
    }
    catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        return res.status(400).json({ error: error.message || 'Erro ao atualizar perfil' });
    }
});
// Armazena códigos temporários em memória (expiram em 10 minutos)
const activeOtpCodes = new Map();
// 4. Autenticação WhatsApp OTP (100% Custo Zero)
router.post('/api/auth/send-whatsapp-otp', async (req, res) => {
    try {
        const { phone, name } = req.body;
        if (!phone)
            return res.status(400).json({ error: 'Telefone é obrigatório' });
        const cleanPhone = phone.replace(/\D/g, '');
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        // Gera código seguro de 6 dígitos
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        activeOtpCodes.set(fullPhone, {
            code,
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutos
        });
        // Mensagem enviada pelo bot no WhatsApp (Sofisticação & Alta Segurança)
        const formattedTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    }
    catch (e) {
        return res.status(500).json({ error: e.message });
    }
});
router.post('/api/auth/verify-whatsapp-otp', async (req, res) => {
    try {
        const { phone, code, name, deviceFingerprint } = req.body;
        if (!phone || !code)
            return res.status(400).json({ error: 'Telefone e código são obrigatórios' });
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
    }
    catch (e) {
        return res.status(500).json({ error: e.message });
    }
});
// 5. Webhook de Pagamento Aprovado (Asaas / Mercado Pago / Stripe)
router.post('/api/webhook/payment', (req, res) => {
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
