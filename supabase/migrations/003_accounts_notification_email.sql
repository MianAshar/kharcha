-- Add notification_email to accounts table.
-- Stores the email address a bank uses to send transaction alerts
-- (e.g. alerts.pk@sc.com, email.notification@bankalfalah.com).
-- Used by parse-bank-email as a Tier-1 sender filter for precision email fetching.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS notification_email text;
