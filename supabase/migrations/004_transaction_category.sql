ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';
