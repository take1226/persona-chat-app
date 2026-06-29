import webpush from 'web-push'
import { adminDb } from './firebase-admin'

let _vapidSet = false

function ensureVapid() {
  if (!_vapidSet) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
    _vapidSet = true
  }
}

export type PushPayload = {
  title: string
  body: string
  persona_id: string
  url: string
  icon?: string
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  ensureVapid()
  const snap = await adminDb().collection('push_subscriptions').get()
  if (snap.empty) return

  const subs = snap.docs.map(d => ({ id: d.id, ...d.data() as { endpoint: string; p256dh: string; auth: string } }))

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  )

  const toDelete: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err?.statusCode === 410) toDelete.push(subs[i].id)
    }
  })

  await Promise.all(toDelete.map(id => adminDb().collection('push_subscriptions').doc(id).delete()))
}
