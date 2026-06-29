'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, getDoc, Timestamp } from 'firebase/firestore'

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
  const [showImportModal, setShowImportModal] = useState(false)
  const [importUploading, setImportUploading] = useState(false)
  const [importStatus, setImportStatus] = useState('')
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

    const tempId = `temp-${Date.now()}`
    messageIdsRef.current.add(tempId)
    setMessages(prev => [...prev, { id: tempId, role: 'user', content: text, message_type: 'text', created_at: new Date().toISOString() }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, user_message: text }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()

      messageIdsRef.current.delete(tempId)
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempId)
        const newMsgs = [...filtered]
        if (data.reply) {
          const aiId = `ai-${Date.now()}`
          messageIdsRef.current.add(aiId)
          newMsgs.push({ id: aiId, role: 'assistant', content: data.reply, message_type: 'text', created_at: new Date().toISOString() })
        }
        if (data.image?.url) {
          const imgId = `img-${Date.now()}`
          messageIdsRef.current.add(imgId)
          newMsgs.push({ id: imgId, role: 'assistant', content: null, message_type: 'image', image_url: data.image.url, created_at: new Date().toISOString() })
        }
        return newMsgs
      })
    } catch (err) {
      console.error('Send failed:', err)
      messageIdsRef.current.delete(tempId)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(text)
      alert('送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  async function handleImportUpload(files: FileList | null) {
    if (!files || files.length === 0 || !personaId) return
    setImportUploading(true)
    setImportStatus('アップロード中...')
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/')
        const formData = new FormData()
        formData.append('file', file)
        formData.append('persona_id', personaId)
        formData.append('source_type', isImage ? 'screenshot' : 'text')
        const endpoint = isImage ? '/api/upload/image' : '/api/upload/text'
        await fetch(endpoint, { method: 'POST', body: formData }).catch(() => {})
        setImportStatus(`✅ ${file.name} 処理済み`)
      }
      // バックグラウンドでペルソナを再生成
      fetch('/api/persona/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, profile: persona }),
      }).catch(() => {})
      setImportStatus('✅ 完了！ペルソナを更新中です（バックグラウンド）')
      setTimeout(() => { setImportStatus(''); setShowImportModal(false) }, 2000)
    } catch {
      setImportStatus('⚠️ 一部エラーがありましたが処理を続けました')
    } finally {
      setImportUploading(false)
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
    modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
    modal: { background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480 },
    uploadZoneSmall: { background: '#f2f2f7', border: '2px dashed #d5d5d9', borderRadius: 12, padding: '28px 20px', textAlign: 'center' as const, cursor: 'pointer', display: 'block', marginTop: 12 },
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
        <button style={s.settingsBtn} onClick={() => setShowImportModal(true)} title="履歴を追加">
          ⚙️
        </button>
      </div>

      {showImportModal && (
        <div style={s.modalOverlay} onClick={() => !importUploading && setShowImportModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: '700' }}>履歴を追加</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8e8e93', padding: 0 }} onClick={() => setShowImportModal(false)} disabled={importUploading}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: '#65676b', margin: '0 0 4px', lineHeight: 1.6 }}>
              LINEや Instagram のスクショを追加すると、ペルソナがより精度よく話せるようになります。
            </p>
            {importStatus && (
              <div style={{ fontSize: 13, color: '#2e7d32', padding: '8px 12px', background: '#f0f9f0', borderRadius: 8, marginBottom: 8, lineHeight: 1.6 }}>
                {importStatus}
              </div>
            )}
            <label style={{ ...s.uploadZoneSmall, opacity: importUploading ? 0.6 : 1 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>📸</div>
              <div style={{ fontSize: 15, fontWeight: '600', color: '#000', marginBottom: 4 }}>スクショ・テキストを選択</div>
              <div style={{ fontSize: 12, color: '#8e8e93' }}>画像 / テキスト (.txt, .csv) / 複数可</div>
              <input
                type="file"
                multiple
                accept=".txt,.csv,image/*"
                style={{ display: 'none' }}
                onChange={e => handleImportUpload(e.target.files)}
                disabled={importUploading}
              />
            </label>
          </div>
        </div>
      )}

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
