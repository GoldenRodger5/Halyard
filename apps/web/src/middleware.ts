import { NextResponse, type NextRequest } from 'next/server';

/**
 * The layout needs the pathname to mark the active nav item, and a server
 * component cannot read it. Passing it through as a header is the supported
 * route.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-halyard-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
