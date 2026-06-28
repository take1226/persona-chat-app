import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証・静的ファイル・Service Worker は除外
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/login' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/badge')
  ) {
    return NextResponse.next()
  }

  const auth = request.cookies.get('app_auth')?.value
  if (!auth || auth !== process.env.APP_PASSWORD) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
