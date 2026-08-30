/**
 * §356. The polling endpoint behind the run view.
 *
 * Polling rather than a websocket, deliberately and for now. The UI needs a
 * feed of what a run is doing; the transport is an implementation detail, and
 * `job_events` — the part that did not exist — is the same either way. A
 * websocket replaces this route without the page changing.
 */
import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/auth';
import { loadRun } from '@/app/(dashboard)/make/run/[jobId]/route-data';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  await requireOperator();
  const { jobId } = await params;
  const run = await loadRun(jobId);
  if (!run) return NextResponse.json({ error: 'no such run' }, { status: 404 });
  return NextResponse.json(run);
}
