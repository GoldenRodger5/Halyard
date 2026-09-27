import { describe, expect, it, vi } from 'vitest';
import { HiggsfieldClient, higgsfieldClientFromEnv } from './higgsfield.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HiggsfieldClient', () => {
  it('submits to a relative model path with the complete Key credential', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ request_id: 'req-1', status_url: 'https://api.higgsfield.ai/s', cancel_url: 'https://api.higgsfield.ai/c' }),
    ) as unknown as typeof fetch;
    const client = new HiggsfieldClient({ apiKey: 'copied-key', fetchImpl });
    const result = await client.submit('bytedance/seedance-2.0/text-to-video', {
      prompt: 'food motion',
      aspect_ratio: '9:16',
    });
    expect(result.requestId).toBe('req-1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Key copied-key' }),
      }),
    );
  });

  it('refuses an absolute or traversal model path', async () => {
    const client = new HiggsfieldClient({ apiKey: 'k', fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(client.submit('https://evil.example/model', {})).rejects.toThrow(/relative catalog path/);
    await expect(client.submit('../model', {})).rejects.toThrow(/relative catalog path/);
  });

  it('polls to completed and returns the real media URL', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ status: 'processing' }))
      .mockResolvedValueOnce(json({ status: 'completed', video: { url: 'https://cdn.example/result.mp4' } })) as unknown as typeof fetch;
    const client = new HiggsfieldClient({ apiKey: 'k', fetchImpl });
    const result = await client.waitForTerminal('req-2', { sleep: async () => undefined, timeoutMs: 2_000 });
    expect(result.status).toBe('completed');
    expect(result.media.videoUrl).toBe('https://cdn.example/result.mp4');
  });

  it('returns terminal provider failures instead of pretending they are media', async () => {
    const fetchImpl = vi.fn(async () => json({ status: 'nsfw', error: 'blocked' })) as unknown as typeof fetch;
    const client = new HiggsfieldClient({ apiKey: 'k', fetchImpl });
    const result = await client.waitForTerminal('req-3', { sleep: async () => undefined });
    expect(result).toMatchObject({ status: 'nsfw', error: 'blocked' });
  });

  it('cancels at the provider rather than merely stopping local polling', async () => {
    const fetchImpl = vi.fn(async () => json({ status: 'canceled' })) as unknown as typeof fetch;
    const client = new HiggsfieldClient({ apiKey: 'k', fetchImpl });
    await client.cancel('req-4');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.higgsfield.ai/requests/req-4/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('is unavailable until the Halyard server has its own API key', () => {
    expect(higgsfieldClientFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(higgsfieldClientFromEnv({ HF_API_KEY: 'server-key' } as NodeJS.ProcessEnv)).not.toBeNull();
  });
});
