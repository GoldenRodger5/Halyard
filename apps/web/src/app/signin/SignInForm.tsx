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
        <p className="text-sm leading-relaxed text-ink">
          Sent to {email}. The link signs you in and expires in an hour.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Open it in this browser if you can. If nothing arrives, the address is probably not on
          the allow-list — the mail is sent either way, and the session is refused on return, so a
          stranger who guesses the URL learns nothing about who the operator is.
        </p>
        <button onClick={() => setState('idle')} className="mt-4 text-sm text-primary underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={mode === 'password' ? signInWithPassword : sendLink} className="mt-6 flex flex-col gap-3">
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
        className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted"
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
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
      ) : null}

      <button
        disabled={state === 'working'}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {state === 'working'
          ? mode === 'password'
            ? 'Signing in…'
            : 'Sending…'
          : mode === 'password'
            ? 'Sign in'
            : 'Email me a link'}
      </button>

      {message ? <p className="text-sm text-danger">{message}</p> : null}

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'link' : 'password');
          setState('idle');
          setMessage('');
        }}
        className="self-start text-xs text-muted underline hover:text-ink"
      >
        {mode === 'password' ? 'Email me a link instead' : 'Use a password instead'}
      </button>
    </form>
  );
}
