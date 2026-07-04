-- ============================================================
-- Kharcha — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name       text,
  currency        text NOT NULL DEFAULT 'PKR',
  monthly_budget  numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own profile"
  ON profiles FOR ALL USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  account_name  text NOT NULL,
  account_type  text NOT NULL CHECK (
    account_type IN ('debit_card','credit_card','mobile_wallet','cash','bank_account')
  ),
  last4         text,
  bank_name     text,
  is_default    boolean NOT NULL DEFAULT false,
  color         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own accounts"
  ON accounts FOR ALL USING (auth.uid() = user_id);

-- ── receipts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  image_url        text NOT NULL,
  raw_ai_response  jsonb,
  status           text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','processed','failed','needs_review')
  ),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own receipts"
  ON receipts FOR ALL USING (auth.uid() = user_id);

-- ── bank_transactions ─────────────────────────────────────────
-- Defined before expenses so expenses can FK to it
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  source              text NOT NULL CHECK (source IN ('sms','email')),
  confirmed_by        text NOT NULL CHECK (confirmed_by IN ('sms_only','email_only','both')),
  raw_message         text NOT NULL,
  bank_name           text NOT NULL,
  transaction_type    text NOT NULL CHECK (transaction_type IN ('debit','credit')),
  amount              numeric NOT NULL,
  currency            text NOT NULL DEFAULT 'PKR',
  account_last4       text,
  transaction_date    timestamptz NOT NULL,
  merchant_hint       text,
  balance_after       numeric,
  reference_number    text,
  matched_expense_id  uuid,          -- FK added after expenses table
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own transactions"
  ON bank_transactions FOR ALL USING (auth.uid() = user_id);

-- Deduplication index: same amount, bank, account, within 10-minute windows
CREATE INDEX IF NOT EXISTS idx_bank_transactions_dedup
  ON bank_transactions (user_id, bank_name, account_last4, amount, transaction_date);

-- ── expenses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  receipt_id        uuid REFERENCES receipts ON DELETE SET NULL,
  transaction_id    uuid REFERENCES bank_transactions ON DELETE SET NULL,
  account_id        uuid REFERENCES accounts ON DELETE SET NULL,
  merchant_name     text NOT NULL,
  category          text NOT NULL DEFAULT 'other',
  amount            numeric NOT NULL,
  currency          text NOT NULL DEFAULT 'PKR',
  expense_date      date NOT NULL,
  expense_time      time,
  payment_method    text NOT NULL CHECK (
    payment_method IN ('cash','card','bank_transfer','mobile_wallet')
  ),
  items             jsonb,
  tax_amount        numeric,
  tip_amount        numeric,
  notes             text,
  match_status      text NOT NULL DEFAULT 'unmatched' CHECK (
    match_status IN ('unmatched','matched','suggested','manual','cash_only')
  ),
  confidence_score  numeric NOT NULL DEFAULT 0 CHECK (
    confidence_score >= 0 AND confidence_score <= 1
  ),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own expenses"
  ON expenses FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (user_id, category);

-- Now add the FK from bank_transactions → expenses
ALTER TABLE bank_transactions
  ADD CONSTRAINT fk_matched_expense
  FOREIGN KEY (matched_expense_id) REFERENCES expenses ON DELETE SET NULL;

-- ── connected_emails ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connected_emails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('gmail','outlook')),
  email_address         text NOT NULL,
  oauth_token_encrypted text NOT NULL,
  last_polled_at        timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);

ALTER TABLE connected_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access own connected emails"
  ON connected_emails FOR ALL USING (auth.uid() = user_id);

-- ── categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles ON DELETE CASCADE,  -- NULL = system default
  name        text NOT NULL,
  icon        text NOT NULL,
  color       text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own + system categories"
  ON categories FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can manage own categories"
  ON categories FOR ALL USING (auth.uid() = user_id);

-- ── Seed: default categories ───────────────────────────────────
INSERT INTO categories (id, user_id, name, icon, color, is_default) VALUES
  (gen_random_uuid(), NULL, 'Food & Dining',    '🍽️',  '#FF6B6B', true),
  (gen_random_uuid(), NULL, 'Transport',         '🚗',  '#4ECDC4', true),
  (gen_random_uuid(), NULL, 'Groceries',         '🛒',  '#45B7D1', true),
  (gen_random_uuid(), NULL, 'Shopping',          '🛍️',  '#96CEB4', true),
  (gen_random_uuid(), NULL, 'Utilities',         '💡',  '#FFEAA7', true),
  (gen_random_uuid(), NULL, 'Health',            '💊',  '#DDA0DD', true),
  (gen_random_uuid(), NULL, 'Entertainment',     '🎬',  '#F0E68C', true),
  (gen_random_uuid(), NULL, 'Education',         '📚',  '#98FB98', true),
  (gen_random_uuid(), NULL, 'Fuel',              '⛽',  '#FFB347', true),
  (gen_random_uuid(), NULL, 'Rent & Housing',    '🏠',  '#87CEEB', true),
  (gen_random_uuid(), NULL, 'Mobile & Internet', '📱',  '#DEB887', true),
  (gen_random_uuid(), NULL, 'Travel',            '✈️',  '#20B2AA', true),
  (gen_random_uuid(), NULL, 'Clothing',          '👗',  '#FF69B4', true),
  (gen_random_uuid(), NULL, 'Cafe & Coffee',     '☕',  '#A0522D', true),
  (gen_random_uuid(), NULL, 'Other',             '📦',  '#B0B0B0', true)
ON CONFLICT DO NOTHING;
