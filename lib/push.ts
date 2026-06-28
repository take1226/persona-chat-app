import webpush from 'web-push'
import { createServerClient } from './supabase'

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
  const supabase = createServerClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (!subs || subs.length === 0) return

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  )

  // 失敗したサブスクリプション（410 Gone = 登録解除済み）を削除
  const toDelete: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err?.statusCode === 410) {
        toDelete.push(subs[i].id)
      }
    }
  })

  if (toDelete.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', toDelete)
  }
}
