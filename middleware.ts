import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminApi = pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login';
  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login';

  if (!isAdminApi && !isAdminPage) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const loginUrl = new URL('/admin/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
