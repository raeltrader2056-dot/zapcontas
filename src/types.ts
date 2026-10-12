export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  accountId: string;
  plan: 'free' | 'pro';
  trialUsed: boolean;
  trialEndsAt: string;
  deviceFingerprint?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'individual' | 'shared';
  token: string;
  members: string[];
  monthlyBudget?: number;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled';
  planType: 'free' | 'individual_monthly' | 'couple_annual';
  expiresAt?: string;
  createdAt: string;
}

export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  accountId: string;
  senderPhone: string;
  senderName: string; // Nome de quem enviou/gastou
  amount: number;
  type: TransactionType;
  category: string; // Ex: Alimentação, Transporte, Moradia, Salário, etc.
  paymentMethod: string; // PIX, Débito, Crédito, Dinheiro, etc.
  description: string;
  rawMessage: string;
  date: string; // ISO String (ex: 2026-10-11T14:30:00Z)
  monthKey: string; // YYYY-MM para agrupamentos rápidos
}

export interface Vault {
  id: string;
  accountId: string;
  name: string; // Ex: "Reserva de Emergência", "Viagem", "Investimentos"
  targetAmount: number; // Meta financeira (ex: 5000)
  currentAmount: number; // Saldo guardado atualmente
  icon: string; // Ícone visual (ex: 🛡️, ✈️, 📈, 🏠, 🚗, 💰)
  createdAt: string;
}

export interface ParsedMessage {
  intent: 
    | 'transaction' 
    | 'balance_query' 
    | 'report_query' 
    | 'dashboard_link' 
    | 'reset_balance'
    | 'set_initial_balance'
    | 'set_budget'
    | 'delete_last'
    | 'vault_deposit'
    | 'vault_withdraw'
    | 'vault_query'
    | 'add_money'
    | 'remove_money'
    | 'subscribe'
    | 'help' 
    | 'unknown';
  transaction?: {
    type: TransactionType;
    amount: number;
    category: string;
    paymentMethod: string;
    description: string;
  };
  queryPeriod?: 'today' | 'week' | 'month' | 'by_person';
  targetAmount?: number;
  vaultName?: string;
  explanation?: string;
}
