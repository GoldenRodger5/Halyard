'use client';

/**
 * The input half of the Daily Take. Milestone 28, B.2.
 *
 * A text field and a mic button. Speaking is faster than typing and produces
 * more natural phrasing, and the raw reaction is the raw material — messy is
 * fine, so nothing here tidies the input before it is stored.
 */
import { useCallback, useRef, useState } from 'react';
import { submitTake } from './actions';

export function TakeComposer({ storyId, storyTitle }: { storyId: string; storyTitle: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const body = new FormData();
          body.set('audio', blob, 'take.webm');

          const response = await fetch('/api/take/transcribe', { method: 'POST', body });
          if (!response.ok) throw new Error(`transcription failed: HTTP ${response.status}`);
          const { text: transcript } = (await response.json()) as { text: string };
          setText((current) => (current ? `${current} ${transcript}` : transcript));
        } catch (err) {
          setError(
            `${(err as Error).message}. Type it instead — the transcription is a convenience, not a dependency.`,
          );
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('No microphone access. Type your take instead.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
      >
        I have a take on this
      </button>
    );
  }

  return (
    <form action={submitTake} className="mt-4 space-y-2 rounded-lg border border-line bg-sunk/30 p-3">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="storyTitle" value={storyTitle} />
      <input type="hidden" name="inputMethod" value={transcribing || recording ? 'spoken' : 'typed'} />

      <label className="block text-xs uppercase tracking-[0.1em] text-muted">
        One line. Messy is fine — it is the raw material, not the post.
      </label>

      <div className="flex gap-2">
        <textarea
          name="rawInput"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="the moat isn't the model anymore its the workflow around it"
          className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={recording ? stopRecording : () => void startRecording()}
          disabled={transcribing}
          title="Speaking is faster and sounds more like you"
          className={`shrink-0 self-start rounded-lg border px-3 py-2 text-sm ${
            recording
              ? 'border-danger/40 bg-danger/10 text-danger'
              : 'border-line text-muted hover:bg-sunk hover:text-ink'
          }`}
        >
          {transcribing ? 'transcribing' : recording ? 'stop' : 'speak'}
        </button>
      </div>

      <input
        name="audience"
        placeholder="who is this for? (optional)"
        className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
      />

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          disabled={text.trim().length === 0}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Check and draft
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-sunk"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-muted">
          Fact-checked before drafting, so you can revise
        </span>
      </div>
    </form>
  );
}
