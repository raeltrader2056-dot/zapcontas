import fs from 'fs';
import path from 'path';
import { User, Account, Transaction, Vault } from '../types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

interface DatabaseSchema {
  users: User[];
  accounts: Account[];
  transactions: Transaction[];
  vaults: Vault[];
}

export class Database {
  private dbPath: string;
  private data: DatabaseSchema;

  constructor(filename = 'zapcontas.json') {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.dbPath = path.join(DATA_DIR, filename);
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.vaults) parsed.vaults = [];
        return parsed;
      } catch (e) {
        console.error('Erro ao ler banco de dados, inicializando vazio:', e);
      }
    }
    const initial: DatabaseSchema = {
      users: [],
      accounts: [],
      transactions: [],
      vaults: []
    };
    this.save(initial);
    return initial;
  }

  private save(dataToSave = this.data) {
    if (!dataToSave.vaults) dataToSave.vaults = [];
    fs.writeFileSync(this.dbPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
  }

  // --- Usuários e Contas com Proteção Anti-Fraude de Trial ---
  public getOrCreateUser(phone: string, name: string, fingerprint?: string): { user: User; account: Account; isNewTrial: boolean } {
    let user = this.data.users.find(u => u.phone === phone);

    // Se usuário já existe, apenas retorna
    if (user) {
      const account = this.data.accounts.find(a => a.id === user!.accountId)!;
      return { user, account, isNewTrial: false };
    }

    // PROTEÇÃO ANTI-FRAUDE: Verifica se o mesmo dispositivo/celular já usou teste grátis com outro número
    const fingerprintAlreadyUsed = fingerprint 
      ? this.data.users.find(u => u.deviceFingerprint === fingerprint && u.trialUsed)
      : null;

    const now = new Date();
    // Se o aparelho já usou trial antes, não dá 7 dias grátis (expira imediatamente para forçar assinatura)
    const isEligibleForTrial = !fingerprintAlreadyUsed;
    const trialEnds = isEligibleForTrial
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : now.toISOString();

    const accountId = 'acc_' + Math.random().toString(36).substring(2, 9);
    const token = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    
    const newAccount: Account = {
      id: accountId,
      name: `Finanças de ${name}`,
      type: 'individual',
      token: token,
      members: [phone],
      monthlyBudget: 2500,
      subscriptionStatus: isEligibleForTrial ? 'trialing' : 'past_due',
      planType: 'free',
      expiresAt: trialEnds,
      createdAt: now.toISOString()
    };

    user = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      phone,
      name,
      accountId,
      plan: 'free',
      trialUsed: true, // Registrado permanentemente que este número já usou o benefício de teste
      trialEndsAt: trialEnds,
      deviceFingerprint: fingerprint,
      createdAt: now.toISOString()
    };

    this.data.accounts.push(newAccount);
    this.data.users.push(user);
    this.save();

    return { user, account: newAccount, isNewTrial: isEligibleForTrial };
  }

  // Verifica se o usuário tem acesso ativo (trial válido ou plano pro pago)
  public isAccessAllowed(phone: string): { allowed: boolean; reason?: 'trial_expired' | 'unauthorized' } {
    const user = this.data.users.find(u => u.phone === phone);
    if (!user) return { allowed: true };

    const account = this.data.accounts.find(a => a.id === user.accountId);
    if (!account) return { allowed: true };

    // Se é assinante Pro ativo, sempre liberado
    if (account.subscriptionStatus === 'active') {
      return { allowed: true };
    }

    // Se está em período de teste, verifica se já passou dos 7 dias
    const now = new Date().getTime();
    const trialEndTime = new Date(user.trialEndsAt).getTime();

    if (now > trialEndTime) {
      return { allowed: false, reason: 'trial_expired' };
    }

    return { allowed: true };
  }

  // Vincular dois usuários na mesma conta (Modo Casal / Compartilhado)
  public linkSharedAccount(phone1: string, phone2: string, accountName: string): Account | null {
    const user1 = this.data.users.find(u => u.phone === phone1);
    const user2 = this.data.users.find(u => u.phone === phone2);

    if (!user1 || !user2) return null;

    const account = this.data.accounts.find(a => a.id === user1.accountId);
    if (!account) return null;

    account.name = accountName;
    account.type = 'shared';
    if (!account.members.includes(phone2)) {
      account.members.push(phone2);
    }

    user2.accountId = account.id;

    // Atualiza transações do user2 para apontar para a conta unificada
    this.data.transactions.forEach(t => {
      if (t.senderPhone === phone2) {
        t.accountId = account.id;
      }
    });

    this.save();
    return account;
  }

  public getAccountByToken(token: string): Account | undefined {
    if (!token || token === 'demo') {
      return undefined;
    }
    return this.data.accounts.find(a => a.token === token);
  }

  public getAccount(accountId: string): Account | undefined {
    return this.data.accounts.find(a => a.id === accountId);
  }

  public getUserByAccountId(accountId: string): User | undefined {
    let user = this.data.users.find(u => u.accountId === accountId);
    if (!user) {
      const account = this.data.accounts.find(a => a.id === accountId);
      if (account && account.members && account.members.length > 0) {
        user = this.data.users.find(u => account.members.includes(u.phone));
      }
    }
    return user;
  }

  public getUserByPhone(phone: string): User | undefined {
    return this.data.users.find(u => u.phone === phone);
  }

  // Atualização de perfil do cliente
  public updateUserProfile(
    accountId: string,
    params: {
      name?: string;
      email?: string;
      avatarUrl?: string;
      newPhone?: string;
    }
  ): { user: User; account: Account } {
    const account = this.data.accounts.find(a => a.id === accountId);
    if (!account) throw new Error('Conta não encontrada');

    const user = this.data.users.find(u => u.accountId === accountId);
    if (!user) throw new Error('Usuário não encontrado');

    const isPro = account.subscriptionStatus === 'active' || user.plan === 'pro';

    // REGRA DE NEGÓCIO: Apenas clientes assinantes do plano PRO podem alterar o número de WhatsApp
    if (params.newPhone !== undefined && params.newPhone !== '') {
      const cleanNewPhone = params.newPhone.replace(/\D/g, '');
      const fullNewPhone = cleanNewPhone.startsWith('55') ? cleanNewPhone : `55${cleanNewPhone}`;

      if (fullNewPhone !== user.phone) {
        if (!isPro) {
          throw new Error('A alteração de número de WhatsApp é exclusiva para clientes do plano PRO. Faça o upgrade para alterar.');
        }

        const oldPhone = user.phone;
        user.phone = fullNewPhone;

        account.members = account.members.map(m => m === oldPhone ? fullNewPhone : m);
        if (!account.members.includes(fullNewPhone)) {
          account.members.push(fullNewPhone);
        }

        this.data.transactions.forEach(t => {
          if (t.accountId === account.id && t.senderPhone === oldPhone) {
            t.senderPhone = fullNewPhone;
            if (params.name) t.senderName = params.name;
          }
        });
      }
    }

    if (params.name && params.name.trim()) {
      user.name = params.name.trim();
      account.name = `Finanças de ${user.name}`;
    }

    if (params.email !== undefined) {
      user.email = params.email.trim();
    }

    if (params.avatarUrl !== undefined) {
      user.avatarUrl = params.avatarUrl.trim();
    }

    this.save();
    return { user, account };
  }

  // --- Transações ---
  public addTransaction(tx: Omit<Transaction, 'id'>): Transaction {
    const fullTx: Transaction = {
      ...tx,
      id: 'tx_' + Math.random().toString(36).substring(2, 9)
    };
    this.data.transactions.push(fullTx);
    this.save();
    return fullTx;
  }

  // Ativa assinatura Pro quando o pagamento for aprovado
  public activateSubscription(accountId: string, planType: 'individual_monthly' | 'couple_annual'): Account | null {
    const account = this.data.accounts.find(a => a.id === accountId);
    if (!account) return null;

    const daysToAdd = planType === 'couple_annual' ? 365 : 30;
    const expires = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

    account.subscriptionStatus = 'active';
    account.planType = planType;
    account.expiresAt = expires;

    // Atualiza usuários vinculados
    this.data.users.forEach(u => {
      if (account.members.includes(u.phone) || u.accountId === account.id) {
        u.plan = 'pro';
      }
    });

    this.save();
    return account;
  }

  public getTransactions(accountId: string, monthKey?: string): Transaction[] {
    return this.data.transactions
      .filter(t => t.accountId === accountId && (!monthKey || t.monthKey === monthKey))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Apaga a última transação feita por um usuário específico
  public deleteLastTransaction(accountId: string, phone: string): Transaction | null {
    const idx = [...this.data.transactions]
      .reverse()
      .findIndex(t => t.accountId === accountId && t.senderPhone === phone);

    if (idx === -1) return null;

    const realIdx = this.data.transactions.length - 1 - idx;
    const removed = this.data.transactions.splice(realIdx, 1)[0];
    this.save();
    return removed;
  }

  // Apaga uma transação específica pelo ID
  public deleteTransaction(accountId: string, transactionId: string): boolean {
    const idx = this.data.transactions.findIndex(t => t.accountId === accountId && t.id === transactionId);
    if (idx === -1) return false;
    this.data.transactions.splice(idx, 1);
    this.save();
    return true;
  }

  // Atualiza uma transação existente (para o cliente corrigir erros)
  public updateTransaction(
    accountId: string,
    transactionId: string,
    updates: {
      amount?: number;
      description?: string;
      category?: string;
      paymentMethod?: string;
      type?: 'income' | 'expense';
    }
  ): Transaction | null {
    const tx = this.data.transactions.find(t => t.accountId === accountId && t.id === transactionId);
    if (!tx) return null;

    if (updates.amount !== undefined && updates.amount > 0) tx.amount = updates.amount;
    if (updates.description !== undefined && updates.description.trim()) tx.description = updates.description.trim();
    if (updates.category !== undefined && updates.category.trim()) tx.category = updates.category.trim();
    if (updates.paymentMethod !== undefined) tx.paymentMethod = updates.paymentMethod;
    if (updates.type !== undefined) tx.type = updates.type;

    this.save();
    return tx;
  }

  // Zera todos os lançamentos do mês ou adiciona um ajuste compensatório
  public resetAccountMonth(accountId: string, monthKey?: string): number {
    const currentMonthKey = monthKey || new Date().toISOString().substring(0, 7);
    const countBefore = this.data.transactions.length;
    this.data.transactions = this.data.transactions.filter(
      t => !(t.accountId === accountId && t.monthKey === currentMonthKey)
    );
    const removedCount = countBefore - this.data.transactions.length;
    this.save();
    return removedCount;
  }

  // Define uma meta de gastos mensal
  public setMonthlyBudget(accountId: string, budget: number): Account | null {
    const account = this.data.accounts.find(a => a.id === accountId);
    if (!account) return null;
    account.monthlyBudget = budget;
    this.save();
    return account;
  }

  // --- Gestão de Caixinhas & Investimentos ---
  public getVaults(accountId: string): Vault[] {
    if (!this.data.vaults) this.data.vaults = [];
    return this.data.vaults.filter(v => v.accountId === accountId);
  }

  public getVault(accountId: string, vaultIdOrName: string): Vault | undefined {
    if (!this.data.vaults) this.data.vaults = [];
    const lower = vaultIdOrName.toLowerCase().trim();
    return this.data.vaults.find(
      v => v.accountId === accountId && (v.id === vaultIdOrName || v.name.toLowerCase().includes(lower))
    );
  }

  public createVault(accountId: string, name: string, targetAmount: number = 0, icon: string = '💰'): Vault {
    if (!this.data.vaults) this.data.vaults = [];
    const newVault: Vault = {
      id: 'vlt_' + Math.random().toString(36).substring(2, 9),
      accountId,
      name: name.trim() || 'Reserva de Emergência',
      targetAmount: Math.max(0, targetAmount),
      currentAmount: 0,
      icon: icon || '💰',
      createdAt: new Date().toISOString()
    };
    this.data.vaults.push(newVault);
    this.save();
    return newVault;
  }

  public depositToVault(
    accountId: string,
    vaultNameOrId: string,
    amount: number,
    senderPhone: string,
    senderName: string
  ): { vault: Vault; tx: Transaction } | null {
    if (amount <= 0) return null;
    if (!this.data.vaults) this.data.vaults = [];

    let vault = this.getVault(accountId, vaultNameOrId);
    if (!vault) {
      // Cria a caixinha automaticamente com ícone temático
      const lower = vaultNameOrId.toLowerCase();
      const defaultIcon = lower.includes('viagem') ? '✈️' 
        : lower.includes('reserva') ? '🛡️'
        : lower.includes('invest') ? '📈'
        : lower.includes('carro') ? '🚗'
        : lower.includes('casa') ? '🏠' : '💰';
      vault = this.createVault(accountId, vaultNameOrId || 'Reserva', 5000, defaultIcon);
    }

    vault.currentAmount += amount;

    // Registra como saída do saldo livre para a caixinha
    const now = new Date();
    const monthKey = now.toISOString().substring(0, 7);
    const tx = this.addTransaction({
      accountId,
      senderPhone,
      senderName,
      amount,
      type: 'expense',
      category: 'Caixinha / Investimento',
      paymentMethod: 'Transferência para Caixinha',
      description: `Guardado em ${vault.name}`,
      rawMessage: `Guardado R$ ${amount} na caixinha ${vault.name}`,
      date: now.toISOString(),
      monthKey
    });

    this.save();
    return { vault, tx };
  }

  public withdrawFromVault(
    accountId: string,
    vaultNameOrId: string,
    amount: number,
    senderPhone: string,
    senderName: string
  ): { vault: Vault; tx: Transaction } | null {
    if (amount <= 0) return null;
    let vault = this.getVault(accountId, vaultNameOrId);
    if (!vault) {
      const all = this.getVaults(accountId);
      if (all.length > 0) vault = all[0];
      else return null;
    }

    const withdrawAmount = Math.min(amount, vault.currentAmount);
    if (withdrawAmount <= 0) return null;

    vault.currentAmount -= withdrawAmount;

    // Retorna para o saldo livre como entrada
    const now = new Date();
    const monthKey = now.toISOString().substring(0, 7);
    const tx = this.addTransaction({
      accountId,
      senderPhone,
      senderName,
      amount: withdrawAmount,
      type: 'income',
      category: 'Resgate de Caixinha',
      paymentMethod: 'Resgate de Caixinha',
      description: `Resgate de ${vault.name}`,
      rawMessage: `Resgate de R$ ${withdrawAmount} da caixinha ${vault.name}`,
      date: now.toISOString(),
      monthKey
    });

    this.save();
    return { vault, tx };
  }

  public deleteVault(accountId: string, vaultId: string): boolean {
    if (!this.data.vaults) return false;
    const idx = this.data.vaults.findIndex(v => v.accountId === accountId && v.id === vaultId);
    if (idx === -1) return false;
    this.data.vaults.splice(idx, 1);
    this.save();
    return true;
  }

  public getTotalVaults(accountId: string): number {
    const vaults = this.getVaults(accountId);
    return vaults.reduce((acc, v) => acc + (v.currentAmount || 0), 0);
  }

  public getSummary(accountId: string, monthKey?: string) {
    const currentMonthKey = monthKey || new Date().toISOString().substring(0, 7);
    const list = this.getTransactions(accountId, currentMonthKey);

    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Record<string, number> = {};
    const byPerson: Record<string, { total: number; count: number }> = {};

    for (const item of list) {
      if (item.type === 'income') {
        totalIncome += item.amount;
      } else {
        totalExpense += item.amount;
        byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
        
        if (!byPerson[item.senderName]) {
          byPerson[item.senderName] = { total: 0, count: 0 };
        }
        byPerson[item.senderName].total += item.amount;
        byPerson[item.senderName].count += 1;
      }
    }

    const freeBalance = totalIncome - totalExpense;
    const totalVaults = this.getTotalVaults(accountId);

    return {
      monthKey: currentMonthKey,
      totalIncome,
      totalExpense,
      balance: freeBalance,
      totalVaults,
      netWorth: freeBalance + totalVaults,
      byCategory,
      byPerson,
      transactionCount: list.length
    };
  }
}

export const db = new Database();
