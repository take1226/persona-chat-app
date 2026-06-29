import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
  })
}

export const adminDb = () => getFirestore(getAdminApp())
