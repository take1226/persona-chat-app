import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'トークアプリ',
  description: 'AIペルソナチャット',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'トークアプリ',
  },
}

export const viewport: Viewport = {
  themeColor: '#06c755',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
