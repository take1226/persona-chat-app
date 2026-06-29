import { NextResponse } from 'next/server'

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ''
  const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? ''

  let serviceJsonValid = false
  try {
    const parsed = JSON.parse(serviceJson)
    serviceJsonValid = !!(parsed.project_id && parsed.private_key && parsed.client_email)
  } catch { /* invalid */ }

  return NextResponse.json({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: { set: projectId.length > 0, value: projectId.length > 0 ? projectId : '(empty)' },
    NEXT_PUBLIC_FIREBASE_API_KEY: { set: apiKey.length > 0, prefix: apiKey.length > 0 ? apiKey.substring(0, 6) + '...' : '(empty)' },
    FIREBASE_SERVICE_ACCOUNT_JSON: { set: serviceJson.length > 0, valid: serviceJsonValid },
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: { set: !!(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) },
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: { set: !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) },
  })
}
