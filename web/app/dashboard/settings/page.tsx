import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getInitials } from '@/lib/format'
import ProfileForm from './ProfileForm'
import AccountsPanel from './AccountsPanel'
import EmailsPanel from './EmailsPanel'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, accountsRes, emailsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('connected_emails').select('*').eq('user_id', user.id).order('created_at'),
  ])

  const profile = profileRes.data
  const accounts = accountsRes.data ?? []
  const emails = emailsRes.data ?? []

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-8" style={{ color: '#1A1A2E' }}>Settings</h1>

      {/* Profile */}
      <section className="bg-white rounded-2xl shadow-sm border p-6 mb-6" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
            style={{ background: '#E94560' }}>
            {getInitials(profile?.full_name)}
          </div>
          <div>
            <p className="font-semibold" style={{ color: '#1A1A2E' }}>{profile?.full_name ?? 'Your Account'}</p>
            <p className="text-sm" style={{ color: '#877273' }}>{user.email}</p>
          </div>
        </div>
        <ProfileForm profile={profile} userId={user.id} />
      </section>

      {/* Payment accounts */}
      <section className="bg-white rounded-2xl shadow-sm border p-6 mb-6" style={{ borderColor: '#E5E7EB' }}>
        <h2 className="font-semibold mb-4" style={{ color: '#1A1A2E' }}>Payment Accounts</h2>
        <AccountsPanel accounts={accounts} userId={user.id} />
      </section>

      {/* Connected emails */}
      <section className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: '#E5E7EB' }}>
        <h2 className="font-semibold mb-1" style={{ color: '#1A1A2E' }}>Connected Emails</h2>
        <p className="text-sm mb-4" style={{ color: '#877273' }}>
          Kharcha polls these inboxes for bank transaction emails automatically.
        </p>
        <EmailsPanel emails={emails} userId={user.id} />
      </section>
    </div>
  )
}
