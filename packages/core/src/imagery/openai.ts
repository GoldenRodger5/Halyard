/**
 * OpenAI images, as the first implementation of the imagery seam. §213.
 *
 * First because that key already exists in this deployment, not because it is
 * the best available — the field moves monthly and the point of the seam is
 * that swapping providers is one file. A Gemini/Imagen client, or a Veo or
 * Runway client for motion, is a new class implementing `ImageClient` (or a
 * `VideoClient` beside it) and nothing above changes.
 *
 * Every provider must call `assertIllustrative` before spending anything, so
 * the refusal to draw a product's interface does not depend on which one is
 * configured.
 */
import {
  assertIllustrative,
  type GeneratedImage,
  type ImageClient,
  type ImageRequest,
} from './types.js';

/** Sizes the API accepts, and the ratio each is closest to. */
const SIZES: Record<string, string> = {
  '9:16': '1024x1536',
  '16:9': '1536x1024',
  '1:1': '1024x1024',
  '4:5': '1024x1536',
  '2:3': '1024x1536',
};

export const IMAGE_MODEL = 'gpt-image-1';

/** Roughly, per image at these sizes. Recorded so a run's spend is visible. */
const COST_PER_IMAGE_USD = 0.04;

export interface OpenAiImageOptions {
  apiKey: string;
  model?: string;
  /** Injected in tests so no network is needed. */
  fetchImpl?: typeof fetch;
}

export class OpenAiImageClient implements ImageClient {
  constructor(private readonly options: OpenAiImageOptions) {}

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    /* Before anything is spent, and before anything is sent. */
    assertIllustrative(request.prompt);

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const model = this.options.model ?? IMAGE_MODEL;
    const size = SIZES[request.aspectRatio] ?? SIZES['1:1']!;

    const response = await fetchImpl('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        size,
        n: 1,
        /*
         * Bytes, not a URL. A provider-hosted URL expires, and Remotion fetches
         * the image during the render — the same trap that makes signed asset
         * URLs fail for Meta. Halyard stores what it will draw.
         */
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Image generation failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }

    const body = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error('Image generation returned no image.');

    const [w, h] = size.split('x').map(Number) as [number, number];

    return {
      data: Uint8Array.from(Buffer.from(b64, 'base64')),
      mimeType: 'image/png',
      width: w,
      height: h,
      provenance: 'generated',
      prompt: request.prompt,
      alt: request.alt,
      model,
      costUsd: COST_PER_IMAGE_USD,
    };
  }
}
