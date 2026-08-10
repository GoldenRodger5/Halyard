'use client';

/**
 * Co-pilot compose. v2 Part H.
 *
 * A streaming chat with a live preview pane. Preview renders are cheap (480p, no
 * audio) so iteration is fast; only an approved draft renders at full quality.
 * Any turn can become a queued item.
 */
import { useCallback, useRef, useState } from 'react';
import { Card, GateLine, SectionTitle } from '@halyard/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DraftState {
  platform: string;
  body: string;
  hashtags: string[];
  previewUrl?: string;
  qc?: { gates: Array<{ gate: string; status: string; summary: string }> };
}

export function ComposeClient({ productId }: { productId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setError(null);

    try {
      const response = await fetch('/api/compose/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, messages: next }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Compose stream failed: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistant = '';
      setMessages([...next, { role: 'assistant', content: '' }]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          const event = JSON.parse(payload) as
            | { type: 'text'; text: string }
            | { type: 'draft'; draft: DraftState }
            | { type: 'error'; message: string };

          if (event.type === 'text') {
            assistant += event.text;
            setMessages([...next, { role: 'assistant', content: assistant }]);
          } else if (event.type === 'draft') {
            setDraft(event.draft);
          } else if (event.type === 'error') {
            setError(event.message);
          }
        }
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }, [input, messages, productId, streaming]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="flex h-[36rem] flex-col">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-3 text-sm leading-relaxed text-muted">
              <p>Start anywhere. For example:</p>
              <button
                onClick={() =>
                  setInput(
                    'I want to post about how gluten-free bread needs vinegar. Not sure which platform.',
                  )
                }
                className="block rounded-lg border border-line px-3 py-2 text-left text-ink hover:bg-sunk"
              >
                I want to post about how gluten-free bread needs vinegar. Not sure which platform.
              </button>
              <button
                onClick={() => setInput('Pull a real adaptation and turn it into a carousel.')}
                className="block rounded-lg border border-line px-3 py-2 text-left text-ink hover:bg-sunk"
              >
                Pull a real adaptation and turn it into a carousel.
              </button>
            </div>
          ) : (
            messages.map((message, i) => (
              <div
                key={i}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-white'
                    : 'max-w-[90%] whitespace-pre-wrap text-sm leading-relaxed text-ink'
                }
              >
                {message.content || (streaming ? '…' : '')}
              </div>
            ))
          )}
          {error ? (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          ) : null}
        </div>

        <div className="border-t border-line p-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Say what you want to post about"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <button
              onClick={() => void send()}
              disabled={streaming || input.trim().length === 0}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {streaming ? 'Thinking' : 'Send'}
            </button>
          </div>
        </div>
      </Card>

      <Card className="flex h-[36rem] flex-col p-4">
        <SectionTitle hint="480p, no audio">Live preview</SectionTitle>
        {!draft ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted">
            The preview updates as the conversation changes the content. Only the final approved
            version renders at full quality.
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto">
            {draft.previewUrl ? (
              <img
                src={draft.previewUrl}
                alt="Draft preview"
                className="mx-auto max-h-72 rounded-lg border border-line"
              />
            ) : null}
            <p className="text-xs uppercase tracking-[0.1em] text-muted">{draft.platform}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{draft.body}</p>
            {draft.hashtags.length > 0 ? (
              <p className="text-xs text-muted">{draft.hashtags.map((h) => `#${h}`).join(' ')}</p>
            ) : null}
            {draft.qc ? (
              <div className="space-y-1 rounded-lg bg-sunk/50 p-3">
                {draft.qc.gates.map((gate) => (
                  <GateLine
                    key={gate.gate}
                    gate={gate.gate}
                    status={gate.status as 'passed' | 'warning' | 'failed' | 'skipped'}
                    summary={gate.summary}
                  />
                ))}
              </div>
            ) : null}
            <form action="/api/compose/queue" method="post">
              <input type="hidden" name="draft" value={JSON.stringify(draft)} />
              <input type="hidden" name="productId" value={productId} />
              <button className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark">
                Send to queue
              </button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
