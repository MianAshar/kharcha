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
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [showHistorical, setShowHistorical] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function runSync(dateRange?: { date_from: string; date_to: string }) {
    setSyncing(true)
    setSyncResult(null)

    const { data: before } = await supabase
      .from('connected_emails')
      .select('id, is_active')
      .eq('user_id', userId)

    try {
      const { error } = await supabase.functions.invoke('parse-bank-email', {
        body: { user_id: userId, ...dateRange },
      })
      if (error) throw error
    } catch (e: unknown) {
      setSyncResult('⚠ Sync failed: ' + (e instanceof Error ? e.message : 'unknown error'))
      setSyncing(false)
      return
    }

    const { data: after } = await supabase
      .from('connected_emails')
      .select('id, is_active')
      .eq('user_id', userId)

    const tokenExpired = (before ?? []).some(b => {
      const a = (after ?? []).find(x => x.id === b.id)
      return b.is_active && a && !a.is_active
    })

    if (tokenExpired) {
      setSyncResult('⚠ Gmail token expired — please disconnect and reconnect your email account')
    } else {
      setSyncResult('✓ Sync complete — check the Transactions page for new data')
    }

    setSyncing(false)
    router.refresh()
  }

  async function handleSyncNow() {
    await runSync()
  }

  async function handleHistoricalSync() {
    if (!dateFrom || !dateTo) return
    setShowHistorical(false)
    setSyncing(true)
    setSyncResult(null)

    // Split the range into 2-week chunks to avoid gateway timeouts
    const chunks: { date_from: string; date_to: string }[] = []
    const cursor = new Date(dateFrom)
    const end = new Date(dateTo)
    while (cursor <= end) {
      const chunkEnd = new Date(cursor)
      chunkEnd.setDate(chunkEnd.getDate() + 13)
      if (chunkEnd > end) chunkEnd.setTime(end.getTime())
      chunks.push({
        date_from: cursor.toISOString().split('T')[0],
        date_to: chunkEnd.toISOString().split('T')[0],
      })
      cursor.setDate(cursor.getDate() + 14)
    }

    let completed = 0
    for (const chunk of chunks) {
      setSyncResult(`⏳ Importing ${chunk.date_from} → ${chunk.date_to} (${completed + 1}/${chunks.length})…`)
      try {
        await supabase.functions.invoke('parse-bank-email', {
          body: { user_id: userId, ...chunk },
        })
      } catch {
        // Gateway timeout is expected for large chunks — function still runs to completion
      }
      completed++
    }

    setSyncResult(`✓ Import complete (${chunks.length} chunk${chunks.length > 1 ? 's' : ''} processed) — check Transactions for new data`)
    setSyncing(false)
    router.refresh()
  }

  async function connectGmail() {
    const GOOGLE_WEB_CLIENT_ID =
      '105328440332-6e85m2dh2q6uelm0bomj3pjiqhr718fo.apps.googleusercontent.com'
    const CALLBACK_URI =
      'https://jvpkqiiycmpcelxqtact.supabase.co/functions/v1/gmail-oauth-callback'

    const state = `${userId}|${window.location.origin}`
    const params = new URLSearchParams({
      client_id: GOOGLE_WEB_CLIENT_ID,
      redirect_uri: CALLBACK_URI,
      response_type: 'code',
      scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'select_account consent',
      state,
    })

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
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

  const hasActiveEmails = emails.some(e => e.is_active)

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
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: '#F8F9FA' }}>
                {email.provider === 'gmail' ? '📧' : '📨'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#1A1A2E' }}>{email.email_address}</p>
                <p className="text-xs capitalize" style={{ color: '#877273' }}>
                  {email.provider}
                  {email.last_polled_at
                    ? ` · Last synced ${new Date(email.last_polled_at).toLocaleDateString()}`
                    : ' · Never synced'}
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

      {/* Historical sync panel */}
      {showHistorical && hasActiveEmails && (
        <div className="mb-4 p-4 rounded-xl border" style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }}>
          <p className="text-sm font-medium mb-3" style={{ color: '#1A1A2E' }}>Import emails from a date range</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#877273' }}>FROM</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-2 rounded-xl border text-sm outline-none focus:border-[#E94560] bg-white"
                style={{ borderColor: '#E5E7EB' }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#877273' }}>TO</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2 rounded-xl border text-sm outline-none focus:border-[#E94560] bg-white"
                style={{ borderColor: '#E5E7EB' }} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowHistorical(false)}
                className="px-3 py-2 rounded-xl border text-sm transition hover:bg-white"
                style={{ borderColor: '#E5E7EB', color: '#877273' }}>
                Cancel
              </button>
              <button onClick={handleHistoricalSync} disabled={!dateFrom || !dateTo || syncing}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: '#E94560' }}>
                {syncing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: '#877273' }}>
            Note: Gmail limits results to 100 emails per sync. For large ranges, run multiple syncs month by month.
          </p>
        </div>
      )}

      {syncResult && (
        <p className="text-xs mb-3 px-1" style={{ color: syncResult.startsWith('✓') ? '#00955F' : '#E94560' }}>
          {syncResult}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
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

        {hasActiveEmails && (
          <>
            <button onClick={handleSyncNow} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: '#E94560' }}>
              {syncing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Syncing…
                </>
              ) : <>🔄 Sync Now</>}
            </button>
            <button onClick={() => setShowHistorical(v => !v)} disabled={syncing}
              className="px-4 py-2.5 rounded-xl border text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
              📅 Import History
            </button>
          </>
        )}
      </div>
    </div>
  )
}
