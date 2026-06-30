'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 'profile' | 'upload'

export default function NewPersonaPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('profile')
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [profile, setProfile] = useState({ name: '', relationship: '', gender: '', remarks: '' })
  const [uploading, setUploading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')

  async function createPersona() {
    setError('')
    if (!profile.name.trim()) { setError('名前を入力してください'); return }
    try {
      const res = await fetch('/api/persona/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
      const data = await res.json()
      if (!res.ok) { setError(`❌ ${data.error ?? 'Failed to create persona'}`); return }
      if (!data.persona_id) { setError('❌ ペルソナIDが取得できませんでした'); return }
      setPersonaId(data.persona_id)
      setStep('upload')
    } catch (err) {
      setError(`❌ 予期しないエラー: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0 || !personaId) return
    setUploading(true)
    setError('')

    // スクショをアップロード（失敗しても続行）
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/')
        const endpoint = isImage ? '/api/upload/image' : '/api/upload/text'
        const formData = new FormData()
        formData.append('file', file)
        formData.append('persona_id', personaId)
        formData.append('source_type', isImage ? 'screenshot' : 'text')
        setStatusMsg(`📸 処理中: ${file.name}`)
        await fetch(endpoint, { method: 'POST', body: formData }).catch(e => console.warn('upload warn:', e))
      }
    } catch { /* ignore */ }

    // 人物特性を多次元分析（失敗しても続行）
    setStatusMsg('🧠 人物特性を分析中...')
    try {
      const analysisRes = await fetch('/api/persona/analyze-personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId }),
      })
      if (analysisRes.ok) {
        setStatusMsg('✅ ペルソナの特性を学習しました！チャット画面へ移動します...')
      } else {
        setStatusMsg('✅ 準備完了！チャット画面へ移動します...')
      }
    } catch {
      setStatusMsg('✅ 準備完了！チャット画面へ移動します...')
    }

    setUploading(false)
    setTimeout(() => router.push(`/persona/${personaId}`), 800)
  }

  async function skipToChat() {
    if (!personaId) return
    router.push(`/persona/${personaId}`)
  }

  const stepIndex = step === 'profile' ? 0 : 1

  const s = {
    page: { minHeight: '100dvh', background: '#f2f2f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    container: { maxWidth: 480, margin: '0 auto', padding: '24px 16px' },
    stepBar: { display: 'flex', gap: 8, marginBottom: 28 },
    stepLine: { flex: 1, height: 3, borderRadius: 2 },
    title: { fontSize: 28, fontWeight: '700', margin: '0 0 20px', color: '#000' },
    form: { display: 'flex', flexDirection: 'column' as const, gap: 14 },
    label: { fontSize: 14, fontWeight: '500', color: '#000', marginBottom: 4, display: 'block' },
    input: { padding: '12px 14px', border: '1px solid #d5d5d9', borderRadius: 10, fontSize: 16, boxSizing: 'border-box' as const, fontFamily: 'inherit', width: '100%', background: '#fff' },
    textarea: { padding: '12px 14px', border: '1px solid #d5d5d9', borderRadius: 10, fontSize: 16, boxSizing: 'border-box' as const, fontFamily: 'inherit', width: '100%', background: '#fff', minHeight: 80, resize: 'vertical' as const },
    radioGroup: { display: 'flex', gap: 20 },
    radioLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, cursor: 'pointer' },
    btn: { padding: '12px', background: '#06C755', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: '600', cursor: 'pointer', width: '100%' },
    btnGhost: { padding: '12px', background: '#fff', color: '#06C755', border: '1px solid #06C755', borderRadius: 10, fontSize: 16, fontWeight: '600', cursor: 'pointer', width: '100%' },
    uploadZone: { background: '#fff', border: '2px dashed #d5d5d9', borderRadius: 12, padding: '40px 20px', textAlign: 'center' as const, cursor: 'pointer', display: 'block' },
    msg: { fontSize: 13, color: '#2e7d32', padding: '8px 12px', background: '#f0f9f0', borderRadius: 8, marginBottom: 12, lineHeight: 1.6 },
    errMsg: { fontSize: 13, color: '#d32f2f', padding: '8px 12px', background: '#ffebee', borderRadius: 8, marginBottom: 12, lineHeight: 1.6 },
  }

  return (
    <div style={s.page}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e5ea', padding: 'calc(env(safe-area-inset-top) + 10px) 16px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#06C755', lineHeight: 1, padding: '4px 6px 4px 0' }} onClick={() => router.back()}>‹</button>
        <span style={{ fontSize: 17, fontWeight: '600' }}>ペルソナを追加</span>
      </div>
      <div style={s.container}>
        <div style={s.stepBar}>
          {[0, 1].map(i => (
            <div key={i} style={{ ...s.stepLine, background: i <= stepIndex ? '#06C755' : '#e5e5ea' }} />
          ))}
        </div>

        {error && <div style={s.errMsg}>{error}</div>}
        {statusMsg && <div style={s.msg}>{statusMsg}</div>}

        {step === 'profile' && (
          <>
            <h2 style={s.title}>基本情報</h2>
            <div style={s.form}>
              <div>
                <label style={s.label}>名前 *</label>
                <input
                  style={s.input}
                  value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  placeholder="例: 田中太郎"
                />
              </div>
              <div>
                <label style={s.label}>関係性</label>
                <input
                  style={s.input}
                  value={profile.relationship}
                  onChange={e => setProfile(p => ({ ...p, relationship: e.target.value }))}
                  placeholder="例: 友達 / 彼女 / 同僚"
                />
              </div>
              <div>
                <label style={s.label}>性別</label>
                <div style={s.radioGroup}>
                  {['男', '女', 'その他'].map(opt => (
                    <label key={opt} style={s.radioLabel}>
                      <input
                        type="radio"
                        name="gender"
                        value={opt}
                        checked={profile.gender === opt}
                        onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={s.label}>備考</label>
                <textarea
                  style={s.textarea}
                  value={profile.remarks}
                  onChange={e => setProfile(p => ({ ...p, remarks: e.target.value }))}
                  placeholder="その他の特徴や情報（省略可）"
                />
              </div>
              <button
                style={{ ...s.btn, opacity: profile.name ? 1 : 0.5, cursor: profile.name ? 'pointer' : 'not-allowed' }}
                onClick={createPersona}
                disabled={!profile.name}
              >
                次へ →
              </button>
            </div>
          </>
        )}

        {step === 'upload' && (
          <>
            <h2 style={s.title}>スクショをアップロード</h2>
            <p style={{ fontSize: 14, color: '#65676b', lineHeight: 1.6, marginBottom: 16 }}>
              LINE や Instagram のトーク画面のスクショを選択してください。
              <br />
              <strong>1枚でも OK。すぐに話し始めることができます。</strong>
            </p>
            <label style={{ ...s.uploadZone, opacity: uploading ? 0.6 : 1 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: 15, fontWeight: '600', color: '#000', marginBottom: 4 }}>
                スクショ・テキストを選択
              </div>
              <div style={{ fontSize: 12, color: '#8e8e93' }}>
                画像 (.png, .jpg) / テキスト (.txt, .csv) / 複数可
              </div>
              <input
                type="file"
                multiple
                accept=".txt,.csv,image/*"
                style={{ display: 'none' }}
                onChange={e => handleFileUpload(e.target.files)}
                disabled={uploading}
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button style={{ ...s.btnGhost, opacity: uploading ? 0.5 : 1 }} onClick={skipToChat} disabled={uploading}>
                スキップしてチャット開始 →
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#8e8e93', marginTop: 16, lineHeight: 1.6 }}>
              💡 スクショなしでもすぐに話せます。後からチャット画面で追加できます。
            </p>
          </>
        )}
      </div>
    </div>
  )
}
