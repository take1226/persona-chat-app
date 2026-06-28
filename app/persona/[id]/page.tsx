'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

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
  // バグ修正1: useParamsを安全に取得
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
  // バグ修正2: Set<string>で重複チェック（単一IDではなく全IDを管理）
  const messageIdsRef = useRef<Set<string>>(new Set())
  // バグ修正2: チャネル参照を保持してクリーンアップ
  const channelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null)

  useEffect(() => {
    if (!personaId) {
      router.push('/')
      return
    }
    loadPersona()
    loadMessages()
    checkPushStatus()
  }, [personaId])

  // バグ修正2: Realtimeリスナーの重複登録を防ぐ
  useEffect(() => {
    if (!personaId) return

    // 既存チャネルをクリーンアップ
    if (channelRef.current) {
      supabaseClient.removeChannel(channelRef.current)
    }

    const channel = supabaseClient
      .channel(`messages:${personaId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `persona_id=eq.${personaId}`,
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string
            role: string
            content: string | null
            message_type: string
            is_auto_message: boolean
            image_id: string | null
            created_at: string
          }

          // バグ修正2: Setで重複チェック
          if (messageIdsRef.current.has(newMsg.id)) return
          messageIdsRef.current.add(newMsg.id)

          let image_url: string | undefined
          if (newMsg.message_type === 'image' && newMsg.image_id) {
            try {
              const { data: img } = await supabaseClient
                .from('persona_images')
                .select('public_url')
                .eq('id', newMsg.image_id)
                .single()
              image_url = img?.public_url
            } catch (err) {
              console.error('Failed to fetch image URL:', err)
            }
          }

          const msg: Message = {
            id: newMsg.id,
            role: newMsg.role as 'user' | 'assistant',
            content: newMsg.content,
            message_type: newMsg.message_type as 'text' | 'image',
            is_auto_message: newMsg.is_auto_message,
            image_url,
            created_at: newMsg.created_at,
          }

          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            // バグ修正3: 楽観的UIメッセージ（temp-/ai-/img-）と重複したら置き換えない
            return [...prev, msg]
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabaseClient.removeChannel(channel)
      channelRef.current = null
    }
  }, [personaId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadPersona() {
    if (!personaId) return
    try {
      const { data, error } = await supabaseClient
        .from('personas')
        .select('id, name, auto_message_enabled')
        .eq('id', personaId)
        .single()
      if (error || !data) throw error
      setPersona(data)
    } catch (err) {
      console.error('Failed to load persona:', err)
      router.push('/')
    }
  }

  async function loadMessages() {
    if (!personaId) return
    try {
      const { data: msgs, error } = await supabaseClient
        .from('messages')
        .select('id, role, content, message_type, is_auto_message, image_id, created_at')
        .eq('persona_id', personaId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (error) throw error

      // バグ修正4: 画像URLを事前取得してから表示
      const enriched: Message[] = await Promise.all((msgs ?? []).map(async (m) => {
        messageIdsRef.current.add(m.id)
        if (m.message_type === 'image' && m.image_id) {
          try {
            const { data: img } = await supabaseClient
              .from('persona_images')
              .select('public_url')
              .eq('id', m.image_id)
              .single()
            return { ...m, image_url: img?.public_url ?? undefined }
          } catch {
            return { ...m }
          }
        }
        return { ...m }
      }))

      setMessages(enriched)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  function checkPushStatus() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setPushEnabled(Notification.permission === 'granted')
  }

  const enablePush = useCallback(async () => {
    setPushLoading(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('このブラウザはWeb Pushに対応していません。\niOS 16.4以降のSafariを使用してください。')
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('通知が許可されませんでした。設定アプリから許可してください。')
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      const subJson = sub.toJSON()
      const res = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
        }),
      })

      if (res.ok) {
        setPushEnabled(true)
        alert(`通知を有効にしました！\n${persona?.name}さんからメッセージが届くと通知されます。`)
      }
    } catch (e) {
      console.error('Push registration failed:', e)
      alert('通知の設定に失敗しました。')
    } finally {
      setPushLoading(false)
    }
  }, [persona])

  async function handleSend() {
    if (!input.trim() || sending || !personaId) return
    const text = input.trim()
    setInput('')
    setSending(true)

    // バグ修正3: 楽観的メッセージをIDで管理
    const tempId = `temp-${Date.now()}`
    messageIdsRef.current.add(tempId)
    const tempMsg: Message = {
      id: tempId,
      role: 'user',
      content: text,
      message_type: 'text',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, user_message: text }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()

      // バグ修正3: 楽観的メッセージを削除してAI応答を表示
      // （Realtimeで届いたDBのメッセージと重複しないようSet管理）
      messageIdsRef.current.delete(tempId)
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempId)
        const newMsgs = [...filtered]

        if (data.reply) {
          const aiId = `ai-${Date.now()}`
          messageIdsRef.current.add(aiId)
          newMsgs.push({
            id: aiId,
            role: 'assistant',
            content: data.reply,
            message_type: 'text',
            created_at: new Date().toISOString(),
          })
        }

        if (data.image?.url) {
          const imgId = `img-${Date.now()}`
          messageIdsRef.current.add(imgId)
          newMsgs.push({
            id: imgId,
            role: 'assistant',
            content: null,
            message_type: 'image',
            image_url: data.image.url,
            created_at: new Date().toISOString(),
          })
        }

        return newMsgs
      })
    } catch (err) {
      console.error('Send failed:', err)
      // 楽観的メッセージを元に戻す
      messageIdsRef.current.delete(tempId)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(text)
      alert(`送信に失敗しました。もう一度試してください。`)
    } finally {
      setSending(false)
    }
  }

  if (!personaId || !persona) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: 'system-ui', color: '#999' }}>
        <div style={{ fontSize: 14 }}>読み込み中...</div>
      </div>
    )
  }

  const initials = persona.name.charAt(0).toUpperCase()

  const s = {
    container: { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: '#b2dfdb', fontFamily: 'system-ui, sans-serif' },
    header: { background: '#06c755', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
    backBtn: { background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: '0 6px 0 0', lineHeight: 1 },
    avatarCircle: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', fontWeight: 600 },
    headerInfo: { flex: 1 },
    headerName: { color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 },
    headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: 0 },
    bellBtn: {
      background: pushEnabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
      border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
      color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 10px',
      cursor: pushLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap' as const,
    },
    messageList: { flex: 1, overflowY: 'auto' as const, padding: '16px 12px', display: 'flex', flexDirection: 'column' as const, gap: 10 },
    bubbleWrapThem: { display: 'flex', alignItems: 'flex-end', gap: 6 },
    bubbleWrapMe: { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6 },
    bubbleThem: { background: '#fff', borderRadius: '4px 16px 16px 16px', padding: '8px 12px', maxWidth: '70%', fontSize: 14, lineHeight: 1.6, boxShadow: '0 1px 2px rgba(0,0,0,0.08)', whiteSpace: 'pre-wrap' as const },
    bubbleMe: { background: '#06c755', borderRadius: '16px 4px 16px 16px', padding: '8px 12px', maxWidth: '70%', fontSize: 14, lineHeight: 1.6, color: '#fff', whiteSpace: 'pre-wrap' as const },
    imageMsg: { maxWidth: 200, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
    timestamp: { fontSize: 11, color: 'rgba(0,0,0,0.38)', marginTop: 2, marginBottom: 0 },
    avatarSmall: { width: 32, height: 32, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 600, flexShrink: 0 },
    autoLabel: { fontSize: 10, color: 'rgba(0,0,0,0.35)', margin: '0 0 2px' },
    inputArea: { background: '#fff', borderTop: '0.5px solid #ddd', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 },
    textarea: { flex: 1, border: '1px solid #ddd', borderRadius: 20, padding: '8px 14px', fontSize: 15, resize: 'none' as const, outline: 'none', minHeight: 38, maxHeight: 120, lineHeight: 1.5, fontFamily: 'system-ui' },
    sendBtn: { width: 40, height: 40, borderRadius: '50%', background: sending ? '#ccc' : '#06c755', border: 'none', color: '#fff', fontSize: 18, cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.push('/')} aria-label="戻る">‹</button>
        <div style={s.avatarCircle}>{initials}</div>
        <div style={s.headerInfo}>
          <p style={s.headerName}>{persona.name}</p>
          <p style={s.headerSub}>AIペルソナ</p>
        </div>
        <button
          style={s.bellBtn}
          onClick={enablePush}
          disabled={pushEnabled || pushLoading}
          aria-label={pushEnabled ? '通知オン' : '通知を有効にする'}
        >
          {pushEnabled ? '🔔 通知ON' : pushLoading ? '...' : '🔕 通知OFF'}
        </button>
      </div>

      <div style={s.messageList}>
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'assistant' ? (
              <div style={s.bubbleWrapThem}>
                <div style={s.avatarSmall}>{initials}</div>
                <div>
                  {msg.is_auto_message && <p style={s.autoLabel}>（自発メッセージ）</p>}
                  {msg.message_type === 'image' && msg.image_url ? (
                    <div style={s.imageMsg}>
                      <img src={msg.image_url} alt="送られてきた画像" style={{ width: '100%', display: 'block' }} />
                    </div>
                  ) : (
                    <div style={s.bubbleThem}>{msg.content}</div>
                  )}
                  <p style={s.timestamp}>
                    {new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ) : (
              <div style={s.bubbleWrapMe}>
                <p style={s.timestamp}>
                  {new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div style={s.bubbleMe}>{msg.content}</div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={s.bubbleWrapThem}>
            <div style={s.avatarSmall}>{initials}</div>
            <div style={{ ...s.bubbleThem, color: '#aaa' }}>入力中…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputArea}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="メッセージを入力..."
          rows={1}
        />
        <button style={s.sendBtn} onClick={handleSend} disabled={sending || !input.trim()} aria-label="送信">
          ➤
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
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
