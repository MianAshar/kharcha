ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS conversion_rate numeric;
