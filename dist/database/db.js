import fs from 'fs';
import path from 'path';
const DATA_DIR = path.resolve(process.cwd(), 'data');
export class Database {
    dbPath;
    data;
    constructor(filename = 'zapcontas.json') {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        this.dbPath = path.join(DATA_DIR, filename);
        this.data = this.load();
    }
    load() {
        if (fs.existsSync(this.dbPath)) {
            try {
                const raw = fs.readFileSync(this.dbPath, 'utf-8');
                return JSON.parse(raw);
            }
            catch (e) {
                console.error('Erro ao ler banco de dados, inicializando vazio:', e);
            }
        }
        const initial = {
            users: [],
            accounts: [],
            transactions: []
        };
        this.save(initial);
        return initial;
    }
    save(dataToSave = this.data) {
        fs.writeFileSync(this.dbPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    }
    // --- Usuários e Contas com Proteção Anti-Fraude de Trial ---
    getOrCreateUser(phone, name, fingerprint) {
        let user = this.data.users.find(u => u.phone === phone);
        // Se usuário já existe, apenas retorna
        if (user) {
            const account = this.data.accounts.find(a => a.id === user.accountId);
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
        const newAccount = {
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
    isAccessAllowed(phone) {
        const user = this.data.users.find(u => u.phone === phone);
        if (!user)
            return { allowed: true };
        const account = this.data.accounts.find(a => a.id === user.accountId);
        if (!account)
            return { allowed: true };
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
    linkSharedAccount(phone1, phone2, accountName) {
        const user1 = this.data.users.find(u => u.phone === phone1);
        const user2 = this.data.users.find(u => u.phone === phone2);
        if (!user1 || !user2)
            return null;
        const account = this.data.accounts.find(a => a.id === user1.accountId);
        if (!account)
            return null;
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
    getAccountByToken(token) {
        if (!token || token === 'demo') {
            return undefined;
        }
        return this.data.accounts.find(a => a.token === token);
    }
    getAccount(accountId) {
        return this.data.accounts.find(a => a.id === accountId);
    }
    getUserByAccountId(accountId) {
        let user = this.data.users.find(u => u.accountId === accountId);
        if (!user) {
            const account = this.data.accounts.find(a => a.id === accountId);
            if (account && account.members && account.members.length > 0) {
                user = this.data.users.find(u => account.members.includes(u.phone));
            }
        }
        return user;
    }
    getUserByPhone(phone) {
        return this.data.users.find(u => u.phone === phone);
    }
    // Atualização de perfil do cliente
    updateUserProfile(accountId, params) {
        const account = this.data.accounts.find(a => a.id === accountId);
        if (!account)
            throw new Error('Conta não encontrada');
        const user = this.data.users.find(u => u.accountId === accountId);
        if (!user)
            throw new Error('Usuário não encontrado');
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
                        if (params.name)
                            t.senderName = params.name;
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
    addTransaction(tx) {
        const fullTx = {
            ...tx,
            id: 'tx_' + Math.random().toString(36).substring(2, 9)
        };
        this.data.transactions.push(fullTx);
        this.save();
        return fullTx;
    }
    // Ativa assinatura Pro quando o pagamento for aprovado
    activateSubscription(accountId, planType) {
        const account = this.data.accounts.find(a => a.id === accountId);
        if (!account)
            return null;
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
    getTransactions(accountId, monthKey) {
        return this.data.transactions
            .filter(t => t.accountId === accountId && (!monthKey || t.monthKey === monthKey))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    // Apaga a última transação feita por um usuário específico
    deleteLastTransaction(accountId, phone) {
        const idx = [...this.data.transactions]
            .reverse()
            .findIndex(t => t.accountId === accountId && t.senderPhone === phone);
        if (idx === -1)
            return null;
        const realIdx = this.data.transactions.length - 1 - idx;
        const removed = this.data.transactions.splice(realIdx, 1)[0];
        this.save();
        return removed;
    }
    // Apaga uma transação específica pelo ID
    deleteTransaction(accountId, transactionId) {
        const idx = this.data.transactions.findIndex(t => t.accountId === accountId && t.id === transactionId);
        if (idx === -1)
            return false;
        this.data.transactions.splice(idx, 1);
        this.save();
        return true;
    }
    // Atualiza uma transação existente (para o cliente corrigir erros)
    updateTransaction(accountId, transactionId, updates) {
        const tx = this.data.transactions.find(t => t.accountId === accountId && t.id === transactionId);
        if (!tx)
            return null;
        if (updates.amount !== undefined && updates.amount > 0)
            tx.amount = updates.amount;
        if (updates.description !== undefined && updates.description.trim())
            tx.description = updates.description.trim();
        if (updates.category !== undefined && updates.category.trim())
            tx.category = updates.category.trim();
        if (updates.paymentMethod !== undefined)
            tx.paymentMethod = updates.paymentMethod;
        if (updates.type !== undefined)
            tx.type = updates.type;
        this.save();
        return tx;
    }
    // Zera todos os lançamentos do mês ou adiciona um ajuste compensatório
    resetAccountMonth(accountId, monthKey) {
        const currentMonthKey = monthKey || new Date().toISOString().substring(0, 7);
        const countBefore = this.data.transactions.length;
        this.data.transactions = this.data.transactions.filter(t => !(t.accountId === accountId && t.monthKey === currentMonthKey));
        const removedCount = countBefore - this.data.transactions.length;
        this.save();
        return removedCount;
    }
    // Define uma meta de gastos mensal
    setMonthlyBudget(accountId, budget) {
        const account = this.data.accounts.find(a => a.id === accountId);
        if (!account)
            return null;
        account.monthlyBudget = budget;
        this.save();
        return account;
    }
    getSummary(accountId, monthKey) {
        const currentMonthKey = monthKey || new Date().toISOString().substring(0, 7);
        const list = this.getTransactions(accountId, currentMonthKey);
        let totalIncome = 0;
        let totalExpense = 0;
        const byCategory = {};
        const byPerson = {};
        for (const item of list) {
            if (item.type === 'income') {
                totalIncome += item.amount;
            }
            else {
                totalExpense += item.amount;
                byCategory[item.category] = (byCategory[item.category] || 0) + item.amount;
                if (!byPerson[item.senderName]) {
                    byPerson[item.senderName] = { total: 0, count: 0 };
                }
                byPerson[item.senderName].total += item.amount;
                byPerson[item.senderName].count += 1;
            }
        }
        return {
            monthKey: currentMonthKey,
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            byCategory,
            byPerson,
            transactionCount: list.length
        };
    }
}
export const db = new Database();
