import { db } from '../database/db.js';
import { aiParser } from './aiParser.js';

export class BotEngine {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * Processa uma mensagem recebida de um usuário no WhatsApp
   * @param phone Telefone de quem enviou (ex: "5511999998888")
   * @param senderName Nome de quem enviou (ex: "João" ou "Maria")
   * @param messageText Texto da mensagem
   */
  public handleIncomingMessage(phone: string, senderName: string, messageText: string, fingerprint?: string): string {
    const { user, account, isNewTrial } = db.getOrCreateUser(phone, senderName, fingerprint);
    const parsed = aiParser.parse(messageText);

    // Permite sempre os comandos de assinar, ajuda e link de pagamento
    if (parsed.intent === 'subscribe') {
      const isPro = account.subscriptionStatus === 'active';
      if (isPro) {
        return (
          `⭐ *Você já é assinante PRO!*\n\n` +
          `Sua conta está ativa com todos os recursos liberados.\n\n` +
          `🔗 [Acessar Painel](${this.baseUrl}/dashboard?token=${account.token})`
        );
      }

      return (
        `⭐ *Planos ZapContas PRO*\n\n` +
        `Seu teste grátis expirou ou está próximo do fim. Escolha seu plano:\n\n` +
        `👤 *1. Plano Individual:* R$ 14,90/mês\n` +
        `• Lançamentos ilimitados por áudio e texto\n` +
        `• Dashboard completo com gráficos em tempo real\n\n` +
        `👥 *2. Plano Casal / Família:* R$ 9,90/mês (R$ 119/ano)\n` +
        `• 2 telefones conectados no mesmo painel\n` +
        `• Divisão de contas de casal automática\n\n` +
        `🔗 *Assinar via PIX ou Cartão:*\n` +
        `${this.baseUrl}/checkout?token=${account.token}&plan=individual_monthly`
      );
    }


    // 1. Link para Dashboard Web
    if (parsed.intent === 'dashboard_link') {
      const link = `${this.baseUrl}/dashboard?token=${account.token}`;
      return `📊 *Seu Painel ZapContas*\n\nAcesse seus gráficos, histórico completo e metas sem precisar de senha:\n🔗 ${link}\n\n_(Dica: Salve este link nos seus favoritos)_`;
    }

    // 2. Zerar / Limpar Saldo do Mês
    if (parsed.intent === 'reset_balance') {
      const deletedCount = db.resetAccountMonth(account.id);
      return (
        `🔄 *Saldo e Lançamentos Zerados!*\n\n` +
        `Todos os lançamentos deste mês foram limpos com sucesso (${deletedCount} registros removidos).\n\n` +
        `💵 *Novo saldo:* R$ 0,00\n` +
        `Seu painel já foi atualizado! Pode começar a registrar os novos gastos.`
      );
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

      return (
        `🗑️ *Lançamento desfeito por ${senderName}!*\n\n` +
        `❌ Removido: *${removed.description}* (R$ ${formattedRemoved})\n` +
        `💵 *Saldo atualizado:* R$ ${formattedBalance}\n` +
        `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`
      );
    }

    // 4. Caixinhas e Investimentos: Guardar Dinheiro
    if (parsed.intent === 'vault_deposit' && parsed.targetAmount) {
      const amount = parsed.targetAmount;
      const vaultName = parsed.vaultName || 'Reserva de Emergência';
      const result = db.depositToVault(account.id, vaultName, amount, phone, senderName);

      if (!result) {
        return `⚠️ Não foi possível guardar esse valor. Digite algo como: *Guardei 100 na caixinha viagem*.`;
      }

      const summary = db.getSummary(account.id);
      const vault = result.vault;
      const formattedAdded = amount.toFixed(2).replace('.', ',');
      const formattedVault = vault.currentAmount.toFixed(2).replace('.', ',');
      const formattedBalance = summary.balance.toFixed(2).replace('.', ',');
      const formattedNetWorth = summary.netWorth.toFixed(2).replace('.', ',');

      let progressMsg = '';
      if (vault.targetAmount > 0) {
        const pct = Math.min(100, Math.round((vault.currentAmount / vault.targetAmount) * 100));
        progressMsg = `🎯 *Meta:* R$ ${vault.targetAmount.toFixed(2).replace('.', ',')} (${pct}% alcançado)\n`;
      }

      return (
        `🏦 *Dinheiro Guardado com Sucesso!*\n\n` +
        `${vault.icon || '💰'} *Caixinha:* ${vault.name}\n` +
        `➕ *Valor guardado:* +R$ ${formattedAdded}\n` +
        `💰 *Total nesta Caixinha:* R$ ${formattedVault}\n` +
        progressMsg +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 *Saldo Livre restante:* R$ ${formattedBalance}\n` +
        `💎 *Patrimônio Total:* R$ ${formattedNetWorth}\n\n` +
        `🔗 [Ver Caixinhas no Painel](${this.baseUrl}/dashboard?token=${account.token})`
      );
    }

    // 5. Caixinhas e Investimentos: Resgatar Dinheiro
    if (parsed.intent === 'vault_withdraw' && parsed.targetAmount) {
      const amount = parsed.targetAmount;
      const vaultName = parsed.vaultName || 'Reserva';
      const result = db.withdrawFromVault(account.id, vaultName, amount, phone, senderName);

      if (!result) {
        return `⚠️ Não encontrei saldo suficiente na caixinha para resgatar R$ ${amount.toFixed(2).replace('.', ',')}.\n\nDigite *Caixinhas* para consultar seus saldos guardados.`;
      }

      const summary = db.getSummary(account.id);
      const vault = result.vault;
      const formattedAmount = result.tx.amount.toFixed(2).replace('.', ',');
      const formattedVault = vault.currentAmount.toFixed(2).replace('.', ',');
      const formattedBalance = summary.balance.toFixed(2).replace('.', ',');

      return (
        `💸 *Resgate da Caixinha Realizado!*\n\n` +
        `${vault.icon || '💰'} *Caixinha:* ${vault.name}\n` +
        `↩️ *Valor resgatado:* R$ ${formattedAmount}\n` +
        `💰 *Saldo restante na Caixinha:* R$ ${formattedVault}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💵 *Novo Saldo Livre:* R$ ${formattedBalance}\n\n` +
        `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`
      );
    }

    // 6. Consultar Caixinhas / Total Guardado
    if (parsed.intent === 'vault_query') {
      const vaults = db.getVaults(account.id);
      const summary = db.getSummary(account.id);

      if (vaults.length === 0) {
        return (
          `🏦 *Minhas Caixinhas & Investimentos*\n\n` +
          `Você ainda não tem caixinhas ativas.\n\n` +
          `💡 *Como começar agora pelo WhatsApp:*\n` +
          `• _"Guardei 150 na reserva"_\n` +
          `• _"Guardei 200 na caixinha viagem"_\n` +
          `• _"Investi 500"_\n\n` +
          `🔗 [Criar Caixinha no Painel](${this.baseUrl}/dashboard?token=${account.token})`
        );
      }

      let msg = `🏦 *Minhas Caixinhas & Investimentos*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

      for (const v of vaults) {
        const valStr = v.currentAmount.toFixed(2).replace('.', ',');
        let pctStr = '';
        if (v.targetAmount > 0) {
          const pct = Math.min(100, Math.round((v.currentAmount / v.targetAmount) * 100));
          pctStr = ` (${pct}% da meta)`;
        }
        msg += `${v.icon || '💰'} *${v.name}:* R$ ${valStr}${pctStr}\n`;
      }

      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💰 *Total Guardado:* R$ ${summary.totalVaults.toFixed(2).replace('.', ',')}\n`;
      msg += `💵 *Saldo Livre para o mês:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n`;
      msg += `💎 *Patrimônio Total:* R$ ${summary.netWorth.toFixed(2).replace('.', ',')}\n\n`;
      msg += `🔗 [Gerenciar no Painel](${this.baseUrl}/dashboard?token=${account.token})`;

      return msg;
    }

    // 7. Adicionar Dinheiro / Entrada Rápida
    if (parsed.intent === 'add_money' && parsed.targetAmount) {
      const amount = parsed.targetAmount;
      const now = new Date();
      const monthKey = now.toISOString().substring(0, 7);

      db.addTransaction({
        accountId: account.id,
        senderPhone: phone,
        senderName,
        amount,
        type: 'income',
        category: 'Renda & Entradas',
        paymentMethod: 'Depósito / Entrada',
        description: 'Entrada / Adicionar Saldo',
        rawMessage: messageText,
        date: now.toISOString(),
        monthKey
      });

      const summary = db.getSummary(account.id);
      return (
        `🎉 *Dinheiro Adicionado ao Saldo Livre!*\n\n` +
        `➕ *Entrada:* +R$ ${amount.toFixed(2).replace('.', ',')}\n` +
        `💵 *Novo Saldo Livre:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n` +
        `💎 *Patrimônio Total:* R$ ${summary.netWorth.toFixed(2).replace('.', ',')}\n\n` +
        `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`
      );
    }

    // 8. Tirar / Retirar Dinheiro (Saque rápido)
    if (parsed.intent === 'remove_money' && parsed.targetAmount) {
      const amount = parsed.targetAmount;
      const now = new Date();
      const monthKey = now.toISOString().substring(0, 7);

      db.addTransaction({
        accountId: account.id,
        senderPhone: phone,
        senderName,
        amount,
        type: 'expense',
        category: 'Retirada / Saque',
        paymentMethod: 'Retirada',
        description: 'Retirada / Saque de Dinheiro',
        rawMessage: messageText,
        date: now.toISOString(),
        monthKey
      });

      const summary = db.getSummary(account.id);
      return (
        `📤 *Retirada Registrada!*\n\n` +
        `➖ *Valor retirado:* -R$ ${amount.toFixed(2).replace('.', ',')}\n` +
        `💵 *Saldo Livre Restante:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n\n` +
        `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`
      );
    }

    // 9. Adicionar Saldo Inicial / Ajuste
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

      return (
        `💰 *Saldo Adicionado com Sucesso!*\n\n` +
        `➕ Valor adicionado: *R$ ${formattedAdded}*\n` +
        `💵 *Saldo atual disponível:* R$ ${formattedBalance}\n\n` +
        `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`
      );
    }

    // 10. Definir Meta / Limite de Gastos Mensal
    if (parsed.intent === 'set_budget' && parsed.targetAmount) {
      const budget = parsed.targetAmount;
      db.setMonthlyBudget(account.id, budget);
      const summary = db.getSummary(account.id);
      const formattedBudget = budget.toFixed(2).replace('.', ',');
      const percentUsed = ((summary.totalExpense / budget) * 100).toFixed(0);

      return (
        `🎯 *Meta Mensal Definida!*\n\n` +
        `📌 Limite de gastos: *R$ ${formattedBudget}*\n` +
        `📉 Gastos atuais: *R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}* (${percentUsed}% do limite)\n\n` +
        `Vou te avisar caso seus gastos se aproximem dessa meta!`
      );
    }

    // 11. Consulta de Saldo / Resumo
    if (parsed.intent === 'balance_query') {
      const summary = db.getSummary(account.id);
      const isShared = account.type === 'shared';
      const budget = account.monthlyBudget || 0;

      let msg = `💰 *Resumo Financeiro - ${account.name}*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📈 *Entradas do Mês:* R$ ${summary.totalIncome.toFixed(2).replace('.', ',')}\n`;
      msg += `📉 *Gastos do Mês:* R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}\n`;
      msg += `💵 *Saldo Livre:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n`;

      if (summary.totalVaults > 0) {
        msg += `🏦 *Guardado em Caixinhas:* R$ ${summary.totalVaults.toFixed(2).replace('.', ',')}\n`;
        msg += `💎 *Patrimônio Geral:* R$ ${summary.netWorth.toFixed(2).replace('.', ',')}\n`;
      }

      if (budget > 0) {
        const percent = ((summary.totalExpense / budget) * 100).toFixed(0);
        msg += `🎯 *Meta de Gastos:* R$ ${budget.toFixed(2).replace('.', ',')} (${percent}% utilizada)\n`;
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
      return (
        `👋 *Comandos Completos do ZapContas!*\n\n` +
        `*1. Registrar Gastos e Entradas:*\n` +
        `• _"Almoço 42,50 no débito"_\n` +
        `• _"Gasolina 100 no crédito"_\n` +
        `• _"Recebi 1500 freela"_\n` +
        `• _"Adicionar 500"_ ou _"Retirar 100"_\n\n` +
        `*2. Guardar Dinheiro & Investimentos:*\n` +
        `• _"Guardei 200 na reserva"_\n` +
        `• _"Guardei 150 na caixinha viagem"_\n` +
        `• _"Investi 500 em ações"_\n` +
        `• _"Resgatei 50 da caixinha"_\n` +
        `• _"Caixinhas"_ -> Mostra patrimônio e metas\n\n` +
        `*3. Gerenciamento de Saldo:*\n` +
        `• *Meta 3000* -> Define teto de gastos mensal\n` +
        `• *Desfazer* -> Apaga seu último lançamento\n` +
        `• *Zerar saldo* -> Limpa lançamentos do mês\n\n` +
        `*4. Consultas Rápidas:*\n` +
        `• *Saldo* ou *Resumo* -> Balanço geral e metas\n` +
        `• *Quem gastou* -> Divisão entre o casal\n` +
        `• *Dashboard* -> Acessar painel web completo\n\n` +
        `Mande uma mensagem agora para testar!`
      );
    }

    // 5. Registrar Transação Financeira
    if (parsed.intent === 'transaction' && parsed.transaction) {
      const txData = parsed.transaction;
      const now = new Date();
      const monthKey = now.toISOString().substring(0, 7);
      const brazilTime = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const brazilDate = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

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
      response += `💳 *Forma:* ${saved.paymentMethod}\n`;
      response += `⏰ *Data:* ${brazilDate} às ${brazilTime}\n\n`;
      response += `📊 *Saldo do mês:* R$ ${formattedBalance}\n`;
      response += `🔗 [Ver Dashboard](${this.baseUrl}/dashboard?token=${account.token})`;

      return response;
    }

    // Caso não entenda
    return (
      `🤔 Não consegui identificar o valor.\n\n` +
      `Tente algo simples como:\n` +
      `• _"Almoço 35"_\n` +
      `• _"Uber 22 no cartão"_\n` +
      `• _"Recebi 500 freela"_\n\n` +
      `Ou digite *Ajuda* para ver o menu completo.`
    );
  }
}

export const botEngine = new BotEngine();
