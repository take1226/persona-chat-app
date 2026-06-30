import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import { reactToImage } from '@/lib/ai-client'
import { validatePersonaCard } from '@/lib/persona/card'
import { buildSystemPrompt } from '@/lib/chat/buildSystemPrompt'

export const maxDuration = 60

const FALLBACK_REACTION = 'えっ、これ何！？もっと教えて〜'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const personaId = form.get('persona_id') as string | null
    const caption = (form.get('caption') as string | null) ?? ''

    if (!file || !personaId) {
      return NextResponse.json({ error: 'file and persona_id required' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    // Vercel Blob にアップロード
    const blob = await put(`chat/${personaId}/${Date.now()}-${file.name}`, buffer, {
      access: 'public',
      contentType: file.type,
    })

    const db = adminDb()

    // ユーザーの画像メッセージを Firestore に保存
    const userRef = await db.collection('personas').doc(personaId).collection('messages').add({
      role: 'user',
      content: null,
      message_type: 'image',
      image_url: blob.url,
      is_auto_message: false,
      created_at: Timestamp.now(),
    })

    // ペルソナ情報を取得
    const personaDoc = await db.collection('personas').doc(personaId).get()
    const personaData = personaDoc.data() ?? {}
    const card = validatePersonaCard(personaData.card ?? personaData.raw_analysis)
    const systemPrompt = buildSystemPrompt(card, personaData.name ?? '')

    // 画像リアクション生成（25秒タイムアウト）
    let reactionText = ''
    try {
      const raw = await Promise.race([
        reactToImage(systemPrompt, base64, file.type, caption),
        new Promise<string>(resolve => setTimeout(() => resolve(''), 25000)),
      ])
      reactionText = raw || FALLBACK_REACTION
    } catch {
      reactionText = FALLBACK_REACTION
    }

    // AI 返信を Firestore に保存
    const replyRef = await db.collection('personas').doc(personaId).collection('messages').add({
      role: 'assistant',
      content: reactionText,
      message_type: 'text',
      is_auto_message: false,
      created_at: Timestamp.now(),
    })

    db.collection('personas').doc(personaId).update({ updated_at: Timestamp.now() }).catch(() => {})

    return NextResponse.json({
      success: true,
      userMsgId: userRef.id,
      userImageUrl: blob.url,
      replyId: replyRef.id,
      replyText: reactionText,
    })
  } catch (err) {
    console.error('[chat-image] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
