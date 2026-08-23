/**
 * Auth. Supabase Auth, single admin, protected routes (v1 §10).
 *
 * A user must both hold a Supabase session and appear in `admin_users`. Being
 * signed in to the Supabase project is not enough on its own.
 *
 * `HALYARD_DEV_UNAUTHENTICATED=1` bypasses the check so the app can be run and
 * screenshotted without a Supabase project. It refuses to work when
 * NODE_ENV === 'production', so it cannot be left on by accident.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { query } from './db';

export interface Operator {
  id: string;
  email: string | null;
  isDevBypass: boolean;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function devBypassAllowed(): boolean {
  return process.env.HALYARD_DEV_UNAUTHENTICATED === '1' && process.env.NODE_ENV !== 'production';
}

export async function getOperator(): Promise<Operator | null> {
  /*
   * §174. The bypass is checked *first*, not only when Supabase is missing.
   *
   * It used to live inside `if (!supabaseConfigured())`, which made
   * `HALYARD_DEV_UNAUTHENTICATED=1` silently inert on any machine that had
   * Supabase keys in `.env.local` — that is, every real development setup. The
   * flag was set, the app kept redirecting to /signin, and nothing said why.
   *
   * It took the browser suite with it: `e2e/accounts.spec.ts` was failing five of
   * six, and every other spec that opens a protected page was in the same state,
   * because Playwright cannot sign in to Supabase. A dead E2E suite is worse than
   * no E2E suite — it reports green when it is skipped and gets ignored when it
   * is red.
   *
   * The guard that matters is unchanged and is the only one that ever mattered:
   * `devBypassAllowed()` requires `NODE_ENV !== 'production'`, so this cannot be
   * turned on in a deployed environment even if the variable were set there.
   */
  if (devBypassAllowed()) {
    return { id: '00000000-0000-4000-8000-000000000000', email: 'dev@localhost', isDevBypass: true };
  }
  if (!supabaseConfigured()) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* read-only in a server component */
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const admins = await query<{ user_id: string }>('select user_id from admin_users where user_id = $1', [
    data.user.id,
  ]);
  if (admins.length === 0) return null;

  return { id: data.user.id, email: data.user.email ?? null, isDevBypass: false };
}

/**
 * The operator, or a redirect to sign in — for route handlers.
 *
 * §173. `requireOperator` throws, which a *page* turns into an error boundary and
 * a **route handler** turns into a bare 500. `GET /api/oauth/x/start` answered an
 * expired session with an opaque 500 and no way forward: the operator had clicked
 * Connect and got a blank error page, which reads exactly like a broken
 * integration rather than "your session ended, sign in again."
 *
 * Returns the operator, or the response to send instead.
 */
export async function operatorOrSignIn(
  request: { nextUrl: URL },
): Promise<{ operator: Operator } | { response: Response }> {
  const operator = await getOperator();
  if (operator) return { operator };

  const signIn = new URL('/signin', request.nextUrl.origin);
  signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return { response: Response.redirect(signIn, 307) };
}

export async function requireOperator(): Promise<Operator> {
  const operator = await getOperator();
  if (!operator) {
    throw new Error('Not authenticated. Sign in, or set HALYARD_DEV_UNAUTHENTICATED=1 for local work.');
  }
  return operator;
}
