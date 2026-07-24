'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F9FA' }}>
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-md w-full text-center" style={{ borderColor: '#E5E7EB' }}>
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1A1A2E' }}>Check your email</h2>
          <p className="text-sm" style={{ color: '#877273' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="inline-block mt-6 text-sm font-medium" style={{ color: '#E94560' }}>
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F9FA' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: '#E94560' }}>
            <span className="text-white text-2xl font-bold">خ</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>Create your account</h1>
          <p className="text-sm mt-1" style={{ color: '#877273' }}>Start tracking expenses for free</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: '#E5E7EB' }}>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A1A2E' }}>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ali Ahmed"
                required
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition focus:border-[#E94560]"
                style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A1A2E' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition focus:border-[#E94560]"
                style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A1A2E' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
                required
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition focus:border-[#E94560]"
                style={{ borderColor: '#E5E7EB', background: '#F8F9FA' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: '#E94560' }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
            <span className="text-xs" style={{ color: '#877273' }}>or</span>
            <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
          </div>

          <button
            onClick={handleGoogle}
            className="w-full py-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition hover:bg-gray-50"
            style={{ borderColor: '#E5E7EB', color: '#1A1A2E' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-sm mt-6" style={{ color: '#877273' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-medium" style={{ color: '#E94560' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
