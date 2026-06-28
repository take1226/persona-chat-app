'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

type Persona = {
  id: string
  name: string
  profile: { relationship?: string }
  auto_message_enabled: boolean
}

export default function HomePage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadPersonas()
  }, [])

  async function loadPersonas() {
    try {
      const { data, error } = await supabaseClient
        .from('personas')
        .select('id, name, profile, auto_message_enabled')
        .order('created_at', { ascending: false })
      if (error) throw error
      setPersonas(data ?? [])
    } catch (err) {
      console.error('Failed to load personas:', err)
    } finally {
      setLoading(false)
    }
  }

  const s = {
    page: { fontFamily: 'system-ui', background: '#f5f5f5', minHeight: '100dvh', display: 'flex', flexDirection: 'column' as const },
    header: { background: '#06c755', color: '#fff', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    title: { fontSize: 18, fontWeight: 700, margin: 0 },
    addBtn: { background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, padding: '6px 14px', cursor: 'pointer' },
    item: { background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
    avatar: { width: 48, height: 48, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', fontWeight: 700, flexShrink: 0 },
    name: { fontSize: 16, fontWeight: 600, margin: '0 0 2px' },
    sub: { fontSize: 13, color: '#888', margin: 0 },
    badge: { marginLeft: 'auto', fontSize: 10, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 10 },
    empty: { textAlign: 'center' as const, padding: '80px 20px', color: '#999', flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' },
  }

  if (loading) {
    return (
      <div style={{ ...s.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: '#666' }}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>トーク</h1>
        <button style={s.addBtn} onClick={() => router.push('/persona/new')}>+ 追加</button>
      </div>
      {personas.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <p style={{ margin: '0 0 16px', fontSize: 14 }}>ペルソナがまだいません</p>
          <button
            onClick={() => router.push('/persona/new')}
            style={{ background: '#06c755', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 15, cursor: 'pointer' }}
          >
            最初のペルソナを追加
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {personas.map(p => (
            <div
              key={p.id}
              style={s.item}
              onClick={() => router.push(`/persona/${p.id}`)}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f9')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <div style={s.avatar}>{p.name.charAt(0)}</div>
              <div>
                <p style={s.name}>{p.name}</p>
                <p style={s.sub}>{p.profile?.relationship ?? 'ペルソナ'}</p>
              </div>
              {p.auto_message_enabled && <span style={s.badge}>自動ON</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
