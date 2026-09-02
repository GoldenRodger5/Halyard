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
import { providerRefusal } from '../generation/provider.js';

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
/**
 * §494. What a `gpt-image-1` image costs, by quality and size, in USD.
 *
 * This file carried a single constant, 0.04, and never sent `quality` — so the
 * provider chose *auto*, which resolves to **high**, and every portrait image
 * cost about six times what the ledger said. Eighty images in a day of
 * testing was most of a twenty-dollar bill that the recorded numbers put at
 * three. Published list prices, per image; rounded up, so an estimate errs on
 * the side the operator would rather it err on.
 */
export type ImageQuality = 'low' | 'medium' | 'high';
export const IMAGE_PRICE_USD: Record<ImageQuality, Record<string, number>> = {
  low: { '1024x1024': 0.011, '1024x1536': 0.016, '1536x1024': 0.016 },
  medium: { '1024x1024': 0.042, '1024x1536': 0.063, '1536x1024': 0.063 },
  high: { '1024x1024': 0.167, '1024x1536': 0.25, '1536x1024': 0.25 },
};
export function imagePriceUsd(quality: ImageQuality, size: string): number {
  return IMAGE_PRICE_USD[quality][size] ?? IMAGE_PRICE_USD[quality]['1024x1536']!;
}

/**
 * Medium, on purpose. A 9:16 social frame covers-and-crops a 1024×1536 image
 * under type and a scrim; medium is indistinguishable there and costs a
 * quarter of high. `IMAGE_QUALITY` overrides it for a deliberate run.
 */
export const DEFAULT_IMAGE_QUALITY: ImageQuality = 'medium';
export function imageQualityFrom(env: NodeJS.ProcessEnv = process.env): ImageQuality {
  const q = env.IMAGE_QUALITY?.trim().toLowerCase();
  return q === 'low' || q === 'medium' || q === 'high' ? q : DEFAULT_IMAGE_QUALITY;
}

export interface OpenAiImageOptions {
  apiKey: string;
  model?: string;
  /** Injected in tests so no network is needed. */
  fetchImpl?: typeof fetch;
  /** §494. Defaults to `IMAGE_QUALITY`, else medium. */
  quality?: ImageQuality;
}

export class OpenAiImageClient implements ImageClient {
  constructor(private readonly options: OpenAiImageOptions) {}

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    /* Before anything is spent, and before anything is sent. */
    assertIllustrative(request.prompt);

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const model = this.options.model ?? IMAGE_MODEL;
    const size = SIZES[request.aspectRatio] ?? SIZES['1:1']!;
    const quality = this.options.quality ?? imageQualityFrom();

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
        quality,
        n: 1,
        /*
         * §268. `response_format` is **not** sent, and that is deliberate.
         *
         * It is a DALL·E parameter. `gpt-image-1` rejects it outright —
         * `HTTP 400 Unknown parameter: 'response_format'` — and always returns
         * base64 regardless, which is what this wants anyway: bytes, not a URL.
         * A provider-hosted URL expires, and Remotion fetches the image during
         * the render, the same trap that makes signed asset URLs fail for Meta.
         * Halyard stores what it will draw.
         *
         * Sending it meant this client had never generated a single image. The
         * first call ever made to it failed on the parameter.
         */
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      /* §491. Typed, so a dead account stops the run instead of one picture. */
      throw providerRefusal('openai-image', response.status, `Image generation failed: ${detail}`);
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
      costUsd: imagePriceUsd(quality, size),
    };
  }
}
