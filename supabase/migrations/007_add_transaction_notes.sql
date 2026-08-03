ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS notes text;
