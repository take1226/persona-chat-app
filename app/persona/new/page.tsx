'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'

type Step = 'profile' | 'upload' | 'generate' | 'done'

export default function NewPersonaPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('profile')
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [profile, setProfile] = useState({ name: '', age: '', job: '', relationship: '', hobbies: '' })
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')

  async function createPersona() {
    if (!profile.name) return
    try {
      const { data, error } = await supabaseClient
        .from('personas')
        .insert({
          name: profile.name,
          profile,
          auto_message_enabled: true,
          auto_message_interval_min: 5,
          auto_message_interval_max: 30,
        })
        .select()
        .single()
      if (error || !data) throw error
      setPersonaId(data.id)
      setStep('upload')
    } catch (err) {
      alert(`作成失敗: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !personaId) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/')
        const formData = new FormData()
        formData.append('file', file)
        formData.append('persona_id', personaId)

        if (isImage) {
          formData.append('source_type', 'screenshot')
          setStatusMsg(`OCR処理中: ${file.name}`)
        } else {
          formData.append('source_type', 'text')
          setStatusMsg(`テキスト処理中: ${file.name}`)
        }

        const endpoint = isImage ? '/api/upload/image' : '/api/upload/text'
        const res = await fetch(endpoint, { method: 'POST', body: formData })
        if (!res.ok) throw new Error(`Upload failed: ${file.name}`)
        setUploadCount(c => c + 1)
      }
    } catch (err) {
      alert(`アップロード失敗: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
      setStatusMsg('')
    }
  }

  async function generatePersona() {
    if (!personaId) return
    setGenerating(true)
    setStatusMsg('履歴を解析中...')
    try {
      const res = await fetch('/api/persona/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, profile }),
      })
      if (!res.ok) throw new Error('Generation failed')
      setStep('done')
    } catch (err) {
      alert(`生成失敗: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
    form: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
    label: { fontSize: 14, fontWeight: '500', color: '#000', marginBottom: 4, display: 'block' },
    input: { padding: '12px 14px', border: '1px solid #d5d5d9', borderRadius: 10, fontSize: 16, boxSizing: 'border-box' as const, fontFamily: 'inherit', width: '100%', background: '#fff' },
    btn: { padding: '12px', background: '#00b900', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: '600', cursor: 'pointer', width: '100%' },
    btnGhost: { padding: '12px', background: '#fff', color: '#00b900', border: '1px solid #00b900', borderRadius: 10, fontSize: 16, fontWeight: '600', cursor: 'pointer', width: '100%' },
    uploadZone: { background: '#fff', border: '2px dashed #d5d5d9', borderRadius: 12, padding: '40px 20px', textAlign: 'center' as const, cursor: 'pointer', display: 'block' },
    msg: { fontSize: 13, color: '#00b900', margin: '8px 0 0' },
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

        {step === 'profile' && (
          <>
            <h2 style={s.title}>基本情報</h2>
            <div style={s.form}>
              {[
                { key: 'name', label: '名前 *', placeholder: '例: 田中太郎' },
                { key: 'age', label: '年齢', placeholder: '例: 25' },
                { key: 'job', label: '職業', placeholder: '例: エンジニア' },
                { key: 'relationship', label: '関係性', placeholder: '例: 友達 / 彼女 / 同僚' },
                { key: 'hobbies', label: '趣味・特徴', placeholder: '例: ゲーム好き、カフェ巡り' },
              ].map(f => (
                <div key={f.key}>
                  <label style={s.label}>{f.label}</label>
                  <input
                    style={s.input}
                    value={(profile as Record<string, string>)[f.key]}
                    onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
              <button
                style={{ ...s.btn, opacity: profile.name ? 1 : 0.5 }}
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
            {uploading && <p style={s.msg}>⏳ {statusMsg}</p>}
            {uploadCount > 0 && <p style={{ ...s.msg, color: '#000' }}>✅ {uploadCount} ファイル処理済み</p>}
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
