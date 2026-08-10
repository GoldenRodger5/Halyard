import { NextResponse, type NextRequest } from 'next/server';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Transcribe a spoken take. Milestone 28, B.2.
 *
 * Speaking is faster than typing and produces more natural phrasing, so it is
 * worth supporting — but it is a convenience, not a dependency. Every failure
 * here returns a message telling the operator to type it instead, because a
 * broken microphone must not block the only input-gated workflow in the system.
 */
export async function POST(request: NextRequest) {
  await requireOperator();

  const form = await request.formData();
  const audio = form.get('audio');
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'No audio in the request.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'No transcription backend configured. Set OPENAI_API_KEY, or type the take — the text field is the primary input and always works.',
      },
      { status: 428 },
    );
  }

  const upstream = new FormData();
  upstream.set('file', audio, 'take.webm');
  upstream.set('model', 'whisper-1');
  // The founder's reaction is the raw material; a "cleaned up" transcript loses
  // exactly the phrasing that makes it sound like them.
  upstream.set('temperature', '0');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: upstream,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Transcription failed (HTTP ${response.status}). Type it instead.` },
      { status: 502 },
    );
  }

  const { text } = (await response.json()) as { text: string };
  return NextResponse.json({ text });
}
