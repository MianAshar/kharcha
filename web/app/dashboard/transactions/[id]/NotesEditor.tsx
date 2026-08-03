'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function NotesEditor({
  transactionId,
  initialNotes,
  containerClassName = 'bg-white rounded-2xl shadow-sm border p-5 mb-4',
}: {
  transactionId: string
  initialNotes: string | null
  containerClassName?: string
}) {
  const supabase = createClient()
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saved, setSaved] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = notes !== saved

  async function handleSave() {
    if (!dirty) return
    setSaving(true)
    setError(null)
    const trimmed = notes.trim()
    const { error } = await supabase
      .from('bank_transactions')
      .update({ notes: trimmed || null })
      .eq('id', transactionId)
    if (error) {
      setError(error.message)
    } else {
      setNotes(trimmed)
      setSaved(trimmed)
    }
    setSaving(false)
  }

  return (
    <div className={containerClassName} style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>Notes</h2>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-40"
          style={{ background: '#E94560', color: '#fff' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add a note..."
        rows={3}
        className="w-full text-sm rounded-xl p-3 outline-none resize-none"
        style={{ background: '#F8F9FA', color: '#1A1A2E' }}
      />
      {error && (
        <p className="text-xs mt-1.5" style={{ color: '#E94560' }}>Failed to save: {error}</p>
      )}
    </div>
  )
}
