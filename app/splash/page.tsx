'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SplashPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/'), 2500)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      background: '#00b900',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ fontSize: 72, marginBottom: 20 }}>💬</div>
      <div style={{ fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 6 }}>Echo</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>AIペルソナチャット</div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        div { animation: fadeIn 0.6s ease; }
      `}</style>
    </div>
  )
}
