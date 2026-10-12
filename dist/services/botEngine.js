import { db } from '../database/db.js';
import { aiParser } from './aiParser.js';
export class BotEngine {
    baseUrl;
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }
    setBaseUrl(url) {
        this.baseUrl = url;
    }
    /**
     * Processa uma mensagem recebida de um usuário no WhatsApp
     * @param phone Telefone de quem enviou (ex: "5511999998888")
     * @param senderName Nome de quem enviou (ex: "João" ou "Maria")
     * @param messageText Texto da mensagem
     */
    handleIncomingMessage(phone, senderName, messageText, fingerprint) {
        const { user, account, isNewTrial } = db.getOrCreateUser(phone, senderName, fingerprint);
        const parsed = aiParser.parse(messageText);
        // Permite sempre os comandos de assinar, ajuda e link de pagamento
        if (parsed.intent === 'subscribe') {
            const isPro = account.subscriptionStatus === 'active';
            if (isPro) {
                return (`⭐ *Você já é assinante PRO!*\n\n` +
                    `Sua conta está ativa com todos os recursos liberados.\n\n` +
                    `🔗 [Acessar Painel](${this.baseUrl}/dashboard?token=${account.token})`);
            }
            return (`⭐ *Planos ZapContas PRO*\n\n` +
                `Seu teste grátis expirou ou está próximo do fim. Escolha seu plano:\n\n` +
                `👤 *1. Plano Individual:* R$ 14,90/mês\n` +
                `• Lançamentos ilimitados por áudio e texto\n` +
                `• Dashboard completo com gráficos em tempo real\n\n` +
                `👥 *2. Plano Casal / Família:* R$ 9,90/mês (R$ 119/ano)\n` +
                `• 2 telefones conectados no mesmo painel\n` +
                `• Divisão de contas de casal automática\n\n` +
                `🔗 *Assinar via PIX ou Cartão:*\n` +
                `${this.baseUrl}/checkout?token=${account.token}&plan=individual_monthly`);
        }
        // VERIFICAÇÃO DE TRIAL ANTI-FRAUDE:
        const access = db.isAccessAllowed(phone);
        if (!access.allowed && parsed.intent !== 'help') {
            return (`━━━━━━━━━━━━━━━━━━━━━\n` +
                `⏳ *TESTE GRÁTIS DE 7 DIAS ENCERRADO*\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Olá, *${senderName}*! O seu período de testes gratuitos de 7 dias chegou ao fim.\n\n` +
                `Seu histórico e lançamentos continuam salvos com segurança. Para continuar registrando suas despesas pelo WhatsApp e liberando a Dashboard em tempo real, ative sua assinatura:\n\n` +
                `👤 *1. Plano Individual:* R$ 14,90/mês\n` +
                `👥 *2. Plano Casal & Sócios:* R$ 19,90/mês (2 telefones conectados)\n\n` +
                `👉 *Ativar Assinatura Imediatamente (PIX ou Cartão):*\n` +
                `${this.baseUrl}/checkout?token=${account.token}&reason=trial_expired\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `⚡ _A aprovação via PIX é instantânea e libera o bot na hora._`);
        }
        // 1. Link para Dashboard Web
        if (parsed.intent === 'dashboard_link') {
            const link = `${this.baseUrl}/dashboard?token=${account.token}`;
            return `📊 *Seu Painel ZapContas*\n\nAcesse seus gráficos, histórico completo e metas sem precisar de senha:\n🔗 ${link}\n\n_(Dica: Salve este link nos seus favoritos)_`;
        }
        // 2. Zerar / Limpar Saldo do Mês
        if (parsed.intent === 'reset_balance') {
            const deletedCount = db.resetAccountMonth(account.id);
            return (`🔄 *Saldo e Lançamentos Zerados!*\n\n` +
                `Todos os lançamentos deste mês foram limpos com sucesso (${deletedCount} registros removidos).\n\n` +
                `💵 *Novo saldo:* R$ 0,00\n` +
                `Seu painel já foi atualizado! Pode começar a registrar os novos gastos.`);
        }
        // 3. Desfazer / Apagar Último Gasto
        if (parsed.intent === 'delete_last') {
            const removed = db.deleteLastTransaction(account.id, phone);
            if (!removed) {
                return `⚠️ Não encontrei nenhum lançamento recente seu para desfazer.`;
            }
            const summary = db.getSummary(account.id);
            const formattedRemoved = removed.amount.toFixed(2).replace('.', ',');
            const formattedBalance = summary.balance.toFixed(2).replace('.', ',');
            return (`🗑️ *Lançamento desfeito por ${senderName}!*\n\n` +
                `❌ Removido: *${removed.description}* (R$ ${formattedRemoved})\n` +
                `💵 *Saldo atualizado:* R$ ${formattedBalance}\n` +
                `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`);
        }
        // 4. Adicionar Saldo Inicial / Ajuste
        if (parsed.intent === 'set_initial_balance' && parsed.targetAmount) {
            const now = new Date();
            const monthKey = now.toISOString().substring(0, 7);
            const amount = parsed.targetAmount;
            db.addTransaction({
                accountId: account.id,
                senderPhone: phone,
                senderName: senderName,
                amount: amount,
                type: 'income',
                category: 'Saldo Inicial / Ajuste',
                paymentMethod: 'Saldo Inicial',
                description: 'Saldo Inicial / Depósito',
                rawMessage: messageText,
                date: now.toISOString(),
                monthKey
            });
            const summary = db.getSummary(account.id);
            const formattedAdded = amount.toFixed(2).replace('.', ',');
            const formattedBalance = summary.balance.toFixed(2).replace('.', ',');
            return (`💰 *Saldo Adicionado com Sucesso!*\n\n` +
                `➕ Valor adicionado: *R$ ${formattedAdded}*\n` +
                `💵 *Saldo atual disponível:* R$ ${formattedBalance}\n\n` +
                `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`);
        }
        // 5. Definir Meta / Limite de Gastos Mensal
        if (parsed.intent === 'set_budget' && parsed.targetAmount) {
            const budget = parsed.targetAmount;
            db.setMonthlyBudget(account.id, budget);
            const summary = db.getSummary(account.id);
            const formattedBudget = budget.toFixed(2).replace('.', ',');
            const percentUsed = ((summary.totalExpense / budget) * 100).toFixed(0);
            return (`🎯 *Meta Mensal Definida!*\n\n` +
                `📌 Limite de gastos: *R$ ${formattedBudget}*\n` +
                `📉 Gastos atuais: *R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}* (${percentUsed}% do limite)\n\n` +
                `Vou te avisar caso seus gastos se aproximem dessa meta!`);
        }
        // 6. Consulta de Saldo / Resumo
        if (parsed.intent === 'balance_query') {
            const summary = db.getSummary(account.id);
            const isShared = account.type === 'shared';
            const budget = account.monthlyBudget || 0;
            let msg = `💰 *Resumo Financeiro - ${account.name}*\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `📈 *Entradas:* R$ ${summary.totalIncome.toFixed(2).replace('.', ',')}\n`;
            msg += `📉 *Saídas:* R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}\n`;
            msg += `💵 *Saldo Livre:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n`;
            if (budget > 0) {
                const percent = ((summary.totalExpense / budget) * 100).toFixed(0);
                msg += `🎯 *Meta:* R$ ${budget.toFixed(2).replace('.', ',')} (${percent}% utilizada)\n`;
            }
            msg += `\n`;
            if (isShared && Object.keys(summary.byPerson).length > 0) {
                msg += `👥 *Divisão por pessoa:*\n`;
                for (const [name, stats] of Object.entries(summary.byPerson)) {
                    const percent = summary.totalExpense > 0 ? ((stats.total / summary.totalExpense) * 100).toFixed(0) : '0';
                    msg += `• *${name}:* R$ ${stats.total.toFixed(2).replace('.', ',')} (${percent}%)\n`;
                }
                msg += `\n`;
            }
            msg += `🔗 *Ver Detalhes:* ${this.baseUrl}/dashboard?token=${account.token}`;
            return msg;
        }
        // 3. Consulta de quem gastou (Divisão detalhada)
        if (parsed.intent === 'report_query') {
            const summary = db.getSummary(account.id);
            if (Object.keys(summary.byPerson).length === 0) {
                return `Nenhum gasto registrado este mês para calcular a divisão.`;
            }
            let msg = `👥 *Divisão de Gastos - ${account.name}*\n`;
            msg += `Total gasto no mês: *R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}*\n\n`;
            for (const [name, stats] of Object.entries(summary.byPerson)) {
                const percent = summary.totalExpense > 0 ? ((stats.total / summary.totalExpense) * 100).toFixed(0) : '0';
                msg += `👤 *${name}*: R$ ${stats.total.toFixed(2).replace('.', ',')} (${stats.count} lançamentos - ${percent}%)\n`;
            }
            msg += `\n🔗 *Acesse o painel completo:* ${this.baseUrl}/dashboard?token=${account.token}`;
            return msg;
        }
        // Menu de Ajuda Completo
        if (parsed.intent === 'help') {
            return (`👋 *Comandos Completos do ZapContas!*\n\n` +
                `*1. Registrar Gastos ou Ganhos:*\n` +
                `• _"Almoço 42,50 no débito"_\n` +
                `• _"Gasolina 100 no crédito"_\n` +
                `• _"Recebi 1500 freela"_\n\n` +
                `*2. Gerenciamento de Saldo:*\n` +
                `• *Adicionar saldo 2000* -> Adiciona saldo inicial/depósito\n` +
                `• *Zerar saldo* -> Limpa todos os gastos do mês\n` +
                `• *Desfazer* -> Apaga seu último lançamento cadastrado por engano\n` +
                `• *Meta 3000* -> Define teto de gastos mensal\n\n` +
                `*3. Consultas Rápidas:*\n` +
                `• *Saldo* ou *Resumo* -> Mostra balanço geral e meta\n` +
                `• *Quem gastou* -> Divisão detalhada entre você e o parceiro\n` +
                `• *Dashboard* -> Link seguro do painel com gráficos\n\n` +
                `Mande uma mensagem agora para testar!`);
        }
        // 5. Registrar Transação Financeira
        if (parsed.intent === 'transaction' && parsed.transaction) {
            const txData = parsed.transaction;
            const now = new Date();
            const monthKey = now.toISOString().substring(0, 7);
            const saved = db.addTransaction({
                accountId: account.id,
                senderPhone: phone,
                senderName: senderName,
                amount: txData.amount,
                type: txData.type,
                category: txData.category,
                paymentMethod: txData.paymentMethod,
                description: txData.description,
                rawMessage: messageText,
                date: now.toISOString(),
                monthKey
            });
            const summary = db.getSummary(account.id, monthKey);
            const icon = txData.type === 'income' ? '🎉' : '✅';
            const formattedValue = txData.amount.toFixed(2).replace('.', ',');
            const formattedBalance = summary.balance.toFixed(2).replace('.', ',');
            let response = `${icon} *${txData.type === 'income' ? 'Entrada' : 'Despesa'} registrada por ${senderName}!*\n\n`;
            response += `🏷️ *Item:* ${saved.description}\n`;
            response += `📁 *Categoria:* ${saved.category}\n`;
            response += `💵 *Valor:* ${txData.type === 'income' ? '+' : '-'}R$ ${formattedValue}\n`;
            response += `💳 *Forma:* ${saved.paymentMethod}\n\n`;
            response += `📊 *Saldo do mês:* R$ ${formattedBalance}\n`;
            response += `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`;
            return response;
        }
        // Caso não entenda
        return (`🤔 Não consegui identificar o valor.\n\n` +
            `Tente algo simples como:\n` +
            `• _"Almoço 35"_\n` +
            `• _"Uber 22 no cartão"_\n` +
            `• _"Recebi 500 freela"_\n\n` +
            `Ou digite *Ajuda* para ver o menu completo.`);
    }
}
export const botEngine = new BotEngine();
