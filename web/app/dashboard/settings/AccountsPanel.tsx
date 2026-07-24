'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Account, AccountType } from '@/types'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'debit_card', label: '💳 Debit Card' },
  { value: 'credit_card', label: '🏦 Credit Card' },
  { value: 'mobile_wallet', label: '📱 Mobile Wallet' },
  { value: 'bank_account', label: '🏛 Bank Account' },
  { value: 'cash', label: '💵 Cash' },
]

export default function AccountsPanel({ accounts, userId }: { accounts: Account[]; userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('debit_card')
  const [bankName, setBankName] = useState('')
  const [last4, setLast4] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('accounts').insert({
      user_id: userId,
      account_name: name,
      account_type: type,
      bank_name: bankName || null,
      last4: last4 || null,
      is_default: accounts.length === 0,
    })
    setName(''); setBankName(''); setLast4('')
    setShowAdd(false)
    setSaving(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this account?')) return
    setDeleting(id)
    await supabase.from('accounts').delete().eq('id', id)
    setDeleting(null)
    router.refresh()
  }

  return (
    <div>
      {accounts.length === 0 && !showAdd && (
        <p className="text-sm mb-4" style={{ color: '#877273' }}>No payment accounts added yet.</p>
      )}

      <div className="space-y-2 mb-4">
        {accounts.map(acc => (
          <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: '#E5E7EB' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white"
              style={{ background: acc.color ?? '#1A1A2E' }}>
              {(acc.bank_name ?? acc.account_name).slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{acc.account_name}</p>
              <p className="text-xs" style={{ color: '#877273' }}>
                {acc.bank_name}{acc.last4 ? ` ···${acc.last4}` : ''} · {acc.account_type.replace('_', ' ')}
              </p>
            </div>
            {acc.is_default && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F0FDF4', color: '#00955F' }}>Default</span>
            )}
            <button onClick={() => handleDelete(acc.id)} disabled={deleting === acc.id}
              className="text-sm transition hover:text-red-500 disabled:opacity-50"
              style={{ color: '#877273' }}>
              {deleting === acc.id ? '…' : '✕'}
            </button>
          </div>
        ))}
      </div>

      {showAdd ? (
        <form onSubmit={handleAdd} className="border rounded-2xl p-4 space-y-3" style={{ borderColor: '#E5E7EB' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#877273' }}>ACCOUNT NAME</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. HBL Debit"
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-[#E94560]"
                style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#877273' }}>TYPE</label>
              <select value={type} onChange={e => setType(e.target.value as AccountType)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-[#F8F9FA]"
                style={{ borderColor: '#E5E7EB' }}>
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#877273' }}>BANK NAME</label>
              <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HBL"
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-[#E94560]"
                style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#877273' }}>LAST 4 DIGITS</label>
              <input value={last4} onChange={e => setLast4(e.target.value.slice(0, 4))} placeholder="1234" maxLength={4}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-[#E94560]"
                style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition hover:bg-gray-50"
              style={{ borderColor: '#E5E7EB', color: '#877273' }}>Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: '#E94560' }}>
              {saving ? 'Adding…' : 'Add Account'}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition hover:bg-gray-50"
          style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
          + Add Account
        </button>
      )}
    </div>
  )
}
