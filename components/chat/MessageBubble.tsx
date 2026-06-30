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
        <div>
          {imageUrl ? (
            <div style={{ maxWidth: 200, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
              <img src={imageUrl} alt="画像" style={{ width: '100%', display: 'block' }} />
            </div>
          ) : (
            <div style={{ background: '#e5e5ea', color: '#000', borderRadius: '4px 16px 16px 16px', padding: '8px 12px', maxWidth: '72%', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {content}
            </div>
          )}
          <p style={{ fontSize: 11, color: '#8e8e93', marginTop: 3 }}>{timeStr}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {showRead && <span style={{ fontSize: 11, color: '#06c755' }}>既読</span>}
        <p style={{ fontSize: 11, color: '#8e8e93' }}>{timeStr}</p>
      </div>
      <div style={{ background: '#06c755', color: '#fff', borderRadius: '16px 4px 16px 16px', padding: '8px 12px', maxWidth: '72%', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
        {content}
      </div>
    </div>
  )
}
