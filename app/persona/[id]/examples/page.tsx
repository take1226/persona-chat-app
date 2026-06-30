'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  orderBy, query, getDoc, Timestamp,
} from 'firebase/firestore'

type TurnPair = {
  id: string
  user: string
  persona: string
  source: 'manual' | 'pasted_text'
}

export default function ExamplesPage() {
  const params = useParams()
  const personaId = useMemo(() => {
    const id = params?.id
    return typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null
  }, [params])
  const router = useRouter()

  const [personaName, setPersonaName] = useState('')
  const [pairs, setPairs] = useState<TurnPair[]>([])
  const [userInput, setUserInput] = useState('')
  const [personaInput, setPersonaInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')

  useEffect(() => {
    if (!personaId) { router.push('/'); return }
    getDoc(doc(db, 'personas', personaId)).then(snap => {
      if (!snap.exists()) { router.push('/'); return }
      setPersonaName((snap.data().name as string) ?? '')
    })
  }, [personaId, router])

  useEffect(() => {
    if (!personaId) return
    const q = query(
      collection(db, 'personas', personaId, 'turn_examples'),
      orderBy('created_at', 'asc'),
    )
    return onSnapshot(q, snap => {
      setPairs(snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<TurnPair, 'id'>),
      })))
    })
  }, [personaId])

  async function addPair() {
    if (!personaId || !userInput.trim() || !personaInput.trim()) return
    setAdding(true)
    try {
      await addDoc(collection(db, 'personas', personaId, 'turn_examples'), {
        user: userInput.trim(),
        persona: personaInput.trim(),
        source: 'manual' as const,
        created_at: Timestamp.now(),
      })
      setUserInput('')
      setPersonaInput('')
    } finally {
      setAdding(false)
    }
  }

  async function removePair(id: string) {
    if (!personaId) return
    await deleteDoc(doc(db, 'personas', personaId, 'turn_examples', id))
  }

  async function runImport() {
    if (!personaId || !pasteText.trim()) return
    setImporting(true)
    setImportStatus('')
    try {
      const res = await fetch('/api/persona/import-text-pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: personaId, raw_text: pasteText }),
      })
      const data = await res.json() as { importedCount?: number; error?: string }
      if (res.ok) {
        setImportStatus(`✅ ${data.importedCount ?? 0}件のペアを取り込みました`)
        setPasteText('')
      } else {
        setImportStatus(`❌ ${data.error ?? 'エラーが発生しました'}`)
      }
    } catch {
      setImportStatus('❌ ネットワークエラー')
    } finally {
      setImporting(false)
      setTimeout(() => setImportStatus(''), 4000)
    }
  }

  const s = {
    page: { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: '#f2f2f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    header: { background: '#fff', borderBottom: '1px solid #e5e5ea', padding: 'calc(env(safe-area-inset-top) + 10px) 16px 10px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
    backBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#06C755', lineHeight: 1, padding: '4px 6px 4px 0' },
    headerTitle: { fontSize: 17, fontWeight: '600' as const, margin: 0, flex: 1 },
    badge: { padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: '600' as const },
    container: { flex: 1, overflowY: 'auto' as const, WebkitOverflowScrolling: 'touch' as const, maxWidth: 480, margin: '0 auto', padding: '16px', boxSizing: 'border-box' as const, width: '100%' },
    section: { background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 12 },
    sectionTitle: { fontSize: 13, fontWeight: '600' as const, color: '#8e8e93', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
    label: { fontSize: 13, color: '#8e8e93', marginBottom: 4, display: 'block' },
    textarea: { width: '100%', padding: '10px 12px', border: '1px solid #e5e5ea', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, fontFamily: 'inherit', background: '#fff', marginBottom: 10, minHeight: 72, resize: 'vertical' as const },
    addBtn: { width: '100%', padding: '12px', background: '#06C755', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: '600' as const, cursor: 'pointer' },
    importBtn: { width: '100%', padding: '12px', background: '#007aff', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: '600' as const, cursor: 'pointer' },
    pairCard: { background: '#f9f9fb', borderRadius: 8, padding: '10px 12px', marginBottom: 8, borderLeft: '3px solid #06C755', position: 'relative' as const },
    deleteBtn: { position: 'absolute' as const, top: 8, right: 8, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#c7c7cc', padding: '0 2px', lineHeight: 1 },
    hint: { fontSize: 13, color: '#8e8e93', lineHeight: 1.6, margin: '0 0 12px' },
    statusMsg: { fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 8 },
  }

  const displayName = personaName || 'ペルソナ'
  const enough = pairs.length >= 10

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.back()}>‹</button>
        <h1 style={s.headerTitle}>会話例の管理</h1>
        <span style={{
          ...s.badge,
          background: enough ? '#e8f5e9' : '#fff3e0',
          color: enough ? '#2e7d32' : '#e65100',
        }}>
          {pairs.length}件{!enough && ' / 10件以上推奨'}
        </span>
      </div>

      <div style={s.container}>
        {/* Hint banner */}
        <div style={{ ...s.section, background: '#fffbe6', borderLeft: '3px solid #f59e0b', padding: '12px 16px' }}>
          <p style={{ ...s.hint, margin: 0 }}>
            会話例を多く登録するほど{displayName}さんらしい返答が得られます。<strong>10件以上</strong>を目安に追加してください。
            登録後は設定画面の「人物特性を再分析」を実行すると反映されます。
          </p>
        </div>

        {/* Manual pair input */}
        <div style={s.section}>
          <div style={s.sectionTitle}>ペアを追加</div>
          <label style={s.label}>あなたが送った内容</label>
          <textarea
            style={s.textarea}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder="例: 最近どう？"
          />
          <label style={s.label}>{displayName}さんの返答</label>
          <textarea
            style={s.textarea}
            value={personaInput}
            onChange={e => setPersonaInput(e.target.value)}
            placeholder="例: まあまあかな〜 今日仕事つらかった😭"
          />
          <button
            style={{ ...s.addBtn, opacity: (adding || !userInput.trim() || !personaInput.trim()) ? 0.5 : 1 }}
            onClick={addPair}
            disabled={adding || !userInput.trim() || !personaInput.trim()}
          >
            {adding ? '追加中...' : '+ 追加'}
          </button>
        </div>

        {/* Saved pairs list */}
        {pairs.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>登録済み — {pairs.length}件</div>
            {pairs.map(pair => (
              <div key={pair.id} style={s.pairCard}>
                <button style={s.deleteBtn} onClick={() => removePair(pair.id)} title="削除">×</button>
                <div style={{ fontSize: 11, color: '#8e8e93', marginBottom: 3 }}>あなた</div>
                <div style={{ fontSize: 14, color: '#333', marginBottom: 8, whiteSpace: 'pre-wrap', paddingRight: 28 }}>
                  {pair.user}
                </div>
                <div style={{ fontSize: 11, color: '#06C755', marginBottom: 3 }}>{displayName}</div>
                <div style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap', paddingRight: 28 }}>
                  {pair.persona}
                </div>
                {pair.source === 'pasted_text' && (
                  <div style={{ fontSize: 10, color: '#c7c7cc', marginTop: 4 }}>貼り付けから自動抽出</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Paste import */}
        <div style={s.section}>
          <div style={s.sectionTitle}>まとめて貼り付け</div>
          <p style={s.hint}>
            LINEの「トーク履歴をバックアップ」などでエクスポートしたテキストをそのまま貼り付けてください。
            「{displayName}: 〇〇」「{displayName}　〇〇」（タブ区切り）などの行を自動でペアに分割して取り込みます。
          </p>
          {importStatus && (
            <div style={{
              ...s.statusMsg,
              background: importStatus.startsWith('✅') ? '#f0f9f0' : '#ffebee',
              color: importStatus.startsWith('✅') ? '#2e7d32' : '#d32f2f',
            }}>
              {importStatus}
            </div>
          )}
          <textarea
            style={{ ...s.textarea, minHeight: 140 }}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`例（LINEエクスポート形式）:\n21:13\t${displayName}\tそれいいね！\n21:14\tあなた\tでしょ〜\n21:15\t${displayName}\tほんとほんと笑`}
          />
          <button
            style={{ ...s.importBtn, opacity: (importing || !pasteText.trim()) ? 0.5 : 1 }}
            onClick={runImport}
            disabled={importing || !pasteText.trim()}
          >
            {importing ? '取り込み中...' : '変換して取り込む'}
          </button>
        </div>
      </div>
    </div>
  )
}
