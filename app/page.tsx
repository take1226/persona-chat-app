'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, onSnapshot, limit, Timestamp } from 'firebase/firestore'

type Persona = {
  id: string
  name: string
  avatar_url?: string
  profile: { relationship?: string }
  auto_message_enabled: boolean
  lastMessage?: string
  lastMessageTime?: string
}

export default function HomePage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const q = query(collection(db, 'personas'), orderBy('updated_at', 'desc'))
    const unsubscribe = onSnapshot(q, async (snap) => {
      try {
        const withMessages = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data() as {
            name: string
            avatar_url?: string
            profile: { relationship?: string }
            auto_message_enabled: boolean
          }
          const msgSnap = await getDocs(
            query(collection(db, 'personas', d.id, 'messages'), orderBy('created_at', 'desc'), limit(1))
          )
          const lastDoc = msgSnap.docs[0]
          const lastData = lastDoc?.data() as { content?: string; message_type?: string; created_at?: Timestamp } | undefined
          const preview = lastData?.message_type === 'image' ? '[画像]' : (lastData?.content ?? '').substring(0, 30)
          const timeStr = lastData?.created_at
            ? lastData.created_at.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            : ''
          return { id: d.id, ...data, lastMessage: preview, lastMessageTime: timeStr }
        }))
        setPersonas(withMessages)
      } catch (err) {
        console.error('Failed to load personas:', err)
      } finally {
        setLoading(false)
      }
    }, (err) => {
      console.error('Personas snapshot error:', err)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  async function deletePersona(personaId: string) {
    if (!confirm('このペルソナを削除しますか？')) return
    try {
      await fetch(`/api/persona/${personaId}/delete`, { method: 'DELETE' })
      setMenuOpen(null)
    } catch {
      alert('削除に失敗しました')
    }
  }

  const s = {
    page: { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    header: { background: '#fff', padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px', borderBottom: '1px solid #e5e5ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    title: { fontSize: 32, fontWeight: '700', margin: 0, color: '#000' },
    headerActions: { display: 'flex', gap: 4 },
    iconBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '4px 8px', color: '#06c755' },
    list: { flex: 1, overflowY: 'auto' as const },
    item: { display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #e5e5ea', cursor: 'pointer', background: '#fff', transition: 'background-color 0.15s' },
    avatar: { width: 54, height: 54, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', fontWeight: '600', flexShrink: 0, marginRight: 12, overflow: 'hidden' },
    content: { flex: 1, minWidth: 0 },
    name: { fontSize: 16, fontWeight: '500', margin: '0 0 3px 0', color: '#000' },
    preview: { fontSize: 13, color: '#8e8e93', margin: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
    time: { fontSize: 12, color: '#8e8e93', flexShrink: 0, marginLeft: 8 },
    menuBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#c0c0c0', padding: '4px 6px', flexShrink: 0 },
    menuPanel: { background: '#f9f9f9', borderBottom: '1px solid #e5e5ea', padding: '8px 12px', display: 'flex', gap: 8 },
    menuActionBtn: { flex: 1, padding: '9px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: '600', cursor: 'pointer' },
    empty: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' as const, color: '#8e8e93' },
  }

  if (loading) {
    return (
      <div style={{ ...s.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: '#8e8e93' }}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={s.page} onClick={() => menuOpen && setMenuOpen(null)}>
      <div style={s.header}>
        <h1 style={s.title}>チャット</h1>
        <div style={s.headerActions}>
          <button style={s.iconBtn} title="検索" onClick={() => alert('検索機能は近日対応予定です')}>🔍</button>
          <button style={s.iconBtn} onClick={() => router.push('/persona/new')} title="新規追加">✎</button>
        </div>
      </div>

      {personas.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>トークがまだありません</div>
          <button onClick={() => router.push('/persona/new')} style={{ background: '#00b900', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 28px', fontSize: 15, fontWeight: '600', cursor: 'pointer' }}>
            + ペルソナを追加
          </button>
        </div>
      ) : (
        <div style={s.list}>
          {personas.map(p => (
            <div key={p.id}>
              <div
                style={s.item}
                onClick={() => { if (menuOpen === p.id) { setMenuOpen(null); return } router.push(`/persona/${p.id}`) }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9f9f9' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}
              >
                <div style={s.avatar}>
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : p.name.charAt(0)
                  }
                </div>
                <div style={s.content}>
                  <p style={s.name}>{p.name}</p>
                  <p style={s.preview}>{p.lastMessage || 'トークを開始'}</p>
                </div>
                {p.lastMessageTime && <div style={s.time}>{p.lastMessageTime}</div>}
                <button
                  style={s.menuBtn}
                  onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id) }}
                >
                  ⋮
                </button>
              </div>

              {menuOpen === p.id && (
                <div style={s.menuPanel} onClick={e => e.stopPropagation()}>
                  <button style={{ ...s.menuActionBtn, background: '#f2f2f7', color: '#000' }}
                    onClick={() => { router.push(`/persona/${p.id}/settings`); setMenuOpen(null) }}>
                    ✏️ 編集
                  </button>
                  <button style={{ ...s.menuActionBtn, background: '#ffebee', color: '#d32f2f' }}
                    onClick={() => deletePersona(p.id)}>
                    🗑 削除
                  </button>
                  <button style={{ ...s.menuActionBtn, background: '#fff', color: '#8e8e93', border: '1px solid #e5e5ea' }}
                    onClick={() => setMenuOpen(null)}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
