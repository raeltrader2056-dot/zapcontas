-- ========================================================
-- SCHEMA SQL PARA O SUPABASE • ZAPCONTAS
-- Execute este script no menu "SQL Editor" do painel Supabase
-- ========================================================

-- 1. Tabela de Contas / Carteiras (Individuais ou Casal)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'individual', -- 'individual' ou 'shared'
  token TEXT UNIQUE NOT NULL,
  members TEXT[] DEFAULT '{}',
  monthly_budget NUMERIC DEFAULT 2500,
  subscription_status TEXT DEFAULT 'trialing', -- 'trialing', 'active', 'past_due'
  plan_type TEXT DEFAULT 'free',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Usuários vinculados ao celular e autenticação
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free',
  trial_used BOOLEAN DEFAULT TRUE,
  trial_ends_at TIMESTAMPTZ,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Transações Financeiras
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  sender_phone TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL, -- 'expense' ou 'income'
  category TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  description TEXT NOT NULL,
  raw_message TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  month_key TEXT NOT NULL -- ex: '2026-10'
);

-- Índices para buscas ultra rápidas
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month_key);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_accounts_token ON accounts(token);
