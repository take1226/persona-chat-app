import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { PLACEHOLDER_CONTENTS } from '@/lib/ai-client'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // CRON_SECRET で保護
  const authHeader = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = adminDb()
  let deleted = 0
  let scannedPersonas = 0

  try {
    const personasSnap = await db.collection('personas').get()
    scannedPersonas = personasSnap.size

    for (const personaDoc of personasSnap.docs) {
      const msgRef = db.collection('personas').doc(personaDoc.id).collection('messages')

      // ① is_placeholder フラグ付きメッセージを削除
      const byFlag = await msgRef.where('is_placeholder', '==', true).get()

      // ② 既知の定型文テキストと一致するメッセージを削除（フラグ未設定の過去分）
      // Firestore の in は 30 件まで対応。PLACEHOLDER_CONTENTS は十分少ない
      const byContent = await msgRef.where('content', 'in', PLACEHOLDER_CONTENTS).get()

      // 重複排除してバッチ削除
      const toDelete = new Map<string, FirebaseFirestore.DocumentReference>()
      for (const d of [...byFlag.docs, ...byContent.docs]) {
        toDelete.set(d.id, d.ref)
      }

      if (toDelete.size === 0) continue

      // Firestore バッチは 500 件制限なので分割
      const refs = [...toDelete.values()]
      for (let i = 0; i < refs.length; i += 499) {
        const batch = db.batch()
        refs.slice(i, i + 499).forEach(ref => batch.delete(ref))
        await batch.commit()
      }

      deleted += toDelete.size
    }

    return NextResponse.json({
      success: true,
      scanned_personas: scannedPersonas,
      deleted_messages: deleted,
    })
  } catch (err) {
    console.error('[clean-placeholder-messages] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
