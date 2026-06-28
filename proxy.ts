import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/login' ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/badge') ||
    pathname.startsWith('/apple')
  ) {
    return NextResponse.next()
  }

  const auth = request.cookies.get('app_auth')?.value
  if (!auth || auth !== process.env.APP_PASSWORD) {
    const loginUrl = new URL('/login', request.url)
    const res = NextResponse.redirect(loginUrl, { status: 302 })
    // CDNにキャッシュさせない
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return res
  }

  const res = NextResponse.next()
  // 認証済みページもCDNにキャッシュさせない（cookieの有無で内容が変わるため）
  res.headers.set('Cache-Control', 'no-store, private')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
