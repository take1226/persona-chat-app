'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore'

type BehaviorPreset = 'friendly' | 'formal' | 'joking' | 'serious' | 'custom'

const PRESETS: Record<Exclude<BehaviorPreset, 'custom'>, { label: string; prompt: string }> = {
  friendly: { label: 'フレンドリー（親友のように）', prompt: 'あなたはフレンドリーで親しみやすく、時には冗談も交えながら自然な会話をしてください。' },
  formal:   { label: 'フォーマル（敬意を示す）',   prompt: 'あなたは相手に敬意を示しながら、丁寧で落ち着いた口調で会話してください。' },
  joking:   { label: 'ユーモア（冗談を交える）',   prompt: 'あなたはユーモアと冗談好きで、楽しく会話を盛り上げるキャラクターです。' },
  serious:  { label: 'シリアス（知的で真剣）',     prompt: 'あなたは真剣で知識豊富、いつも論理的で深い思考をする人物です。' },
}

export default function PersonaSettingsPage() {
  const params = useParams()
  const personaId = useMemo(() => {
    const id = params?.id
    return typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null
  }, [params])
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [importStatus, setImportStatus] = useState('')
  const [importing, setImporting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    relationship: '',
    gender: '',
    remarks: '',
    behavior_preset: 'friendly' as BehaviorPreset,
    behavior_prompt: '',
  })

  useEffect(() => {
    if (!personaId) { router.push('/'); return }
    getDoc(doc(db, 'personas', personaId)).then(snap => {
      if (!snap.exists()) { router.push('/'); return }
      const d = snap.data() as {
        name: string
        nickname?: string
        avatar_url?: string
        profile?: { relationship?: string; gender?: string; remarks?: string }
        behavior_preset?: BehaviorPreset
        behavior_prompt?: string
      }
      setAvatarPreview(d.avatar_url ?? '')
      setForm({
        name: d.name ?? '',
        nickname: d.nickname ?? '',
        relationship: d.profile?.relationship ?? '',
        gender: d.profile?.gender ?? '',
        remarks: d.profile?.remarks ?? '',
        behavior_preset: d.behavior_preset ?? 'friendly',
        behavior_prompt: d.behavior_prompt ?? '',
      })
    }).catch(() => router.push('/')).finally(() => setLoading(false))
  }, [personaId, router])

  async function save() {
    if (!personaId) return
    setSaving(true)
    setStatusMsg('')
    try {
      let avatarUrl = avatarPreview
      if (avatarFile) {
        const fd = new FormData()
        fd.append('file', avatarFile)
        fd.append('persona_id', personaId)
        const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd })
        if (res.ok) {
          const j = await res.json()
          avatarUrl = j.public_url
          setAvatarPreview(avatarUrl)
        }
      }

      const behaviorPrompt = form.behavior_preset === 'custom'
        ? form.behavior_prompt
        : PRESETS[form.behavior_preset].prompt

      await updateDoc(doc(db, 'personas', personaId), {
        name: form.name,
        nickname: form.nickname,
        avatar_url: avatarUrl || null,
        profile: { relationship: form.relationship, gender: form.gender, remarks: form.remarks },
        behavior_preset: form.behavior_preset,
        behavior_prompt: behaviorPrompt,
        updated_at: Timestamp.now(),
      })
      setStatusMsg('✅ 保存しました')
      setTimeout(() => router.push(`/persona/${personaId}`), 800)
    } catch (err) {
      console.error('Save error:', err)
      setStatusMsg('❌ 保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleImportUpload(files: FileList | null) {
    if (!files || files.length === 0 || !personaId) return
    setImporting(true)
    setImportStatus('アップロード中...')
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/')
        const fd = new FormData()
        fd.append('file', file)
        fd.append('persona_id', personaId)
        fd.append('source_type', isImage ? 'screenshot' : 'text')
        await fetch(isImage ? '/api/upload/image' : '/api/upload/text', { method: 'POST', body: fd }).catch(() => {})
        setImportStatus(`✅ ${file.name} 処理済み`)
      }
      setImportStatus('🧠 人物特性を分析中...')
      const analysisRes = await fetch('/api/persona/analyze-personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId }),
      }).catch(() => null)
      setImportStatus(analysisRes?.ok ? '✅ ペルソナカードを更新しました！' : '✅ アップロード完了（分析は後で「再分析」ボタンから）')
      setTimeout(() => setImportStatus(''), 3000)
    } catch {
      setImportStatus('⚠️ 一部エラーがありましたが処理を続けました')
    } finally {
      setImporting(false)
    }
  }

  async function reanalyzePersonality() {
    if (!personaId) return
    setAnalyzing(true)
    setImportStatus('🧠 人物特性を分析中...')
    try {
      const res = await fetch('/api/persona/analyze-personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId }),
      })
      if (res.ok) {
        setImportStatus('✅ 人物分析を更新しました！')
      } else {
        const data = await res.json()
        setImportStatus(`⚠️ ${data.message ?? '分析に失敗しました'}`)
      }
    } catch {
      setImportStatus('⚠️ エラーが発生しました')
    } finally {
      setAnalyzing(false)
      setTimeout(() => setImportStatus(''), 3000)
    }
  }

  async function handleDelete() {
    if (!personaId || !confirm('このペルソナを削除しますか？\nすべてのメッセージも削除されます。')) return
    try {
      await fetch(`/api/persona/${personaId}/delete`, { method: 'DELETE' })
      router.push('/')
    } catch {
      alert('削除に失敗しました')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <div style={{ fontSize: 14, color: '#8e8e93' }}>読み込み中...</div>
      </div>
    )
  }

  const s = {
    page: { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: '#f2f2f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    header: { background: '#fff', borderBottom: '1px solid #e5e5ea', padding: 'calc(env(safe-area-inset-top) + 10px) 16px 10px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    backBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#06C755', lineHeight: 1, padding: '4px 6px 4px 0' },
    headerTitle: { fontSize: 17, fontWeight: '600', margin: 0, flex: 1 },
    container: { flex: 1, overflowY: 'auto' as const, WebkitOverflowScrolling: 'touch' as const, maxWidth: 480, margin: '0 auto', padding: '16px', boxSizing: 'border-box' as const, width: '100%' },
    section: { background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 12 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: '#8e8e93', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 },
    label: { fontSize: 13, color: '#8e8e93', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #e5e5ea', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, fontFamily: 'inherit', background: '#fff', marginBottom: 10 },
    select: { width: '100%', padding: '10px 12px', border: '1px solid #e5e5ea', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, fontFamily: 'inherit', background: '#fff', marginBottom: 10, appearance: 'auto' as const },
    textarea: { width: '100%', padding: '10px 12px', border: '1px solid #e5e5ea', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, fontFamily: 'inherit', background: '#fff', marginBottom: 10, minHeight: 80, resize: 'vertical' as const },
    avatarArea: { display: 'flex', alignItems: 'center', gap: 16 },
    avatarCircle: { width: 72, height: 72, borderRadius: '50%', background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff', fontWeight: '600', flexShrink: 0, overflow: 'hidden' },
    avatarChangeBtn: { background: '#f2f2f7', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer', color: '#000' },
    uploadZone: { background: '#f2f2f7', border: '2px dashed #d5d5d9', borderRadius: 12, padding: '24px 20px', textAlign: 'center' as const, cursor: 'pointer', display: 'block', marginTop: 4 },
    saveBtn: { width: '100%', padding: '14px', background: '#06C755', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: '700', cursor: 'pointer', marginBottom: 10 },
    deleteBtn: { width: '100%', padding: '14px', background: '#ffebee', color: '#d32f2f', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: '600', cursor: 'pointer' },
    msg: { fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 12, lineHeight: 1.6 },
  }

  const initials = form.name.charAt(0).toUpperCase() || '?'

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.back()}>‹</button>
        <h1 style={s.headerTitle}>ペルソナ設定</h1>
      </div>

      <div style={s.container}>
        {statusMsg && (
          <div style={{ ...s.msg, background: statusMsg.startsWith('✅') ? '#f0f9f0' : '#ffebee', color: statusMsg.startsWith('✅') ? '#2e7d32' : '#d32f2f' }}>
            {statusMsg}
          </div>
        )}

        {/* プロフィール画像 */}
        <div style={s.section}>
          <div style={s.sectionTitle}>プロフィール画像</div>
          <div style={s.avatarArea}>
            <div style={s.avatarCircle}>
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials
              }
            </div>
            <label style={{ cursor: 'pointer' }}>
              <span style={s.avatarChangeBtn}>📷 画像を変更</span>
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setAvatarFile(file)
                  const reader = new FileReader()
                  reader.onload = ev => setAvatarPreview(ev.target?.result as string)
                  reader.readAsDataURL(file)
                }}
              />
            </label>
          </div>
        </div>

        {/* 基本情報 */}
        <div style={s.section}>
          <div style={s.sectionTitle}>基本情報</div>
          <label style={s.label}>名前</label>
          <input style={s.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: 田中太郎" />
          <label style={s.label}>あだ名（トーク画面に表示）</label>
          <input style={s.input} value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="例: ゆうくん、ボス、推し（省略可）" />
          <label style={s.label}>関係性</label>
          <input style={s.input} value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} placeholder="例: 友達 / 彼女 / 同僚" />
          <label style={s.label}>性別</label>
          <select style={s.select} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
            <option value="">選択しない</option>
            <option value="男">男</option>
            <option value="女">女</option>
            <option value="その他">その他</option>
          </select>
          <label style={s.label}>備考</label>
          <textarea style={s.textarea} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="その他の特徴（省略可）" />
        </div>

        {/* 振る舞い */}
        <div style={s.section}>
          <div style={s.sectionTitle}>どう振る舞うか</div>
          <label style={s.label}>プリセット</label>
          <select style={s.select} value={form.behavior_preset} onChange={e => setForm(f => ({ ...f, behavior_preset: e.target.value as BehaviorPreset }))}>
            {(Object.entries(PRESETS) as [BehaviorPreset, { label: string }][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
            <option value="custom">カスタム</option>
          </select>
          {form.behavior_preset === 'custom' && (
            <>
              <label style={s.label}>カスタムプロンプト</label>
              <textarea style={{ ...s.textarea, minHeight: 100 }} value={form.behavior_prompt}
                onChange={e => setForm(f => ({ ...f, behavior_prompt: e.target.value }))}
                placeholder="どう振る舞ってほしいか詳しく書いてください" />
            </>
          )}
          {form.behavior_preset !== 'custom' && (
            <div style={{ fontSize: 12, color: '#8e8e93', lineHeight: 1.5, padding: '6px 0' }}>
              {PRESETS[form.behavior_preset].prompt}
            </div>
          )}
        </div>

        {/* 履歴を追加 */}
        <div style={s.section}>
          <div style={s.sectionTitle}>履歴を追加</div>
          <p style={{ fontSize: 13, color: '#8e8e93', margin: '0 0 8px', lineHeight: 1.6 }}>
            LINEや Instagram のスクショを追加すると、よりリアルな返答ができるようになります。
          </p>
          {importStatus && (
            <div style={{ ...s.msg, background: '#f0f9f0', color: '#2e7d32', marginBottom: 8 }}>{importStatus}</div>
          )}
          <label style={{ ...s.uploadZone, opacity: importing ? 0.6 : 1 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📸</div>
            <div style={{ fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 2 }}>スクショ・テキストを選択</div>
            <div style={{ fontSize: 11, color: '#8e8e93' }}>画像 / .txt / .csv / 複数可</div>
            <input type="file" multiple accept=".txt,.csv,image/*" style={{ display: 'none' }}
              onChange={e => handleImportUpload(e.target.files)} disabled={importing} />
          </label>
          <button
            style={{ width: '100%', padding: '10px', background: '#007aff', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: '600', cursor: 'pointer', marginTop: 10, opacity: analyzing ? 0.6 : 1 }}
            onClick={reanalyzePersonality}
            disabled={analyzing}
          >
            {analyzing ? '分析中...' : '🧠 人物特性を再分析'}
          </button>
        </div>

        {/* 保存 */}
        <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>

        {/* 削除 */}
        <button style={s.deleteBtn} onClick={handleDelete}>
          🗑 このペルソナを削除
        </button>
      </div>
    </div>
  )
}
