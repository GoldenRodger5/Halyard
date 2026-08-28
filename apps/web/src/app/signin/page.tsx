import { Card } from '@halyard/ui';
import { supabaseConfigured } from '@/lib/auth';
import { SignInForm } from './SignInForm';

export const dynamic = 'force-dynamic';

/**
 * Sign in. Milestone 48.
 *
 * The dashboard layout refused an unauthenticated visitor from the first
 * milestone and explained why, but there was nowhere to actually sign in — so
 * the first production deploy was correctly protected and completely
 * unreachable. This is the missing half.
 *
 * §189. A password *or* a magic link. The link came first, on the reasoning that
 * one operator needs no second secret and an email round trip proves control of
 * the address `admin_users` is keyed on — all still true. What it missed is that
 * an email round trip cannot be automated, so a browser test or a platform-review
 * recording could not reach anything behind this screen.
 *
 * Both land on the same allow-list.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <Card className="p-8">
        <h1 className="font-serif text-3xl text-ink">Halyard</h1>

        {!supabaseConfigured() ? (
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Supabase Auth is not configured on this deployment, so there is nothing to sign in to.
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        ) : sp.sent ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink">
              Check {sp.sent}. The link signs you in and expires in an hour.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              If nothing arrives, the address is probably not in <code>admin_users</code> — Supabase
              sends the mail either way, but the session is refused on return. That is deliberate:
              a stranger who guesses the URL learns nothing about who the operator is.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              One operator, one allow-list. Sign in with a password, or have a link emailed —
              either way the account still has to appear in <code>admin_users</code> before
              anything is visible.
            </p>
            {sp.error ? (
              <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>
            ) : null}
            <SignInForm />
          </>
        )}
      </Card>
    </main>
  );
}
