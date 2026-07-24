'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import type { AIReceiptResult, PaymentMethod } from '@/types'

type Stage = 'upload' | 'processing' | 'review'

const today = new Date().toISOString().split('T')[0]

export default function NewExpensePage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('upload')
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')

  // Form fields
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('other')
  const [amount, setAmount] = useState('')
  const [currency] = useState('PKR')
  const [expenseDate, setExpenseDate] = useState(today)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<AIReceiptResult['items']>([])
  const [confidence, setConfidence] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  function handleFileSelect(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError('')
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFileSelect(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) handleFileSelect(f)
  }

  async function processReceipt() {
    if (!file) return
    setStage('processing')
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      setStatusMsg('Uploading receipt…')
      const path = `receipts/${user.id}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
      const { data: receipt, error: dbErr } = await supabase
        .from('receipts').insert({ user_id: user.id, image_url: publicUrl, status: 'pending' })
        .select().single()
      if (dbErr) throw dbErr
      setReceiptId(receipt.id)

      setStatusMsg('Analyzing with AI…')
      const { data, error: fnErr } = await supabase.functions.invoke('process-receipt', {
        body: { receipt_id: receipt.id },
      })

      if (!fnErr && data?.result) {
        const r: AIReceiptResult = data.result
        setMerchant(r.merchant_name ?? '')
        setCategory(r.category ?? 'other')
        setAmount(String(r.amount ?? ''))
        setExpenseDate(r.expense_date ?? today)
        setPaymentMethod(r.payment_method ?? 'card')
        setItems(r.items ?? [])
        setConfidence(r.confidence_score ?? null)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Processing failed')
    } finally {
      setStage('review')
    }
  }

  async function saveExpense() {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { data: expense, error: err } = await supabase.from('expenses').insert({
        user_id: user.id,
        receipt_id: receiptId,
        merchant_name: merchant || 'Unknown',
        category,
        amount: parseFloat(amount) || 0,
        currency,
        expense_date: expenseDate,
        payment_method: paymentMethod,
        items: items.length > 0 ? items : null,
        notes: notes || null,
        match_status: paymentMethod === 'cash' ? 'cash_only' : 'unmatched',
        confidence_score: confidence ?? 0,
      }).select().single()

      if (err) throw err

      // Fire-and-forget auto-match
      supabase.functions.invoke('match-transaction', { body: { expense_id: expense.id } }).catch(() => {})

      router.push(`/dashboard/expenses/${expense.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  async function saveManual() {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { data: expense, error: err } = await supabase.from('expenses').insert({
        user_id: user.id,
        receipt_id: null,
        merchant_name: merchant || 'Unknown',
        category,
        amount: parseFloat(amount) || 0,
        currency,
        expense_date: expenseDate,
        payment_method: paymentMethod,
        notes: notes || null,
        match_status: paymentMethod === 'cash' ? 'cash_only' : 'unmatched',
        confidence_score: 0,
      }).select().single()

      if (err) throw err
      router.push(`/dashboard/expenses/${expense.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  // ── Upload stage ──────────────────────────────────────────────────────────
  if (stage === 'upload') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-sm" style={{ color: '#877273' }}>← Back</button>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>Add Expense</h1>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !preview && fileRef.current?.click()}
          className="border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer mb-4"
          style={{ borderColor: preview ? '#E94560' : '#E5E7EB', background: '#fff' }}
        >
          {preview ? (
            <img src={preview} alt="Receipt preview" className="max-h-64 mx-auto rounded-xl object-contain" />
          ) : (
            <>
              <p className="text-5xl mb-3">📷</p>
              <p className="font-medium mb-1" style={{ color: '#1A1A2E' }}>Drop receipt image here</p>
              <p className="text-sm" style={{ color: '#877273' }}>or click to browse</p>
            </>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

        {preview && (
          <div className="flex gap-3">
            <button onClick={() => { setPreview(null); setFile(null) }}
              className="flex-1 py-3 rounded-xl border text-sm font-medium transition hover:bg-gray-50"
              style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
              Choose Another
            </button>
            <button onClick={processReceipt}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#E94560' }}>
              Scan with AI ✨
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
          <span className="text-xs" style={{ color: '#877273' }}>or</span>
          <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
        </div>

        <button onClick={() => setStage('review')}
          className="w-full py-3 rounded-xl border text-sm font-medium transition hover:bg-gray-50"
          style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}>
          Add Manually
        </button>
      </div>
    )
  }

  // ── Processing stage ──────────────────────────────────────────────────────
  if (stage === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#E94560', borderTopColor: 'transparent' }} />
        <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{statusMsg}</p>
      </div>
    )
  }

  // ── Review stage ──────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setStage('upload')} className="text-sm" style={{ color: '#877273' }}>← Back</button>
        <h1 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>Review Expense</h1>
      </div>

      {confidence !== null && confidence < 0.6 && (
        <div className="mb-4 p-3 rounded-xl text-sm border" style={{ background: '#FFFBEB', borderColor: '#F59E0B', color: '#92400E' }}>
          ⚠️ Low confidence ({(confidence * 100).toFixed(0)}%) — please verify the details below.
        </div>
      )}

      {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5" style={{ borderColor: '#E5E7EB' }}>
        {preview && (
          <div className="flex justify-center">
            <img src={preview} alt="Receipt" className="max-h-40 rounded-xl object-contain border" style={{ borderColor: '#E5E7EB' }} />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>MERCHANT NAME</label>
          <input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="e.g. McDonald's"
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560]"
            style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>AMOUNT (PKR)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560]"
              style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>DATE</label>
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560]"
              style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>CATEGORY</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560] bg-[#F8F9FA]"
            style={{ borderColor: '#E5E7EB' }}>
            {DEFAULT_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>PAYMENT METHOD</label>
          <div className="flex gap-2">
            {(['card', 'cash', 'bank_transfer', 'mobile_wallet'] as PaymentMethod[]).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className="flex-1 py-2 rounded-xl border text-xs font-medium transition"
                style={{
                  background: paymentMethod === m ? '#E94560' : '#fff',
                  color: paymentMethod === m ? '#fff' : '#1A1A2E',
                  borderColor: paymentMethod === m ? '#E94560' : '#E5E7EB',
                }}>
                {m === 'card' ? '💳 Card' : m === 'cash' ? '💵 Cash' : m === 'bank_transfer' ? '🏦 Bank' : '📱 Wallet'}
              </button>
            ))}
          </div>
        </div>

        {items.length > 0 && (
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: '#877273' }}>LINE ITEMS</label>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
              <table className="w-full text-xs">
                <thead style={{ background: '#F8F9FA' }}>
                  <tr>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: '#877273' }}>Item</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: '#877273' }}>Qty</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: '#877273' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: '#E5E7EB' }}>
                      <td className="px-3 py-2" style={{ color: '#1A1A2E' }}>{item.name}</td>
                      <td className="px-3 py-2 text-right" style={{ color: '#877273' }}>{item.qty}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: '#1A1A2E' }}>
                        PKR {item.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#877273' }}>NOTES (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes…"
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[#E94560] resize-none"
            style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }} />
        </div>

        <button
          onClick={preview ? saveExpense : saveManual}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: '#E94560' }}>
          {saving ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </div>
  )
}
