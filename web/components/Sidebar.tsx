'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/dashboard',              icon: '🏠', label: 'Home' },
  { href: '/dashboard/expenses',     icon: '🧾', label: 'Expenses' },
  { href: '/dashboard/expenses/new', icon: '📷', label: 'Scan Receipt' },
  { href: '/dashboard/transactions', icon: '🏦', label: 'Transactions' },
  { href: '/dashboard/settings',     icon: '⚙️', label: 'Settings' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 flex flex-col border-r" style={{ background: '#1A1A2E', borderColor: '#2a2a4a' }}>
      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#E94560' }}>
          <span className="text-white font-bold text-lg">خ</span>
        </div>
        <span className="text-white font-bold text-lg tracking-tight">Kharcha</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV.map(({ href, icon, label }) => {
          const active = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: active ? '#E94560' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.65)',
              }}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-6">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          <span className="text-base">🚪</span>
          Sign Out
        </button>
      </div>
    </aside>
  )
}
