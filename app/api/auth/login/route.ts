import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let password: string | null = null

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await req.json()
    password = body.password
  } else {
    const formData = await req.formData()
    password = formData.get('password') as string
  }

  if (!password || password !== process.env.APP_PASSWORD) {
    // フォーム送信の場合はリダイレクト、JSON(fetch)の場合は401
    if (contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL('/login?error=1', req.url)
    return NextResponse.redirect(url, { status: 302 })
  }

  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  }

  if (contentType.includes('application/json')) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('app_auth', password, cookieOpts)
    return res
  }

  // フォーム送信: cookieをセットしてホームにリダイレクト
  const res = NextResponse.redirect(new URL('/', req.url), { status: 302 })
  res.cookies.set('app_auth', password, cookieOpts)
  return res
}
