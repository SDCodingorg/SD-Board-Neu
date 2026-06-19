import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const token = await getToken({ req: request })
  const isAuth = !!token
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth')
  const isPublic = request.nextUrl.pathname.startsWith('/share')

  if (isPublic) return NextResponse.next()
  if (isAuthPage) {
    if (isAuth) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }
  if (!isAuth) {
    return NextResponse.redirect(new URL('/auth', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/board/:path*', '/create', '/auth'],
}
