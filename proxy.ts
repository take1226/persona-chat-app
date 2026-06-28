import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証不要なパスをスキップ
  if (
    pathname.startsWith('/api/auth') ||
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
    return NextResponse.redirect(loginUrl, { status: 302 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
