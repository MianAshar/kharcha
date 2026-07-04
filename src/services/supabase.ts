import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://jvpkqiiycmpcelxqtact.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2cGtxaWl5Y21wY2VseHF0YWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjYzNzUsImV4cCI6MjA5MzgwMjM3NX0.cDYixWiZBGiqlw2x1IuDl6eFsVYb4ZK9tiyiPwgulbE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist sessions to AsyncStorage so they survive app restarts.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Must be false in React Native — there is no browser URL to parse.
    detectSessionInUrl: false,
  },
});
