'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 'profile' | 'upload' | 'generate' | 'done'

export default function NewPersonaPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('profile')
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [profile, setProfile] = useState({ name: '', relationship: '', gender: '', remarks: '' })
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')

  async function createPersona() {
    setError('')
    if (!profile.name.trim()) {
      setError('名前を入力してください')
      return
    }
    try {
      const res = await fetch('/api/persona/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(`❌ エラー: ${data.error ?? 'Failed to create persona'}`)
        return
      }
      if (!data.persona_id) {
        setError('❌ ペルソナIDが取得できませんでした')
        return
      }
      setPersonaId(data.persona_id)
      setStep('upload')
    } catch (err) {
      console.error('Error creating persona:', err)
      setError(`❌ 予期しないエラー: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !personaId) return
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/')
        const formData = new FormData()
        formData.append('file', file)
        formData.append('persona_id', personaId)
        formData.append('source_type', isImage ? 'screenshot' : 'text')
        setStatusMsg(isImage ? `OCR処理中: ${file.name}` : `テキスト処理中: ${file.name}`)

        const endpoint = isImage ? '/api/upload/image' : '/api/upload/text'
        const res = await fetch(endpoint, { method: 'POST', body: formData })
        if (!res.ok) throw new Error(`Upload failed: ${file.name}`)
        setUploadCount(c => c + 1)
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(`❌ アップロード失敗: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
      setStatusMsg('')
    }
  }

  async function generatePersona() {
    if (!personaId) return
    setGenerating(true)
    setError('')
    setStatusMsg('履歴を解析中...')
    try {
      const res = await fetch('/api/persona/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, profile }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? 'Generation failed')
      }
      setStep('done')
    } catch (err) {
      console.error('Generation error:', err)
      setError(`❌ 生成失敗: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setGenerating(false)
      setStatusMsg('')
    }
  }

  const stepIndex = { profile: 0, upload: 1, generate: 2, done: 3 }[step]

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
    btn: { padding: '12px', background: '#00b900', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: '600', cursor: 'pointer', width: '100%' },
    btnGhost: { padding: '12px', background: '#fff', color: '#00b900', border: '1px solid #00b900', borderRadius: 10, fontSize: 16, fontWeight: '600', cursor: 'pointer', width: '100%' },
    uploadZone: { background: '#fff', border: '2px dashed #d5d5d9', borderRadius: 12, padding: '40px 20px', textAlign: 'center' as const, cursor: 'pointer', display: 'block' },
    msg: { fontSize: 13, color: '#2e7d32', margin: '8px 0 0', padding: '8px 12px', background: '#f0f9f0', borderRadius: 8, lineHeight: 1.6 },
    errMsg: { fontSize: 13, color: '#d32f2f', padding: '8px 12px', background: '#ffebee', borderRadius: 8, marginBottom: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const },
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        {step !== 'done' && (
          <div style={s.stepBar}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ ...s.stepLine, background: i <= stepIndex ? '#00b900' : '#e5e5ea' }} />
            ))}
          </div>
        )}

        {error && <div style={s.errMsg}>{error}</div>}

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
            <h2 style={s.title}>トーク履歴をアップロード</h2>
            <p style={{ fontSize: 14, color: '#65676b', lineHeight: 1.6, marginBottom: 16 }}>
              LINEやInstagramのトーク履歴をスクリーンショット（画像）またはテキストファイルでアップロードしてください。
            </p>
            <label style={s.uploadZone}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 15, fontWeight: '600', color: '#000', marginBottom: 4 }}>ファイルを選択</div>
              <div style={{ fontSize: 12, color: '#8e8e93' }}>画像 (.png, .jpg) / テキスト (.txt, .csv) / 複数可</div>
              <input
                type="file"
                multiple
                accept=".txt,.csv,image/*"
                style={{ display: 'none' }}
                onChange={e => handleFileUpload(e.target.files)}
                disabled={uploading}
              />
            </label>
            {statusMsg && <p style={s.msg}>⏳ {statusMsg}</p>}
            {uploadCount > 0 && <p style={s.msg}>✅ {uploadCount} ファイル処理済み</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {uploadCount > 0 && (
                <button style={s.btn} onClick={() => setStep('generate')}>次へ →</button>
              )}
              <button style={s.btnGhost} onClick={() => setStep('generate')}>スキップ</button>
            </div>
          </>
        )}

        {step === 'generate' && (
          <>
            <h2 style={s.title}>AIがペルソナを生成</h2>
            <p style={{ fontSize: 14, color: '#65676b', lineHeight: 1.6, marginBottom: 20 }}>
              {uploadCount > 0
                ? `${uploadCount}個のファイルを解析して、${profile.name}さんの話し方を学習します。`
                : `${profile.name}さんのペルソナを生成します。`}
            </p>
            <button
              style={{ ...s.btn, opacity: generating ? 0.6 : 1 }}
              onClick={generatePersona}
              disabled={generating}
            >
              {generating ? '解析中...' : '生成する'}
            </button>
            {statusMsg && <p style={s.msg}>{statusMsg}</p>}
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
            <h2 style={{ ...s.title, textAlign: 'center', marginTop: 0 }}>ペルソナ生成完了！</h2>
            <p style={{ fontSize: 14, color: '#65676b', marginBottom: 28, lineHeight: 1.6 }}>
              {profile.name}さんとのチャットを開始できます。
            </p>
            <button style={s.btn} onClick={() => router.push(`/persona/${personaId}`)}>
              チャットを始める →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
