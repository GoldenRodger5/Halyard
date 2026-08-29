'use client';

/**
 * §272. The post as the person scrolling past it will see it.
 *
 * The queue showed rendered media as a horizontal strip of bare `<img>` tags,
 * and video not at all — an mp4 in an `<img>` renders nothing. So an operator
 * approving a TikTok was approving a filename: no player, no caption in its
 * real position, no sense of what the platform's own UI covers up.
 *
 * That last part is the reason this exists rather than being a nicety. Every
 * platform draws its own furniture over the media — TikTok's action rail eats
 * the right edge, its caption block eats the bottom left, Instagram crops a
 * carousel to slide one's shape. A frame that looks balanced in a strip can be
 * half-hidden in the feed, and the only way to catch that before publishing is
 * to look at it in the right shape.
 *
 * The chrome here is **approximate and labelled as such**. It is a safe-area
 * check, not a pixel-accurate emulation, and pretending otherwise would make an
 * operator trust it for things it cannot answer.
 */
import { useState } from 'react';

export type PreviewPlatform = 'tiktok' | 'instagram' | 'x' | 'youtube' | 'threads' | 'pinterest';

export interface PostPreviewProps {
  platform: string;
  /** Rendered media, in slide order. Videos and images both. */
  media: string[];
  body: string;
  hashtags?: string[];
  handle?: string | null;
  altText?: string | null;
}

const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

/** 9:16 for the vertical surfaces, 4:5 for a feed carousel, 16:9 for YouTube. */
function frameAspect(platform: string): string {
  if (platform === 'youtube') return '16 / 9';
  if (platform === 'instagram') return '4 / 5';
  return '9 / 16';
}

function Media({ url, alt }: { url: string; alt: string }) {
  if (isVideo(url)) {
    return (
      <video
        src={url}
        controls
        playsInline
        /*
         * Not autoplaying. An operator opening a queue card is reading, and a
         * video that starts talking on load is the behaviour everyone disables.
         */
        preload="metadata"
        className="h-full w-full bg-black object-contain"
      />
    );
  }
  return <img src={url} alt={alt} className="h-full w-full object-cover" />;
}

/** TikTok: full-bleed video, caption bottom-left, action rail on the right. */
function TikTokChrome({ media, body, hashtags, handle, altText }: PostPreviewProps) {
  const [index, setIndex] = useState(0);
  const url = media[index];
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-black" style={{ aspectRatio: '9 / 16' }}>
      {url ? <Media url={url} alt={altText ?? 'Post media'} /> : null}

      {/* The furniture TikTok draws over every video. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end">
        <div
          className="p-4 pr-16"
          /*
           * Inline rather than a gradient utility: the design tokens are the
           * brand's, and this scrim is platform furniture being imitated, not
           * Halyard's own surface. Keeping it out of the token space stops it
           * being mistaken for a brand colour.
           */
          style={{ backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))' }}
        >
          <p className="text-[13px] font-semibold text-white">@{handle ?? 'account'}</p>
          <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-white/90">{body}</p>
          {hashtags && hashtags.length > 0 ? (
            <p className="mt-1 text-[12px] text-white/80">
              {hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
            </p>
          ) : null}
        </div>
      </div>

      {/* The right rail. Approximate, and the point is that it covers this strip. */}
      <div className="pointer-events-none absolute bottom-24 right-2 flex flex-col items-center gap-4 text-white/90">
        {['♥', '💬', '↗', '⋯'].map((glyph, i) => (
          <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm">
            {glyph}
          </span>
        ))}
      </div>

      {media.length > 1 ? <SlideDots count={media.length} index={index} onPick={setIndex} /> : null}
    </div>
  );
}

/** Instagram: header, square-ish media, caption underneath, swipe dots. */
function InstagramChrome({ media, body, hashtags, handle, altText }: PostPreviewProps) {
  const [index, setIndex] = useState(0);
  const url = media[index];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className="h-7 w-7 rounded-full"
          style={{ backgroundImage: 'linear-gradient(to top right, #f0b429, #d2417f)' }}
        />
        <span className="text-[13px] font-semibold">{handle ?? 'account'}</span>
      </div>
      <div className="relative bg-black" style={{ aspectRatio: '4 / 5' }}>
        {url ? <Media url={url} alt={altText ?? 'Post media'} /> : null}
        {media.length > 1 ? (
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
            {index + 1}/{media.length}
          </span>
        ) : null}
      </div>
      {media.length > 1 ? <SlideDots count={media.length} index={index} onPick={setIndex} inline /> : null}
      <div className="px-3 py-2">
        <div className="flex gap-3 pb-2 text-lg">
          <span>♡</span>
          <span>💬</span>
          <span>↗</span>
        </div>
        <p className="whitespace-pre-wrap text-[13px] leading-snug">
          <span className="font-semibold">{handle ?? 'account'}</span> {body}
        </p>
        {hashtags && hashtags.length > 0 ? (
          <p className="mt-1 text-[13px] text-primary">
            {hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** X: avatar, handle, text, then media in a rounded card. */
function XChrome({ media, body, hashtags, handle, altText }: PostPreviewProps) {
  const url = media[0];
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-ink/10" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px]">
            <span className="font-semibold">{handle ?? 'account'}</span>{' '}
            <span className="text-muted">@{(handle ?? 'account').replace(/^@/, '')} · now</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug">{body}</p>
          {hashtags && hashtags.length > 0 ? (
            <p className="mt-1 text-[15px] text-primary">
              {hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
            </p>
          ) : null}
          {url ? (
            <div className="mt-2 overflow-hidden rounded-2xl border border-line" style={{ aspectRatio: '16 / 9' }}>
              <Media url={url} alt={altText ?? 'Post media'} />
            </div>
          ) : null}
          <div className="mt-2 flex gap-8 text-muted">
            <span>💬</span>
            <span>↺</span>
            <span>♡</span>
            <span>↗</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideDots({
  count,
  index,
  onPick,
  inline,
}: {
  count: number;
  index: number;
  onPick: (i: number) => void;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? 'flex justify-center gap-1.5 py-2'
          : 'absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5'
      }
    >
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Slide ${i + 1}`}
          onClick={() => onPick(i)}
          className={`h-1.5 w-1.5 rounded-full transition ${
            i === index ? 'bg-primary' : inline ? 'bg-ink/20' : 'bg-white/50'
          }`}
        />
      ))}
    </div>
  );
}

export function PostPreview(props: PostPreviewProps) {
  const { platform, media } = props;

  if (media.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Nothing rendered yet. The preview appears once the render job finishes.
      </p>
    );
  }

  const chrome =
    platform === 'tiktok' || platform === 'youtube' ? (
      <TikTokChrome {...props} />
    ) : platform === 'instagram' || platform === 'threads' || platform === 'pinterest' ? (
      <InstagramChrome {...props} />
    ) : (
      <XChrome {...props} />
    );

  return (
    <div>
      <div className="mx-auto" style={{ maxWidth: platform === 'x' ? '30rem' : '22rem' }}>
        {chrome}
      </div>
      {/*
        Said plainly, because an operator who trusts this for pixel accuracy
        will be wrong. It answers "is anything important underneath the
        platform's own furniture", and nothing finer than that.
      */}
      <p className="mt-3 text-center text-xs text-muted">
        Approximate {platform} chrome — a safe-area check, not an exact preview.{' '}
        {media.length > 1 ? `${media.length} slides; tap the dots.` : null}
      </p>
    </div>
  );
}

/** Kept so the aspect used by the preview can be asserted in a test. */
export const previewAspectFor = frameAspect;
