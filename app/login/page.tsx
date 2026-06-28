'use client'
import { useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!password) return
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      window.location.replace('/')
    } else {
      setError('パスワードが違います')
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', background: '#f0f0f0',
      fontFamily: 'system-ui, sans-serif', gap: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '32px 28px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', minWidth: 280,
        display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>💬</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          {process.env.NEXT_PUBLIC_APP_NAME || 'トークアプリ'}
        </h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="パスワード"
          style={{
            width: '100%', padding: '10px 14px', border: '1px solid #ddd',
            borderRadius: 10, fontSize: 16, boxSizing: 'border-box' as const,
          }}
          autoFocus
        />
        {error && <p style={{ color: '#e53e3e', fontSize: 13, margin: 0 }}>{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading || !password}
          style={{
            width: '100%', padding: '11px', background: loading ? '#ccc' : '#06c755',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </div>
    </div>
  )
}
