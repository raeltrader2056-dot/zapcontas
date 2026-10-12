import { db } from '../database/db.js';
import { aiParser } from './aiParser.js';
import { BotReply } from '../types.js';

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
  public handleIncomingMessage(phone: string, senderName: string, messageText: string, fingerprint?: string): BotReply {
    const { user, account, isNewTrial } = db.getOrCreateUser(phone, senderName, fingerprint);
    const parsed = aiParser.parse(messageText);

    // 0. Saudação e Boas-Vindas
    if (parsed.intent === 'greeting') {
      return {
        text: (
          `👋 *Olá, ${senderName}!* Como posso te ajudar hoje?\n\n` +
          `Você pode me enviar lançamentos a qualquer momento:\n` +
          `• _"Almoço 45 no débito"_\n` +
          `• _"Salário 4500"_\n` +
          `• _"Guardei 100 na caixinha viagem"_\n\n` +
          `Ou escolha uma opção rápida abaixo: 👇`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_vaults', label: '🏦 Caixinhas' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 1. Planos e Assinatura
    if (parsed.intent === 'subscribe') {
      const isPro = account.subscriptionStatus === 'active';
      if (isPro) {
        return {
          text: (
            `⭐ *Você já é assinante PRO!*\n\n` +
            `Sua conta está ativa com todos os recursos liberados.\n\n` +
            `🔗 ${this.baseUrl}/dashboard?token=${account.token}`
          ),
          buttons: [
            { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
            { id: 'btn_summary', label: '📊 Ver Resumo' }
          ]
        };
      }

      return {
        text: (
          `⭐ *Planos ZapContas PRO*\n\n` +
          `Aproveite a gestão financeira mais completa:\n\n` +
          `👤 *Individual:* R$ 14,90/mês\n` +
          `• Lançamentos ilimitados e relatórios em tempo real\n\n` +
          `👥 *Casal / Família:* R$ 9,90/mês (R$ 119/ano)\n` +
          `• 2 números conectados no mesmo painel com divisão automática\n\n` +
          `🔗 *Assinar via PIX ou Cartão:*\n` +
          `${this.baseUrl}/checkout?token=${account.token}&plan=individual_monthly`
        ),
        buttons: [
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
          { id: 'btn_summary', label: '📊 Ver Resumo' }
        ]
      };
    }

    // 2. Link para Dashboard Web
    if (parsed.intent === 'dashboard_link') {
      const link = `${this.baseUrl}/dashboard?token=${account.token}`;
      return {
        text: (
          `📊 *Seu Painel ZapContas*\n\n` +
          `Acesse gráficos detalhados, controle de teto e caixinhas sem precisar de senha:\n` +
          `🔗 ${link}\n\n` +
          `_(Dica: Adicione aos seus favoritos para acesso rápido)_`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_vaults', label: '🏦 Caixinhas' }
        ]
      };
    }

    // 3. Zerar / Limpar Saldo do Mês
    if (parsed.intent === 'reset_balance') {
      const deletedCount = db.resetAccountMonth(account.id);
      return {
        text: (
          `🔄 *Saldo e Lançamentos Zerados!*\n\n` +
          `Todos os lançamentos deste mês foram limpos (${deletedCount} registros removidos).\n\n` +
          `💵 *Novo saldo:* R$ 0,00\n` +
          `Seu painel já foi atualizado! Pode começar a registrar novos gastos.`
        ),
        buttons: [
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
          { id: 'btn_summary', label: '📊 Ver Resumo' }
        ]
      };
    }

    // 4. Desfazer / Apagar Último Gasto
    if (parsed.intent === 'delete_last') {
      const removed = db.deleteLastTransaction(account.id, phone);
      if (!removed) {
        return {
          text: `⚠️ Não encontrei nenhum lançamento recente seu para desfazer.`,
          buttons: [
            { id: 'btn_summary', label: '📊 Ver Resumo' },
            { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
          ]
        };
      }
      const summary = db.getSummary(account.id);
      const formattedRemoved = removed.amount.toFixed(2).replace('.', ',');
      const formattedBalance = summary.balance.toFixed(2).replace('.', ',');

      return {
        text: (
          `🗑️ *Lançamento desfeito por ${senderName}!*\n\n` +
          `❌ Removido: *${removed.description}* (R$ ${formattedRemoved})\n` +
          `💵 *Saldo atualizado:* R$ ${formattedBalance}`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 5. Caixinhas e Investimentos: Guardar Dinheiro
    if (parsed.intent === 'vault_deposit' && parsed.targetAmount) {
      const amount = parsed.targetAmount;
      const vaultName = parsed.vaultName || 'Reserva de Emergência';
      const result = db.depositToVault(account.id, vaultName, amount, phone, senderName);

      if (!result) {
        return {
          text: `⚠️ Não foi possível guardar esse valor. Digite algo como: *Guardei 100 na caixinha viagem*.`,
          buttons: [
            { id: 'btn_vaults', label: '🏦 Ver Caixinhas' },
            { id: 'btn_summary', label: '📊 Ver Resumo' }
          ]
        };
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

      return {
        text: (
          `🏦 *Dinheiro Guardado com Sucesso!*\n\n` +
          `${vault.icon || '💰'} *Caixinha:* ${vault.name}\n` +
          `➕ *Valor guardado:* +R$ ${formattedAdded}\n` +
          `💰 *Total nesta Caixinha:* R$ ${formattedVault}\n` +
          progressMsg +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `💵 *Saldo Livre restante:* R$ ${formattedBalance}\n` +
          `💎 *Patrimônio Total:* R$ ${formattedNetWorth}`
        ),
        buttons: [
          { id: 'btn_vaults', label: '🏦 Ver Caixinhas' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
          { id: 'btn_summary', label: '📊 Ver Resumo' }
        ]
      };
    }

    // 6. Caixinhas e Investimentos: Resgatar Dinheiro
    if (parsed.intent === 'vault_withdraw' && parsed.targetAmount) {
      const amount = parsed.targetAmount;
      const vaultName = parsed.vaultName || 'Reserva';
      const result = db.withdrawFromVault(account.id, vaultName, amount, phone, senderName);

      if (!result) {
        return {
          text: `⚠️ Não encontrei saldo suficiente na caixinha para resgatar R$ ${amount.toFixed(2).replace('.', ',')}.`,
          buttons: [
            { id: 'btn_vaults', label: '🏦 Ver Caixinhas' },
            { id: 'btn_summary', label: '📊 Ver Resumo' }
          ]
        };
      }

      const summary = db.getSummary(account.id);
      const vault = result.vault;
      const formattedAmount = result.tx.amount.toFixed(2).replace('.', ',');
      const formattedVault = vault.currentAmount.toFixed(2).replace('.', ',');
      const formattedBalance = summary.balance.toFixed(2).replace('.', ',');

      return {
        text: (
          `💸 *Resgate da Caixinha Realizado!*\n\n` +
          `${vault.icon || '💰'} *Caixinha:* ${vault.name}\n` +
          `↩️ *Valor resgatado:* R$ ${formattedAmount}\n` +
          `💰 *Saldo restante na Caixinha:* R$ ${formattedVault}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `💵 *Novo Saldo Livre:* R$ ${formattedBalance}`
        ),
        buttons: [
          { id: 'btn_vaults', label: '🏦 Ver Caixinhas' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 7. Consultar Caixinhas / Total Guardado
    if (parsed.intent === 'vault_query') {
      const vaults = db.getVaults(account.id);
      const summary = db.getSummary(account.id);

      if (vaults.length === 0) {
        return {
          text: (
            `🏦 *Minhas Caixinhas & Metas*\n\n` +
            `Você ainda não tem caixinhas ativas.\n\n` +
            `💡 *Como começar agora pelo WhatsApp:*\n` +
            `• _"Guardei 100 na reserva"_\n` +
            `• _"Guardei 200 na caixinha viagem"_\n` +
            `• _"Investi 500"_`
          ),
          buttons: [
            { id: 'btn_dashboard', label: '🌐 Criar no Painel' },
            { id: 'btn_summary', label: '📊 Ver Resumo' }
          ]
        };
      }

      let msg = `🏦 *Minhas Caixinhas & Metas*\n━━━━━━━━━━━━━━━━━━━━━\n`;
      for (const v of vaults) {
        const valStr = v.currentAmount.toFixed(2).replace('.', ',');
        let pctStr = '';
        if (v.targetAmount > 0) {
          const pct = Math.min(100, Math.round((v.currentAmount / v.targetAmount) * 100));
          pctStr = ` (${pct}%)`;
        }
        msg += `${v.icon || '💰'} *${v.name}:* R$ ${valStr}${pctStr}\n`;
      }
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💰 *Total Guardado:* R$ ${summary.totalVaults.toFixed(2).replace('.', ',')}\n`;
      msg += `💵 *Saldo Livre:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n`;
      msg += `💎 *Patrimônio Total:* R$ ${summary.netWorth.toFixed(2).replace('.', ',')}`;

      return {
        text: msg,
        buttons: [
          { id: 'btn_dashboard', label: '🌐 Ver no Painel' },
          { id: 'btn_summary', label: '📊 Ver Resumo' }
        ]
      };
    }

    // 8. Adicionar Dinheiro / Entrada Direta
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
      return {
        text: (
          `🎉 *Dinheiro Adicionado ao Saldo Livre!*\n\n` +
          `➕ *Entrada:* +R$ ${amount.toFixed(2).replace('.', ',')}\n` +
          `💵 *Novo Saldo Livre:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n` +
          `💎 *Patrimônio Total:* R$ ${summary.netWorth.toFixed(2).replace('.', ',')}`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 9. Tirar / Retirar Dinheiro
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
      return {
        text: (
          `📤 *Retirada Registrada!*\n\n` +
          `➖ *Valor retirado:* -R$ ${amount.toFixed(2).replace('.', ',')}\n` +
          `💵 *Saldo Livre Restante:* R$ ${summary.balance.toFixed(2).replace('.', ',')}`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 10. Saldo Inicial / Ajuste
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

      return {
        text: (
          `💰 *Saldo Inicial Registrado!*\n\n` +
          `➕ *Valor definido:* R$ ${formattedAdded}\n` +
          `💵 *Saldo disponível:* R$ ${formattedBalance}`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 11. Definir Meta / Limite de Gastos Mensal
    if (parsed.intent === 'set_budget' && parsed.targetAmount) {
      const budget = parsed.targetAmount;
      db.setMonthlyBudget(account.id, budget);
      const summary = db.getSummary(account.id);
      const formattedBudget = budget.toFixed(2).replace('.', ',');
      const percentUsed = ((summary.totalExpense / budget) * 100).toFixed(0);

      return {
        text: (
          `🎯 *Meta Mensal Definida!*\n\n` +
          `📌 *Limite de gastos:* R$ ${formattedBudget}\n` +
          `📉 *Gastos atuais:* R$ ${summary.totalExpense.toFixed(2).replace('.', ',')} (${percentUsed}% do limite)\n\n` +
          `Vou te avisar caso seus gastos se aproximem dessa meta!`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 12. Consulta de Saldo / Resumo
    if (parsed.intent === 'balance_query') {
      const summary = db.getSummary(account.id);
      const isShared = account.type === 'shared';
      const budget = account.monthlyBudget || 0;

      let msg = `📊 *Resumo Financeiro • ${account.name}*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📈 *Entradas do Mês:* R$ ${summary.totalIncome.toFixed(2).replace('.', ',')}\n`;
      msg += `📉 *Gastos do Mês:* R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}\n`;
      msg += `💵 *Saldo Livre:* R$ ${summary.balance.toFixed(2).replace('.', ',')}\n`;

      if (summary.totalVaults > 0) {
        msg += `🏦 *Caixinhas:* R$ ${summary.totalVaults.toFixed(2).replace('.', ',')}\n`;
        msg += `💎 *Patrimônio Total:* R$ ${summary.netWorth.toFixed(2).replace('.', ',')}\n`;
      }

      if (budget > 0) {
        const remaining = Math.max(0, budget - summary.totalExpense);
        const percent = ((summary.totalExpense / budget) * 100).toFixed(0);
        msg += `🎯 *Meta:* ${percent}% utilizada (R$ ${remaining.toFixed(2).replace('.', ',')} restantes)\n`;
      }

      if (isShared && Object.keys(summary.byPerson).length > 0) {
        msg += `\n👥 *Divisão por pessoa:*\n`;
        for (const [name, stats] of Object.entries(summary.byPerson)) {
          const percent = summary.totalExpense > 0 ? ((stats.total / summary.totalExpense) * 100).toFixed(0) : '0';
          msg += `• *${name}:* R$ ${stats.total.toFixed(2).replace('.', ',')} (${percent}%)\n`;
        }
      }

      return {
        text: msg,
        buttons: [
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
          { id: 'btn_vaults', label: '🏦 Caixinhas' },
          { id: 'btn_help', label: '❓ Comandos' }
        ]
      };
    }

    // 13. Divisão de Gastos
    if (parsed.intent === 'report_query') {
      const summary = db.getSummary(account.id);
      if (Object.keys(summary.byPerson).length === 0) {
        return {
          text: `Nenhum gasto registrado este mês para calcular a divisão.`,
          buttons: [
            { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
            { id: 'btn_summary', label: '📊 Ver Resumo' }
          ]
        };
      }

      let msg = `👥 *Divisão de Gastos - ${account.name}*\n`;
      msg += `Total gasto no mês: *R$ ${summary.totalExpense.toFixed(2).replace('.', ',')}*\n\n`;

      for (const [name, stats] of Object.entries(summary.byPerson)) {
        const percent = summary.totalExpense > 0 ? ((stats.total / summary.totalExpense) * 100).toFixed(0) : '0';
        msg += `👤 *${name}*: R$ ${stats.total.toFixed(2).replace('.', ',')} (${stats.count} lançamentos - ${percent}%)\n`;
      }

      return {
        text: msg,
        buttons: [
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
          { id: 'btn_summary', label: '📊 Ver Resumo' }
        ]
      };
    }

    // 14. Menu de Ajuda Completo
    if (parsed.intent === 'help') {
      return {
        text: (
          `👋 *Comandos Completos ZapContas*\n\n` +
          `1️⃣ *Registrar Gastos e Entradas:*\n` +
          `• _"Almoço 42,50 no débito"_\n` +
          `• _"Gasolina 100 no crédito"_\n` +
          `• _"Recebi 1500 freela"_\n\n` +
          `2️⃣ *Guardar Dinheiro & Investimentos:*\n` +
          `• _"Guardei 200 na reserva"_\n` +
          `• _"Guardei 150 na caixinha viagem"_\n` +
          `• _"Investi 500 em ações"_\n\n` +
          `3️⃣ *Gerenciamento e Ajustes:*\n` +
          `• _"Meta 3000"_ -> Teto de gastos mensal\n` +
          `• _"Desfazer"_ -> Apaga último lançamento\n` +
          `• _"Zerar saldo"_ -> Limpa lançamentos do mês`
        ),
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_vaults', label: '🏦 Caixinhas' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // 15. Registrar Transação Financeira
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

      let budgetMsg = '';
      if (account.monthlyBudget && account.monthlyBudget > 0) {
        const remaining = Math.max(0, account.monthlyBudget - summary.totalExpense);
        const pct = Math.min(100, Math.round((summary.totalExpense / account.monthlyBudget) * 100));
        budgetMsg = `🎯 *Teto:* ${pct}% usado (R$ ${remaining.toFixed(2).replace('.', ',')} restantes)\n`;
      }

      let response = `${icon} *${txData.type === 'income' ? 'Entrada' : 'Despesa'} confirmada!*\n\n`;
      response += `🏷️ *Item:* ${saved.description}\n`;
      response += `💵 *Valor:* ${txData.type === 'income' ? '+' : '-'}R$ ${formattedValue} (${saved.paymentMethod})\n`;
      response += `📁 *Categoria:* ${saved.category}\n`;
      response += `⏰ *Data:* ${brazilDate} às ${brazilTime}\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `💳 *Saldo Atual:* R$ ${formattedBalance}\n`;
      if (budgetMsg) response += budgetMsg;

      return {
        text: response,
        buttons: [
          { id: 'btn_summary', label: '📊 Ver Resumo' },
          { id: 'btn_vaults', label: '🏦 Caixinhas' },
          { id: 'btn_dashboard', label: '🌐 Abrir Painel' }
        ]
      };
    }

    // Caso não entenda
    return {
      text: (
        `🤔 *Não identifiquei o valor do lançamento.*\n\n` +
        `Envie algo simples como:\n` +
        `• _"Almoço 35"_\n` +
        `• _"Uber 22 no cartão"_\n` +
        `• _"Recebi 500 freela"_\n\n` +
        `Ou escolha uma opção rápida abaixo: 👇`
      ),
      buttons: [
        { id: 'btn_summary', label: '📊 Ver Resumo' },
        { id: 'btn_dashboard', label: '🌐 Abrir Painel' },
        { id: 'btn_help', label: '❓ Ajuda' }
      ]
    };
  }
}

export const botEngine = new BotEngine();
