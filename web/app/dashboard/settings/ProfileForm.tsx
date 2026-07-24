'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

const CURRENCIES = ['PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR']

export default function ProfileForm({ profile, userId }: { profile: Profile | null; userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [currency, setCurrency] = useState(profile?.currency ?? 'PKR')
  const [budget, setBudget] = useState(profile?.monthly_budget?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      currency,
      monthly_budget: budget ? parseFloat(budget) : null,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>FULL NAME</label>
        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ali Ahmed"
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560]"
          style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>CURRENCY</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560] bg-[#F8F9FA]"
            style={{ borderColor: '#E5E7EB' }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>MONTHLY BUDGET</label>
          <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. 50000"
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560]"
            style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ background: saved ? '#00955F' : '#E94560' }}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile'}
      </button>
    </form>
  )
}
