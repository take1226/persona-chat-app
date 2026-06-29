'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string | null
  message_type: 'text' | 'image'
  is_auto_message?: boolean
  image_url?: string
  created_at: string
}

type Persona = {
  id: string
  name: string
  auto_message_enabled: boolean
}

export default function ChatPage() {
  const params = useParams()
  const personaId = useMemo(() => {
    const id = params?.id
    return typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null
  }, [params])

  const router = useRouter()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!personaId) { router.push('/'); return }
    getDoc(doc(db, 'personas', personaId)).then(snap => {
      if (!snap.exists()) { router.push('/'); return }
      const d = snap.data() as { name: string; auto_message_enabled: boolean }
      setPersona({ id: snap.id, name: d.name, auto_message_enabled: d.auto_message_enabled })
    }).catch(() => router.push('/'))

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushEnabled(Notification.permission === 'granted')
    }
  }, [personaId, router])

  useEffect(() => {
    if (!personaId) return
    const q = query(collection(db, 'personas', personaId, 'messages'), orderBy('created_at', 'asc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const data = change.doc.data() as {
          role: string; content?: string; message_type?: string;
          is_auto_message?: boolean; image_url?: string; created_at?: Timestamp
        }
        const msg: Message = {
          id: change.doc.id,
          role: data.role as 'user' | 'assistant',
          content: data.content ?? null,
          message_type: (data.message_type ?? 'text') as 'text' | 'image',
          is_auto_message: data.is_auto_message ?? false,
          image_url: data.image_url,
          created_at: data.created_at?.toDate().toISOString() ?? new Date().toISOString(),
        }
        if (messageIdsRef.current.has(msg.id)) return
        messageIdsRef.current.add(msg.id)
        setMessages(prev => [...prev, msg])
      })
    })
    return () => unsubscribe()
  }, [personaId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const enablePush = useCallback(async () => {
    setPushLoading(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('このブラウザはWeb Pushに対応していません。iOS 16.4以降のSafariをご使用ください。')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { alert('通知が許可されませんでした。'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const subJson = sub.toJSON()
      const res = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys, userAgent: navigator.userAgent }),
      })
      if (res.ok) { setPushEnabled(true); alert('通知が有効になりました。') }
    } catch (err) {
      console.error('Push registration failed:', err)
      alert('通知の設定に失敗しました。')
    } finally {
      setPushLoading(false)
    }
  }, [])

  async function handleSend() {
    if (!input.trim() || sending || !personaId) return
    const text = input.trim()
    setInput('')
    setSending(true)

    let savedMsgId: string | null = null
    try {
      // Save user message directly from client → get real Firestore ID immediately
      const ref = await addDoc(
        collection(db, 'personas', personaId, 'messages'),
        { role: 'user', content: text, message_type: 'text', is_auto_message: false, created_at: serverTimestamp() }
      )
      savedMsgId = ref.id
      // Register real ID so onSnapshot skips it (prevents duplicate)
      messageIdsRef.current.add(savedMsgId)
      // Show message immediately with the real Firestore ID
      setMessages(prev => [...prev, { id: savedMsgId!, role: 'user', content: text, message_type: 'text', created_at: new Date().toISOString() }])

      // Call API — AI reply is saved to Firestore by the API, onSnapshot picks it up
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, user_message: text }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
    } catch (err) {
      console.error('Send failed:', err)
      if (savedMsgId) {
        messageIdsRef.current.delete(savedMsgId)
        setMessages(prev => prev.filter(m => m.id !== savedMsgId))
      }
      setInput(text)
      alert('送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  if (!personaId || !persona) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <div style={{ fontSize: 14, color: '#8e8e93' }}>読み込み中...</div>
      </div>
    )
  }

  const initials = persona.name.charAt(0).toUpperCase()
  const s = {
    container: { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    header: { background: '#fff', borderBottom: '1px solid #e5e5ea', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    backBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '4px 6px 4px 0', color: '#00b900', lineHeight: 1 },
    avatar: { width: 40, height: 40, borderRadius: '50%', background: '#00b900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', fontWeight: '600', flexShrink: 0 },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 16, fontWeight: '600', margin: 0, color: '#000' },
    headerStatus: { fontSize: 12, color: '#8e8e93', margin: '2px 0 0' },
    pushBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: '4px 6px', color: '#00b900' },
    messageList: { flex: 1, overflowY: 'auto' as const, padding: '12px 16px', display: 'flex', flexDirection: 'column' as const, gap: 6 },
    rowThem: { display: 'flex', alignItems: 'flex-end', gap: 8 },
    rowMe: { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 4 },
    avatarSmall: { width: 32, height: 32, borderRadius: '50%', background: '#00b900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff', fontWeight: '600', flexShrink: 0 },
    bubbleThem: { background: '#e5e5ea', color: '#000', borderRadius: '4px 16px 16px 16px', padding: '8px 12px', maxWidth: '72%', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word' as const, whiteSpace: 'pre-wrap' as const },
    bubbleMe: { background: '#00b900', color: '#fff', borderRadius: '16px 4px 16px 16px', padding: '8px 12px', maxWidth: '72%', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word' as const, whiteSpace: 'pre-wrap' as const },
    imageBox: { maxWidth: 200, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' },
    ts: { fontSize: 11, color: '#8e8e93', marginTop: 3 },
    inputArea: { background: '#fff', borderTop: '1px solid #e5e5ea', padding: '8px 16px 16px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 },
    textarea: { flex: 1, border: '1px solid #d5d5d9', borderRadius: 20, padding: '8px 14px', fontSize: 15, resize: 'none' as const, outline: 'none', minHeight: 36, maxHeight: 100, lineHeight: 1.5, fontFamily: 'inherit', background: '#fff' },
    sendBtn: { width: 36, height: 36, borderRadius: '50%', background: '#00b900', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '600' },
    settingsBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 6px', color: '#8e8e93', lineHeight: 1 },
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.push('/')}>‹</button>
        <div style={s.avatar}>{initials}</div>
        <div style={s.headerInfo}>
          <p style={s.headerName}>{persona.name}</p>
          <p style={s.headerStatus}>AIペルソナ</p>
        </div>
        <button style={s.pushBtn} onClick={enablePush} disabled={pushEnabled || pushLoading} title={pushEnabled ? '通知オン' : '通知をオンにする'}>
          {pushEnabled ? '🔔' : '🔕'}
        </button>
        <button style={s.settingsBtn} onClick={() => router.push(`/persona/${personaId}/settings`)} title="設定">
          ⚙️
        </button>
      </div>

      <div style={s.messageList}>
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'assistant' ? (
              <div style={s.rowThem}>
                <div style={s.avatarSmall}>{initials}</div>
                <div>
                  {msg.message_type === 'image' && msg.image_url ? (
                    <div style={s.imageBox}><img src={msg.image_url} alt="画像" style={{ width: '100%', display: 'block' }} /></div>
                  ) : (
                    <div style={s.bubbleThem}>{msg.content}</div>
                  )}
                  <p style={s.ts}>{new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ) : (
              <div style={s.rowMe}>
                <p style={{ ...s.ts, marginRight: 0 }}>{new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p>
                <div style={s.bubbleMe}>{msg.content}</div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={s.rowThem}>
            <div style={s.avatarSmall}>{initials}</div>
            <div style={{ ...s.bubbleThem, color: '#8e8e93' }}>入力中…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputArea}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="メッセージを入力..."
          rows={1}
          disabled={sending}
        />
        <button style={{ ...s.sendBtn, opacity: sending || !input.trim() ? 0.5 : 1 }} onClick={handleSend} disabled={sending || !input.trim()}>
          送信
        </button>
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}
