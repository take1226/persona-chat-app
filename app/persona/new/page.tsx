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
    if (error || !data) { alert('作成失敗: ' + error?.message); return }
    setPersonaId(data.id)
    setStep('upload')
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || !personaId) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('persona_id', personaId)
      if (isImage) {
        formData.append('source_type', 'screenshot')
        setStatusMsg(`OCR処理中: ${file.name}`)
        await fetch('/api/upload/image', { method: 'POST', body: formData })
      } else {
        formData.append('source_type', 'text')
        setStatusMsg(`テキスト処理中: ${file.name}`)
        await fetch('/api/upload/text', { method: 'POST', body: formData })
      }
      setUploadCount(c => c + 1)
    }
    setUploading(false)
    setStatusMsg('')
  }

  async function generatePersona() {
    if (!personaId) return
    setGenerating(true)
    setStatusMsg('履歴を解析中...')
    const res = await fetch('/api/persona/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_id: personaId, profile }),
    })
    if (res.ok) {
      setStep('done')
    } else {
      alert('生成に失敗しました。')
    }
    setGenerating(false)
    setStatusMsg('')
  }

  const steps = ['プロフィール', '履歴アップロード', 'AI解析', '完了']
  const stepIndex = { profile: 0, upload: 1, generate: 2, done: 3 }[step]

  const c = { maxWidth: 480, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui' }
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const }
  const btn = { background: '#06c755', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 15, cursor: 'pointer', width: '100%', fontWeight: 600 as const }
  const btnGhost = { ...btn, background: '#fff', color: '#06c755', border: '1.5px solid #06c755' }

  return (
    <div style={c}>
      {/* ステップインジケーター */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: 'center' as const }}>
            <div style={{
              height: 4, borderRadius: 2, background: i <= stepIndex ? '#06c755' : '#ddd', marginBottom: 4,
            }} />
            <span style={{ fontSize: 10, color: i <= stepIndex ? '#06c755' : '#aaa' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* ステップ1: プロフィール */}
      {step === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>基本情報を入力</h2>
          {[
            { key: 'name', label: '名前 *' },
            { key: 'age', label: '年齢' },
            { key: 'job', label: '職業' },
            { key: 'relationship', label: '関係性（例: 友達・彼女・同僚）' },
            { key: 'hobbies', label: '趣味・特徴' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input
                style={inp}
                value={(profile as Record<string, string>)[f.key]}
                onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.label.replace(' *', '')}
              />
            </div>
          ))}
          <button style={btn} onClick={createPersona} disabled={!profile.name}>
            次へ →
          </button>
        </div>
      )}

      {/* ステップ2: アップロード */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>トーク履歴をアップロード</h2>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            LINEやインスタのトーク履歴を読み込みます。<br />
            スクリーンショット（画像）もテキストファイルも対応しています。
          </p>
          <div style={{ background: '#f9f9f9', border: '2px dashed #ddd', borderRadius: 12, padding: '28px 20px', textAlign: 'center' as const }}>
            <label style={{ cursor: 'pointer', display: 'block' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>タップしてファイルを選択</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>テキスト(.txt) または 画像（スクショ）対応 / 複数可</div>
              <input
                type="file"
                multiple
                accept=".txt,.csv,image/*"
                style={{ display: 'none' }}
                onChange={e => handleFileUpload(e.target.files)}
              />
            </label>
          </div>
          {uploading && <p style={{ fontSize: 13, color: '#06c755', margin: 0 }}>⏳ {statusMsg}</p>}
          {uploadCount > 0 && <p style={{ fontSize: 14, margin: 0, color: '#333' }}>✅ {uploadCount} ファイル処理済み</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            {uploadCount > 0 && (
              <button style={btn} onClick={() => setStep('generate')}>次へ →</button>
            )}
            <button style={btnGhost} onClick={() => setStep('generate')}>スキップ</button>
          </div>
        </div>
      )}

      {/* ステップ3: AI解析 */}
      {step === 'generate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>AIがペルソナを生成</h2>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            アップロードした履歴をもとに、{profile.name}さんの話し方・口癖・性格を学習します。
          </p>
          <button style={btn} onClick={generatePersona} disabled={generating}>
            {generating ? '解析中...' : '生成する'}
          </button>
          {statusMsg && <p style={{ fontSize: 13, color: '#06c755', margin: 0 }}>{statusMsg}</p>}
        </div>
      )}

      {/* ステップ4: 完了 */}
      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' as const }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>ペルソナ生成完了！</h2>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            {profile.name}さんとのチャットを始められます。<br />
            チャット画面で「通知ON」ボタンを押すと、{profile.name}さんから自動でメッセージが届くようになります。
          </p>
          <button style={btn} onClick={() => router.push(`/persona/${personaId}`)}>
            チャットを始める →
          </button>
        </div>
      )}
    </div>
  )
}
