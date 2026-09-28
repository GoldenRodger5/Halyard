/**
 * Minimal server-side Higgsfield REST client.
 *
 * Official contract (2026-09-27):
 *   POST /<model-path> -> { request_id, status_url, cancel_url }
 *   GET  /requests/<id>/status until completed|failed|nsfw|canceled
 *   completed -> video.url or images[].url
 *   POST /requests/<id>/cancel to actually cancel provider work.
 *
 * This module deliberately knows nothing about Halyard strategy. It executes a
 * ProductionRecipe step and returns provider provenance.
 */

export type HiggsfieldTerminalStatus = 'completed' | 'failed' | 'nsfw' | 'canceled';
export type HiggsfieldStatusName =
  | HiggsfieldTerminalStatus
  | 'queued'
  | 'pending'
  | 'processing'
  | 'running'
  | string;

export interface HiggsfieldSubmission {
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
}

export interface HiggsfieldMedia {
  videoUrl?: string;
  imageUrls: string[];
}

export interface HiggsfieldStatus {
  requestId: string;
  status: HiggsfieldStatusName;
  media: HiggsfieldMedia;
  error?: string | null;
  raw: Record<string, unknown>;
}

export interface HiggsfieldClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface HiggsfieldWaitOptions {
  timeoutMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

function safeModelPath(modelPath: string): string {
  const path = modelPath.trim().replace(/^\/+/, '');
  if (!path || path.includes('..') || /^https?:/i.test(path)) {
    throw new Error('Higgsfield model path must be a relative catalog path.');
  }
  return path;
}

function requestIdFrom(payload: Record<string, unknown>): string | null {
  const value = payload.request_id ?? payload.requestId ?? payload.id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseStatus(requestId: string, payload: Record<string, unknown>): HiggsfieldStatus {
  const status = String(payload.status ?? payload.state ?? 'unknown').toLowerCase();
  const video = payload.video && typeof payload.video === 'object'
    ? (payload.video as Record<string, unknown>)
    : null;
  const videoUrl = typeof video?.url === 'string' ? video.url : undefined;
  const images = Array.isArray(payload.images) ? payload.images : [];
  const imageUrls = images
    .map((image) =>
      image && typeof image === 'object' && typeof (image as Record<string, unknown>).url === 'string'
        ? String((image as Record<string, unknown>).url)
        : null,
    )
    .filter((url): url is string => Boolean(url));
  const errorValue = payload.error ?? payload.error_message ?? payload.message;
  const error = typeof errorValue === 'string' && errorValue.trim() ? errorValue.trim() : null;
  return { requestId, status, media: { videoUrl, imageUrls }, error, raw: payload };
}

async function jsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`${label} returned non-JSON HTTP ${response.status}.`);
    }
  }
  if (!response.ok) {
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : `${label} failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

export class HiggsfieldClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly authorization: string;

  constructor(options: HiggsfieldClientOptions) {
    const key = options.apiKey.trim();
    if (!key) throw new Error('Higgsfield API key is required.');
    this.baseUrl = (options.baseUrl ?? 'https://api.higgsfield.ai').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.authorization = `Key ${key}`;
  }

  async submit(modelPath: string, input: Record<string, unknown>): Promise<HiggsfieldSubmission> {
    const path = safeModelPath(modelPath);
    const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const payload = await jsonResponse(response, 'Higgsfield generation submit');
    const requestId = requestIdFrom(payload);
    if (!requestId) throw new Error('Higgsfield submit succeeded but returned no request_id.');
    return {
      requestId,
      statusUrl:
        typeof payload.status_url === 'string'
          ? payload.status_url
          : `${this.baseUrl}/requests/${encodeURIComponent(requestId)}/status`,
      cancelUrl:
        typeof payload.cancel_url === 'string'
          ? payload.cancel_url
          : `${this.baseUrl}/requests/${encodeURIComponent(requestId)}/cancel`,
    };
  }

  async status(requestId: string): Promise<HiggsfieldStatus> {
    const id = requestId.trim();
    if (!id) throw new Error('Higgsfield request id is required.');
    const response = await this.fetchImpl(
      `${this.baseUrl}/requests/${encodeURIComponent(id)}/status`,
      { headers: { Authorization: this.authorization } },
    );
    return parseStatus(id, await jsonResponse(response, 'Higgsfield status'));
  }

  async cancel(requestId: string): Promise<Record<string, unknown>> {
    const id = requestId.trim();
    if (!id) throw new Error('Higgsfield request id is required.');
    const response = await this.fetchImpl(
      `${this.baseUrl}/requests/${encodeURIComponent(id)}/cancel`,
      { method: 'POST', headers: { Authorization: this.authorization } },
    );
    return jsonResponse(response, 'Higgsfield cancel');
  }

  async waitForTerminal(
    requestId: string,
    options: HiggsfieldWaitOptions = {},
  ): Promise<HiggsfieldStatus> {
    const timeoutMs = options.timeoutMs ?? 10 * 60_000;
    const maxDelayMs = options.maxDelayMs ?? 10_000;
    let delayMs = options.initialDelayMs ?? 2_000;
    const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const current = await this.status(requestId);
      if (['completed', 'failed', 'nsfw', 'canceled'].includes(current.status)) {
        if (current.status === 'completed' && !current.media.videoUrl && current.media.imageUrls.length === 0) {
          throw new Error('Higgsfield reported completed but returned no media URL.');
        }
        return current;
      }
      await sleep(delayMs);
      delayMs = Math.min(maxDelayMs, Math.round(delayMs * 1.5));
    }

    throw new Error(`Higgsfield request ${requestId} did not reach a terminal state before timeout.`);
  }
}

export function higgsfieldClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): HiggsfieldClient | null {
  const key = env.HF_API_KEY?.trim();
  return key ? new HiggsfieldClient({ apiKey: key, fetchImpl }) : null;
}
