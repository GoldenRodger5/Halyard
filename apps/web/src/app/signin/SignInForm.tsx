'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

/**
 * The one client component in the app.
 *
 * Supabase's magic-link flow is PKCE: the verifier is generated in the browser
 * and has to still be there when the link comes back, so this cannot be a
 * server action.
 */
export function SignInForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setMessage('');

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });

    if (error) {
      setState('error');
      setMessage(error.message);
      return;
    }
    window.location.href = `/signin?sent=${encodeURIComponent(email)}`;
  }

  return (
    <form onSubmit={send} className="mt-6 flex flex-col gap-3">
      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted"
      />
      <button
        disabled={state === 'sending'}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : 'Email me a link'}
      </button>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </form>
  );
}
