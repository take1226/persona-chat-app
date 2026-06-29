import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { endpoint, keys, userAgent } = body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
  }

  const db = adminDb()
  const existing = await db.collection('push_subscriptions').where('endpoint', '==', endpoint).limit(1).get()
  const now = Timestamp.now()

  if (!existing.empty) {
    await existing.docs[0].ref.update({ p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent ?? '', updated_at: now })
  } else {
    await db.collection('push_subscriptions').add({
      endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent ?? '',
      created_at: now, updated_at: now,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json()
  const db = adminDb()
  const existing = await db.collection('push_subscriptions').where('endpoint', '==', endpoint).limit(1).get()
  if (!existing.empty) await existing.docs[0].ref.delete()
  return NextResponse.json({ ok: true })
}
