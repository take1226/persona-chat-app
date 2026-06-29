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

type MessagePreview = Persona & {
  lastMessage?: string
  lastMessageTime?: string
}

export default function HomePage() {
  const [personas, setPersonas] = useState<MessagePreview[]>([])
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
        .order('updated_at', { ascending: false })

      if (error) throw error

      const withMessages = await Promise.all((data ?? []).map(async (p) => {
        const { data: msgs } = await supabaseClient
          .from('messages')
          .select('content, created_at, message_type')
          .eq('persona_id', p.id)
          .order('created_at', { ascending: false })
          .limit(1)

        const lastMsg = msgs?.[0]
        let preview = ''
        if (lastMsg) {
          preview = lastMsg.message_type === 'image' ? '[画像]' : (lastMsg.content ?? '').substring(0, 30)
        }

        const timeStr = lastMsg?.created_at
          ? new Date(lastMsg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
          : ''

        return { ...p, lastMessage: preview, lastMessageTime: timeStr }
      }))

      setPersonas(withMessages)
    } catch (err) {
      console.error('Failed to load personas:', err)
    } finally {
      setLoading(false)
    }
  }

  const s = {
    page: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100dvh',
      background: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    },
    header: {
      background: '#fff',
      padding: '12px 16px',
      borderBottom: '1px solid #e5e5ea',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      margin: 0,
      color: '#000',
    },
    addBtn: {
      background: 'none',
      border: 'none',
      fontSize: 24,
      cursor: 'pointer',
      padding: '4px 8px',
      color: '#00b900',
    },
    list: {
      flex: 1,
      overflowY: 'auto' as const,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 16px',
      borderBottom: '1px solid #e5e5ea',
      cursor: 'pointer',
      background: '#fff',
      transition: 'background 0.1s',
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: '#00b900',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
      color: '#fff',
      fontWeight: '600',
      flexShrink: 0,
      marginRight: 12,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 16,
      fontWeight: '500',
      margin: '0 0 3px 0',
      color: '#000',
    },
    preview: {
      fontSize: 13,
      color: '#8e8e93',
      margin: 0,
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    time: {
      fontSize: 12,
      color: '#8e8e93',
      flexShrink: 0,
      marginLeft: 8,
    },
    empty: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      textAlign: 'center' as const,
      color: '#8e8e93',
    },
  }

  if (loading) {
    return (
      <div style={{ ...s.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: '#8e8e93' }}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>チャット</h1>
        <button style={s.addBtn} onClick={() => router.push('/persona/new')} title="新規追加">✎</button>
      </div>

      {personas.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>トークがまだありません</div>
          <button
            onClick={() => router.push('/persona/new')}
            style={{ background: '#00b900', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 28px', fontSize: 15, fontWeight: '600', cursor: 'pointer' }}
          >
            + ペルソナを追加
          </button>
        </div>
      ) : (
        <div style={s.list}>
          {personas.map(p => (
            <div
              key={p.id}
              style={s.item}
              onClick={() => router.push(`/persona/${p.id}`)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f2f2f7' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}
            >
              <div style={s.avatar}>{p.name.charAt(0)}</div>
              <div style={s.content}>
                <p style={s.name}>{p.name}</p>
                <p style={s.preview}>{p.lastMessage || 'トークを開始'}</p>
              </div>
              {p.lastMessageTime && <div style={s.time}>{p.lastMessageTime}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
