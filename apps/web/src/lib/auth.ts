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
  if (!supabaseConfigured()) {
    if (devBypassAllowed()) {
      return { id: '00000000-0000-4000-8000-000000000000', email: 'dev@localhost', isDevBypass: true };
    }
    return null;
  }

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

export async function requireOperator(): Promise<Operator> {
  const operator = await getOperator();
  if (!operator) {
    throw new Error('Not authenticated. Sign in, or set HALYARD_DEV_UNAUTHENTICATED=1 for local work.');
  }
  return operator;
}
