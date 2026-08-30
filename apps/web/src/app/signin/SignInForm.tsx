'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

/**
 * The one client component in the app.
 *
 * Supabase's magic-link flow is PKCE: the verifier is generated in the browser
 * and has to still be there when the link comes back, so this cannot be a
 * server action. Password sign-in has the same constraint for a different
 * reason — the session cookies are written by the browser client.
 *
 * §189. A password *as well as* a link, not instead of one.
 *
 * The original reasoning for link-only still holds on its own terms: one
 * operator, and a password is a second secret to keep. What it did not account
 * for is that an email round trip cannot be automated, so anything that needs to
 * sign in without a person — a browser test, a recorded demo for platform
 * review — simply could not. That is not a hypothetical: TikTok requires an
 * app-review video filmed on the production domain, and production is behind
 * this screen.
 *
 * Both paths land on the same allow-list. A Supabase session is not an operator;
 * `admin_users` is still the gate, checked on every request by `getOperator`.
 */
export function SignInForm() {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const client = () =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setState('working');
    setMessage('');

    const { error } = await client().auth.signInWithPassword({ email, password });
    if (error) {
      setState('error');
      /*
       * Supabase's own wording. "Invalid login credentials" does not say which
       * half was wrong, which is the correct behaviour — narrowing it would tell
       * a stranger whether an address is an operator.
       */
      setMessage(error.message);
      return;
    }

    /*
     * A full navigation rather than a router push: the session cookies were just
     * written by the browser client, and the server needs to read them on the
     * next request. A client-side transition would render the dashboard from a
     * cache that predates the cookie.
     */
    window.location.assign('/');
  }

  /**
   * §390. Google, through Supabase.
   *
   * Nothing on the server changes. `signInWithOAuth` sends the browser to
   * Google, Google returns to Supabase's own `/auth/v1/callback`, and Supabase
   * redirects here with `?code=` — the same PKCE exchange the magic link
   * already uses, which `/api/auth/callback` has handled since Milestone 48.
   *
   * The allow-list is unchanged and still the real gate: a Google account that
   * signs in successfully is refused at the callback unless it appears in
   * `admin_users`. Signing in with Google is a way to prove an address, not a
   * way to become an operator.
   */
  async function signInWithGoogle() {
    setState('working');
    setMessage('');

    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        /*
         * `select_account` every time. Without it Google silently reuses
         * whichever account the browser is already signed into, which is the
         * same failure the account-confirmation step exists for on the
         * publishing side — consent screens authorise whoever is already there
         * without asking.
         */
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) {
      setState('error');
      setMessage(error.message);
    }
    /* No success branch: on success the browser has already left for Google. */
  }

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    setState('working');
    setMessage('');

    const { error } = await client().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });

    if (error) {
      setState('error');
      setMessage(error.message);
      return;
    }
    // Shown in place rather than by navigating. A full page load here reads as
    // a spinner that never resolves, which is exactly how it looked the first
    // time somebody used it — the mail had already been sent.
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="mt-6">
        <p className="text-sm leading-relaxed text-dink">
          Sent to {email}. The link signs you in and expires in an hour.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-dmut">
          Open it in this browser if you can. If nothing arrives, the address is probably not on
          the allow-list — the mail is sent either way, and the session is refused on return, so a
          stranger who guesses the URL learns nothing about who the operator is.
        </p>
        <button onClick={() => setState('idle')} className="mt-4 text-sm text-brass underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {/*
        Google first. It is the one path that needs no secret kept and no mail
        round trip, so it is the one most people should use.
      */}
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={state === 'working'}
        className="flex items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-sink transition-transform hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <GoogleMark />
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-hair2" />
        <span className="font-data text-[10px] uppercase tracking-[0.14em] text-faint">or</span>
        <span className="h-px flex-1 bg-hair2" />
      </div>

      <form onSubmit={mode === 'password' ? signInWithPassword : sendLink} className="flex flex-col gap-3">
      <input
        type="email"
        name="email"
        autoComplete="username"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="rounded-lg border border-hair2 bg-[rgba(8,17,15,0.5)] px-3 py-2 text-sm text-dink outline-none placeholder:text-faint focus:border-brass"
      />

      {mode === 'password' ? (
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className="rounded-lg border border-hair2 bg-[rgba(8,17,15,0.5)] px-3 py-2 text-sm text-dink outline-none placeholder:text-faint focus:border-brass"
        />
      ) : null}

      <button
        disabled={state === 'working'}
        className="rounded-lg bg-brass px-4 py-2.5 text-sm font-medium text-deep transition-transform hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {state === 'working'
          ? mode === 'password'
            ? 'Signing in…'
            : 'Sending…'
          : mode === 'password'
            ? 'Sign in'
            : 'Email me a link'}
      </button>

      {message ? <p className="text-sm text-tally">{message}</p> : null}

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'link' : 'password');
          setState('idle');
          setMessage('');
        }}
        className="self-start text-xs text-dmut underline hover:text-dink"
      >
        {mode === 'password' ? 'Email me a link instead' : 'Use a password instead'}
        </button>
      </form>
    </div>
  );
}

/** Google's mark, drawn rather than fetched — an external image on the sign-in
 *  page is a third party watching who reaches it. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
