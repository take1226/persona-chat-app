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
    // リダイレクトではなくrewrite（URLを変えずにログインページを表示）
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.rewrite(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
