'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, formatDateShort } from '@/lib/format'
import { CATEGORY_MAP } from '@/lib/constants'
import type { BankTransaction, Expense } from '@/types'
import NotesEditor from './[id]/NotesEditor'

interface Group {
  dateKey: string
  label: string
  items: BankTransaction[]
}

interface DrawerData {
  matchedExpense: Expense | null
  unmatchedExpenses: {
    id: string
    merchant_name: string
    amount: number
    currency: string
    expense_date: string
    category: string
    match_status: string
  }[]
}

export default function TransactionsClient({ groups }: { groups: Group[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null)
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [matchLoading, setMatchLoading] = useState<string | null>(null)
  const [unmatchLoading, setUnmatchLoading] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteOverrides, setNoteOverrides] = useState<Record<string, string | null>>({})

  const filteredGroups = search.trim()
    ? groups
        .map(group => ({
          ...group,
          items: group.items.filter(tx => {
            const q = search.toLowerCase()
            return (
              tx.merchant_hint?.toLowerCase().includes(q) ||
              tx.bank_name?.toLowerCase().includes(q)
            )
          }),
        }))
        .filter(group => group.items.length > 0)
    : groups

  const fetchDrawerData = useCallback(async (tx: BankTransaction) => {
    setDrawerLoading(true)
    setDrawerData(null)
    setMatchOpen(false)

    const [matchedRes, unmatchedRes] = await Promise.all([
      tx.matched_expense_id
        ? supabase.from('expenses').select('*').eq('id', tx.matched_expense_id).single()
        : Promise.resolve({ data: null }),
      !tx.matched_expense_id && tx.transaction_type === 'debit'
        ? supabase
            .from('expenses')
            .select('id, merchant_name, amount, currency, expense_date, category, match_status')
            .in('match_status', ['unmatched', 'suggested'])
            .order('expense_date', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
    ])

    setDrawerData({
      matchedExpense: matchedRes.data ?? null,
      unmatchedExpenses: (unmatchedRes.data ?? []) as DrawerData['unmatchedExpenses'],
    })
    setDrawerLoading(false)
  }, [supabase])

  useEffect(() => {
    if (selectedTx) fetchDrawerData(selectedTx)
  }, [selectedTx, fetchDrawerData])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedTx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleMatch(expenseId: string) {
    if (!selectedTx) return
    setMatchLoading(expenseId)
    await supabase.from('bank_transactions').update({ matched_expense_id: expenseId }).eq('id', selectedTx.id)
    await supabase.from('expenses').update({ transaction_id: selectedTx.id, match_status: 'manual' }).eq('id', expenseId)
    setMatchLoading(null)
    const updated = { ...selectedTx, matched_expense_id: expenseId }
    setSelectedTx(updated)
    router.refresh()
    fetchDrawerData(updated)
  }

  async function handleUnmatch() {
    if (!selectedTx || !drawerData?.matchedExpense) return
    if (!confirm('Remove this match?')) return
    setUnmatchLoading(true)
    await supabase.from('bank_transactions').update({ matched_expense_id: null }).eq('id', selectedTx.id)
    await supabase.from('expenses').update({ transaction_id: null, match_status: 'unmatched' }).eq('id', drawerData.matchedExpense.id)
    setUnmatchLoading(false)
    const updated = { ...selectedTx, matched_expense_id: null }
    setSelectedTx(updated)
    router.refresh()
    fetchDrawerData(updated)
  }

  const isDebit = selectedTx?.transaction_type === 'debit'

  function startEditNote(tx: BankTransaction) {
    setEditingNoteId(tx.id)
    const current = tx.id in noteOverrides ? noteOverrides[tx.id] : tx.notes
    setNoteDraft(current ?? '')
  }

  async function handleSaveNote(txId: string) {
    setNoteSaving(true)
    const trimmed = noteDraft.trim()
    const { error } = await supabase.from('bank_transactions').update({ notes: trimmed || null }).eq('id', txId)
    if (!error) {
      setNoteOverrides(prev => ({ ...prev, [txId]: trimmed || null }))
      setEditingNoteId(null)
      router.refresh()
    }
    setNoteSaving(false)
  }

  return (
    <>
      {/* Search */}
      <div className="relative mb-6">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#877273' }}>🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search merchant or bank…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[#E94560] bg-white"
          style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: '#877273' }}
          >✕</button>
        )}
      </div>

      {/* Grouped list */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center shadow-sm" style={{ borderColor: '#E5E7EB' }}>
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>No results for &quot;{search}&quot;</p>
            <p className="text-xs mt-1" style={{ color: '#877273' }}>Try a different merchant or bank name</p>
          </div>
        ) : filteredGroups.map(group => (
          <div key={group.dateKey}>
            <div className="flex items-center gap-3 mb-2 px-1">
              <span className="text-xs font-semibold" style={{ color: '#877273' }}>{group.label}</span>
              <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
              <span className="text-xs" style={{ color: '#877273' }}>
                {group.items.length} txn{group.items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
              {group.items.map((tx, i) => {
                const isDebitRow = tx.transaction_type === 'debit'
                const isMatched = !!tx.matched_expense_id
                const isSelected = selectedTx?.id === tx.id
                const displayNotes = editingNoteId === tx.id
                  ? null
                  : (noteOverrides[tx.id] !== undefined ? noteOverrides[tx.id] : tx.notes)
                const isEditingNote = editingNoteId === tx.id
                return (
                  <div
                    key={tx.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTx(isSelected ? null : tx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedTx(isSelected ? null : tx)
                    }}
                    className={`group w-full flex items-center gap-4 px-5 py-4 text-left transition-colors cursor-pointer ${i > 0 ? 'border-t' : ''}`}
                    style={{
                      borderColor: '#F8F9FA',
                      background: isSelected ? '#FFF5F7' : undefined,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 transition-colors"
                      style={{ background: isSelected ? '#E94560' : '#1A1A2E' }}
                    >
                      {tx.bank_name?.slice(0, 2).toUpperCase() ?? '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                        {tx.merchant_hint ?? tx.bank_name}
                        {tx.account_last4 && (
                          <span className="text-xs ml-1.5" style={{ color: '#877273' }}>···{tx.account_last4}</span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: '#877273' }}>
                        {new Date(tx.transaction_date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        <span className="capitalize">{tx.source}</span>
                      </p>
                      {isEditingNote ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 flex items-center gap-1.5"
                        >
                          <input
                            autoFocus
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              if (e.key === 'Enter') { e.preventDefault(); handleSaveNote(tx.id) }
                              if (e.key === 'Escape') setEditingNoteId(null)
                            }}
                            placeholder="Add a note..."
                            className="flex-1 min-w-0 text-xs rounded-lg px-2 py-1 outline-none border"
                            style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}
                          />
                          <button
                            onClick={() => handleSaveNote(tx.id)}
                            disabled={noteSaving}
                            className="text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0 disabled:opacity-50"
                            style={{ background: '#E94560', color: '#fff' }}
                          >
                            {noteSaving ? '…' : 'Save'}
                          </button>
                        </div>
                      ) : displayNotes ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditNote(tx) }}
                          className="text-xs mt-0.5 italic truncate text-left hover:underline"
                          style={{ color: '#877273' }}
                        >
                          📝 {displayNotes}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditNote(tx) }}
                          className="text-xs mt-0.5 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: '#B0B0B8' }}
                        >
                          + Add note
                        </button>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold" style={{ color: isDebitRow ? '#E94560' : '#00955F' }}>
                        {isDebitRow ? '-' : '+'}{formatCurrency(tx.converted_amount ?? tx.amount, tx.converted_amount ? 'PKR' : tx.currency)}
                      </p>
                      {tx.converted_amount ? (
                        <p className="text-xs" style={{ color: '#877273' }}>
                          {tx.currency} {tx.amount.toLocaleString()}
                        </p>
                      ) : (
                        <span className="text-xs" style={{ color: isMatched ? '#00955F' : '#877273' }}>
                          {isMatched ? '✓ matched' : 'unmatched'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Backdrop */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm"
          onClick={() => setSelectedTx(null)}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 z-50 h-full bg-white shadow-2xl flex flex-col"
        style={{
          width: '420px',
          transform: selectedTx ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="font-semibold" style={{ color: '#1A1A2E' }}>Transaction Details</h2>
          <button
            onClick={() => setSelectedTx(null)}
            className="w-8 h-8 flex items-center justify-center rounded-full transition hover:bg-gray-100 text-base"
            style={{ color: '#877273' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {selectedTx && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Amount + bank hero */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-lg flex-shrink-0"
                  style={{ background: '#1A1A2E' }}
                >
                  {selectedTx.bank_name?.slice(0, 2).toUpperCase() ?? '??'}
                </div>
                <div>
                  <p className="font-bold" style={{ color: '#1A1A2E' }}>{selectedTx.bank_name}</p>
                  {selectedTx.merchant_hint && (
                    <p className="text-sm" style={{ color: '#877273' }}>{selectedTx.merchant_hint}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold" style={{ color: isDebit ? '#E94560' : '#00955F' }}>
                  {isDebit ? '-' : '+'}{formatCurrency(selectedTx.converted_amount ?? selectedTx.amount, selectedTx.converted_amount ? 'PKR' : selectedTx.currency)}
                </p>
                {selectedTx.converted_amount && (
                  <p className="text-xs mt-0.5" style={{ color: '#877273' }}>
                    {selectedTx.currency} {selectedTx.amount.toLocaleString()}
                  </p>
                )}
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                  style={{
                    background: isDebit ? '#FFF0F3' : '#F0FDF4',
                    color: isDebit ? '#E94560' : '#00955F',
                  }}
                >
                  {selectedTx.transaction_type}
                </span>
              </div>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl col-span-2" style={{ background: '#F8F9FA' }}>
                <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Date & Time</p>
                <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{formatDateTime(selectedTx.transaction_date)}</p>
              </div>
              <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
                <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Source</p>
                <p className="text-sm font-medium capitalize" style={{ color: '#1A1A2E' }}>{selectedTx.source}</p>
              </div>
              {selectedTx.account_last4 && (
                <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
                  <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Account</p>
                  <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>···{selectedTx.account_last4}</p>
                </div>
              )}
              {selectedTx.balance_after !== null && (
                <div className="p-3 rounded-xl" style={{ background: '#F8F9FA' }}>
                  <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Balance After</p>
                  <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                    {formatCurrency(selectedTx.balance_after, selectedTx.currency)}
                  </p>
                </div>
              )}
              {selectedTx.reference_number && (
                <div className="p-3 rounded-xl col-span-2" style={{ background: '#F8F9FA' }}>
                  <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Reference</p>
                  <p className="text-sm font-mono" style={{ color: '#1A1A2E' }}>{selectedTx.reference_number}</p>
                </div>
              )}
              {selectedTx.conversion_rate && (
                <div className="p-3 rounded-xl col-span-2" style={{ background: '#FFF5F7' }}>
                  <p className="text-xs mb-0.5" style={{ color: '#877273' }}>Exchange Rate</p>
                  <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                    1 {selectedTx.currency} = {selectedTx.conversion_rate.toLocaleString('en-PK', { maximumFractionDigits: 2 })} PKR
                  </p>
                </div>
              )}
            </div>

            {/* Match / unmatched section */}
            {drawerLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="w-5 h-5 border-2 border-gray-200 border-t-[#E94560] rounded-full animate-spin" />
              </div>
            ) : drawerData?.matchedExpense ? (
              <div className="rounded-2xl border p-4" style={{ borderColor: '#E5E7EB' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>Matched Expense</h3>
                  <button
                    onClick={handleUnmatch}
                    disabled={unmatchLoading}
                    className="text-xs px-3 py-1.5 rounded-lg border transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                    style={{ borderColor: '#E5E7EB', color: '#877273' }}
                  >
                    {unmatchLoading ? '…' : 'Unmatch'}
                  </button>
                </div>
                <Link
                  href={`/dashboard/expenses/${drawerData.matchedExpense.id}`}
                  className="flex items-center justify-between p-3 rounded-xl transition hover:opacity-90"
                  style={{ background: '#F0FDF4' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{drawerData.matchedExpense.merchant_name}</p>
                    <p className="text-xs" style={{ color: '#877273' }}>
                      {drawerData.matchedExpense.category} · {drawerData.matchedExpense.expense_date}
                    </p>
                  </div>
                  <p className="text-sm font-bold" style={{ color: '#E94560' }}>
                    {formatCurrency(drawerData.matchedExpense.amount, drawerData.matchedExpense.currency)}
                  </p>
                </Link>
              </div>
            ) : isDebit && drawerData ? (
              <div className="rounded-2xl border p-4" style={{ borderColor: '#E5E7EB' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>Link to Expense</h3>
                  <button
                    onClick={() => setMatchOpen(v => !v)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition"
                    style={{ background: matchOpen ? '#F8F9FA' : '#E94560', color: matchOpen ? '#877273' : '#fff' }}
                  >
                    {matchOpen ? 'Cancel' : 'Match Expense'}
                  </button>
                </div>
                {!matchOpen ? (
                  <p className="text-xs" style={{ color: '#877273' }}>
                    No expense matched yet. Click &quot;Match Expense&quot; to manually link one.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {drawerData.unmatchedExpenses.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: '#877273' }}>No unmatched expenses found</p>
                    ) : drawerData.unmatchedExpenses.map(exp => {
                      const cat = CATEGORY_MAP[exp.category]
                      return (
                        <button
                          key={exp.id}
                          onClick={() => handleMatch(exp.id)}
                          disabled={!!matchLoading}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition hover:border-[#E94560] hover:bg-red-50 disabled:opacity-50"
                          style={{ borderColor: '#E5E7EB' }}
                        >
                          <span className="text-lg">{cat?.icon ?? '📦'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: '#1A1A2E' }}>{exp.merchant_name}</p>
                            <p className="text-xs" style={{ color: '#877273' }}>{formatDateShort(exp.expense_date)}</p>
                          </div>
                          <p className="text-sm font-bold flex-shrink-0" style={{ color: '#E94560' }}>
                            {matchLoading === exp.id ? '…' : formatCurrency(exp.amount, exp.currency)}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {/* Notes */}
            <NotesEditor
              key={selectedTx.id}
              transactionId={selectedTx.id}
              initialNotes={selectedTx.notes}
              containerClassName="rounded-2xl border p-4"
            />

            {/* Raw message */}
            <div className="rounded-2xl border p-4" style={{ borderColor: '#E5E7EB' }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: '#1A1A2E' }}>Raw Message</h3>
              <p className="text-xs font-mono whitespace-pre-wrap p-3 rounded-xl" style={{ background: '#F8F9FA', color: '#877273' }}>
                {selectedTx.raw_message}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
