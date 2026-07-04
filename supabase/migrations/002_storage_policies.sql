-- ============================================================
-- Kharcha — Storage RLS Policies
-- Migration: 002_storage_policies.sql
-- ============================================================

-- Supabase Storage RLS is enforced on the storage.objects table.
-- Each file's `owner` column is set to auth.uid() at upload time,
-- so policies can simply compare owner to the current user.

-- Allow authenticated users to upload their own receipt files
CREATE POLICY "Users can upload own receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to read their own receipt files
CREATE POLICY "Users can read own receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to delete their own receipt files
CREATE POLICY "Users can delete own receipts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
