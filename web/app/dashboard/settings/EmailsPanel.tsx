'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ConnectedEmail } from '@/types'

export default function EmailsPanel({ emails, userId }: { emails: ConnectedEmail[]; userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [toggling, setToggling] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  async function connectGmail() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) alert(error.message)
  }

  async function handleToggle(id: string, currentActive: boolean) {
    setToggling(id)
    await supabase.from('connected_emails').update({ is_active: !currentActive }).eq('id', id)
    setToggling(null)
    router.refresh()
  }

  async function handleDisconnect(id: string) {
    if (!confirm('Disconnect this email account?')) return
    setDisconnecting(id)
    await supabase.from('connected_emails').delete().eq('id', id)
    setDisconnecting(null)
    router.refresh()
  }

  return (
    <div>
      {emails.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed rounded-2xl mb-4" style={{ borderColor: '#E5E7EB' }}>
          <p className="text-3xl mb-2">📧</p>
          <p className="text-sm font-medium mb-1" style={{ color: '#1A1A2E' }}>No email accounts connected</p>
          <p className="text-xs" style={{ color: '#877273' }}>Connect Gmail to auto-capture bank transaction emails</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {emails.map(email => (
            <div key={email.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: '#E5E7EB' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                style={{ background: '#F8F9FA' }}>
                {email.provider === 'gmail' ? '📧' : '📨'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#1A1A2E' }}>{email.email_address}</p>
                <p className="text-xs capitalize" style={{ color: '#877273' }}>
                  {email.provider}
                  {email.last_polled_at && ` · Last synced ${new Date(email.last_polled_at).toLocaleDateString()}`}
                </p>
              </div>
              <button
                onClick={() => handleToggle(email.id, email.is_active)}
                disabled={toggling === email.id}
                className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
                style={{ background: email.is_active ? '#00955F' : '#E5E7EB' }}
                title={email.is_active ? 'Disable' : 'Enable'}
              >
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                  style={{ left: email.is_active ? '20px' : '2px' }} />
              </button>
              <button onClick={() => handleDisconnect(email.id)} disabled={disconnecting === email.id}
                className="text-sm transition hover:text-red-500 flex-shrink-0"
                style={{ color: '#877273' }}>
                {disconnecting === email.id ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={connectGmail}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition hover:bg-gray-50"
          style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
          <svg width="16" height="16" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Connect Gmail
        </button>
      </div>
    </div>
  )
}
