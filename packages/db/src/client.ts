import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.gen.js';

export type HalyardClient = SupabaseClient<Database>;

/**
 * Service-role client. Bypasses RLS.
 *
 * Server contexts only — route handlers, cron handlers, the worker. If this ever
 * runs in a browser bundle the platform tokens are one query away from a
 * client payload, which is the thing v1 §10 exists to prevent.
 */
export function createServiceClient(
  url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
): HalyardClient {
  if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  if (typeof window !== 'undefined') {
    throw new Error(
      'createServiceClient() was called in a browser context. The service role key bypasses RLS and must never reach a client bundle.',
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-halyard-client': 'service' } },
  });
}

/** Anon client, for the browser. Sees only what RLS allows. */
export function createAnonClient(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): HalyardClient {
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set');
  }
  return createClient<Database>(url, key);
}

/**
 * Columns of social_accounts that are safe to select outside the worker.
 * Token ciphertext is deliberately absent; 0010_rls.sql revokes it at the
 * database level as well, so this list is a convenience, not the guard.
 */
export const SAFE_ACCOUNT_COLUMNS =
  'id, product_id, platform, persona, handle, platform_user_id, token_expires_at, scopes, ' +
  'capability_state, capability_detail, supported_formats, rate_limit_config, ' +
  'link_strategy, bio_link_url, last_verified_at, last_error, created_at, updated_at';
