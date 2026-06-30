'use client'

interface Props {
  content: string | null
  imageUrl?: string
  role: 'user' | 'assistant'
  timestamp: string
  avatarNode: React.ReactNode
  showRead?: boolean
}

export default function MessageBubble({ content, imageUrl, role, timestamp, avatarNode, showRead }: Props) {
  const timeStr = new Date(timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {avatarNode}
        {imageUrl ? (
          <div style={{ maxWidth: 200, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
            <img src={imageUrl} alt="画像" style={{ width: '100%', display: 'block' }} />
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', color: '#000', borderRadius: '4px 18px 18px 18px', padding: '8px 12px', maxWidth: '72%', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
            {content}
          </div>
        )}
        <span style={{ fontSize: 11, color: '#fff', flexShrink: 0, marginBottom: 2, opacity: 0.85 }}>{timeStr}</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {showRead && <span style={{ fontSize: 11, color: '#fff', opacity: 0.9 }}>既読</span>}
        <span style={{ fontSize: 11, color: '#fff', opacity: 0.85 }}>{timeStr}</span>
      </div>
      <div style={{ background: '#06C755', color: '#fff', borderRadius: '18px 4px 18px 18px', padding: '8px 12px', maxWidth: '72%', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
        {content}
      </div>
    </div>
  )
}
