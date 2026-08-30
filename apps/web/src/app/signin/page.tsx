import { supabaseConfigured } from '@/lib/auth';
import { SignInForm } from './SignInForm';

export const dynamic = 'force-dynamic';

/**
 * Sign in. Milestone 48, plus Google in §390.
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
    /*
     * §390. The studio's brand, on the one screen outside the studio.
     *
     * Sign-in kept the old console's serif-and-cream look, which was invisible
     * while both existed and is the first thing anybody sees now that only one
     * does. The deep ground is the same one the slate uses — the operator meets
     * the room before they are in it.
     */
    <main className="studio-grain flex min-h-dvh items-center justify-center bg-deep px-6 py-24">
      <div className="w-full max-w-md rounded-[14px] border border-hair2 bg-[rgba(18,33,31,0.72)] p-8 text-dink shadow-[0_24px_50px_-24px_rgba(0,0,0,0.7)]">
        <div className="mb-1 flex items-center gap-2">
          <Mark />
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-white">
            Halyard
          </h1>
        </div>

        {!supabaseConfigured() ? (
          <p className="mt-4 text-sm leading-relaxed text-dmut">
            Supabase Auth is not configured on this deployment, so there is nothing to sign in to.
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        ) : sp.sent ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-dink">
              Check {sp.sent}. The link signs you in and expires in an hour.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-dmut">
              If nothing arrives, the address is probably not in <code>admin_users</code> — Supabase
              sends the mail either way, but the session is refused on return. That is deliberate:
              a stranger who guesses the URL learns nothing about who the operator is.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-dmut">
              One operator, one allow-list. Google, a password, or a link by email — whichever
              you use, the account still has to appear in <code>admin_users</code> before
              anything is visible.
            </p>
            {sp.error ? (
              <p className="mt-4 rounded-lg border border-tally/40 bg-tally/[0.08] px-3 py-2 text-sm text-tally">{sp.error}</p>
            ) : null}
            <SignInForm />
          </>
        )}
      </div>
    </main>
  );
}

/** The mark, as the sidebar draws it: a halyard with the tally lamp at its foot. */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 30 30" aria-hidden="true">
      <path d="M15 3 L15 27" stroke="var(--color-brass)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15 6 L24 15 L15 18 Z" fill="var(--color-brass)" />
      <path d="M15 8 L7 16 L15 19 Z" fill="var(--color-brass)" opacity="0.45" />
      <circle cx="15" cy="27" r="2.2" fill="var(--color-tally)" />
    </svg>
  );
}
