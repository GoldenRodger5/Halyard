import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST() {
  try {
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (!bypass) {
      return NextResponse.json({ error: 'VERCEL_AUTOMATION_BYPASS_SECRET_MISSING' }, { status: 503 });
    }

    const { error } = await adminClient().rpc('set_momentcircuit_vercel_bypass', {
      secret_value: bypass,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, stored: true });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    console.error('MomentCircuit bypass bootstrap failed', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
