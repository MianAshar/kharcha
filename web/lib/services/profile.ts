import { createClient } from '@/lib/supabase/client'
import type { Profile, Account, ConnectedEmail } from '@/types'

const supabase = createClient()

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) return null
  return data
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAccounts(userId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createAccount(account: Omit<Account, 'id' | 'created_at'>): Promise<Account> {
  const { data, error } = await supabase.from('accounts').insert(account).select().single()
  if (error) throw error
  return data
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) throw error
}

export async function getConnectedEmails(userId: string): Promise<ConnectedEmail[]> {
  const { data, error } = await supabase
    .from('connected_emails')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function toggleEmailActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('connected_emails').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function disconnectEmail(id: string): Promise<void> {
  const { error } = await supabase.from('connected_emails').delete().eq('id', id)
  if (error) throw error
}
