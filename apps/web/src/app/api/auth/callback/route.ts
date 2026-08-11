import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Where the magic link lands. Milestone 48.
 *
 * Exchanges the code for a session, then checks the allow-list. A signed-in
 * Supabase user is not an operator: `admin_users` is the second gate, and it is
 * checked here as well as in `getOperator` so a rejected sign-in says so once
 * rather than silently landing on an empty dashboard.
 *
 * **The first user to sign in claims the instance**, and only when the table is
 * empty. That is the same shape as any single-operator install: somebody has to
 * be first, and requiring a manual SQL insert to use your own deployment is a
 * step that gets skipped by pasting a service-role key somewhere worse.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent('That link carried no code. Ask for a new one.')}`);
  }

  const response = NextResponse.redirect(`${origin}/`);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          for (const { name, value, options } of cookies) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(error?.message ?? 'That link has expired. Ask for a new one.')}`,
    );
  }

  const admins = await query<{ user_id: string }>('select user_id from admin_users limit 1');
  if (admins.length === 0) {
    await query('insert into admin_users (user_id, email) values ($1, $2) on conflict do nothing', [
      data.user.id,
      data.user.email ?? null,
    ]);
    return response;
  }

  const allowed = await query<{ user_id: string }>(
    'select user_id from admin_users where user_id = $1',
    [data.user.id],
  );
  if (allowed.length === 0) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent('That address is not on the allow-list for this instance.')}`,
    );
  }

  return response;
}
