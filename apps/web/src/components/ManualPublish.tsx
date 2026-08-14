'use client';

/**
 * Everything needed to post something by hand, in one place.
 *
 * Some accounts have no API path. Facebook has no adapter here at all, and any
 * account whose platform review has not landed sits in `draft_only`. Those
 * posts used to fail at the publish step, which read as a broken integration
 * rather than as a post waiting for a person.
 *
 * The design goal is that posting by hand costs one visit: the copy is one
 * click away from the clipboard, the media is one click from the disk, and the
 * platform's own composer is one click from here. Anything that makes the
 * operator assemble the post themselves means it gets skipped, and a queue that
 * gets skipped is a queue that lies about what went out.
 *
 * The URL back is required. Without it there is nothing to collect metrics
 * against and nothing to prove the post exists — the item would claim
 * `published` on an assertion alone, which is the same shape as every "it
 * looked done" bug this project keeps finding.
 */
import { useState } from 'react';

/** Where each platform's composer lives, so posting starts one click from here. */
const COMPOSER_URL: Record<string, string> = {
  instagram: 'https://www.instagram.com/',
  threads: 'https://www.threads.net/',
  tiktok: 'https://www.tiktok.com/upload',
  youtube: 'https://studio.youtube.com/',
  pinterest: 'https://www.pinterest.com/pin-builder/',
  x: 'https://x.com/compose/post',
  bluesky: 'https://bsky.app/',
  facebook: 'https://www.facebook.com/',
};

export interface ManualPublishProps {
  itemId: string;
  platform: string;
  body: string;
  hashtags: string[];
  title: string | null;
  altText: string | null;
  linkUrl: string | null;
  assets: Array<{ id: string; url: string; kind: string }>;
  onRecord: (formData: FormData) => Promise<void>;
}

function CopyButton({ label, value }: { label: string; value: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="rounded-lg border border-line px-2 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function ManualPublish(props: ManualPublishProps): React.ReactElement {
  // The caption exactly as it should be pasted: body, then hashtags. Built here
  // rather than asking the operator to join them, because that join is where a
  // hand-assembled post drifts from the one that was reviewed.
  const caption = [props.body, props.hashtags.map((h) => `#${h}`).join(' ')]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');

  const composer = COMPOSER_URL[props.platform];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        This account cannot post through an API, so this one is yours to post. Everything below is
        what was reviewed — paste it as it is.
      </p>

      <div className="flex flex-wrap gap-2">
        <CopyButton label="Copy caption" value={caption} />
        {props.title ? <CopyButton label="Copy title" value={props.title} /> : null}
        {props.altText ? <CopyButton label="Copy alt text" value={props.altText} /> : null}
        {props.linkUrl ? <CopyButton label="Copy link" value={props.linkUrl} /> : null}
        {composer ? (
          <a
            href={composer}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line px-2 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
          >
            Open {props.platform} ↗
          </a>
        ) : null}
      </div>

      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-sunk p-3 text-sm text-ink">
        {caption}
      </pre>

      {props.assets.length > 0 ? (
        <div>
          <p className="mb-2 text-sm text-muted">
            {props.assets.length} file{props.assets.length === 1 ? '' : 's'} to attach, in order:
          </p>
          <ol className="space-y-1 text-sm">
            {props.assets.map((asset, index) => (
              <li key={asset.id} className="flex items-center gap-2">
                <span className="text-muted">{index + 1}.</span>
                <a
                  href={asset.url}
                  download
                  className="text-accent underline underline-offset-2 hover:no-underline"
                >
                  Download {asset.kind}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted">No media on this post.</p>
      )}

      <form action={props.onRecord} className="space-y-2 border-t border-line pt-4">
        <input type="hidden" name="id" value={props.itemId} />
        <label className="block text-sm text-muted" htmlFor="manual-url">
          Once it is up, paste the link to it. Metrics are collected against this, so a post with no
          link cannot be measured.
        </label>
        <input
          id="manual-url"
          name="url"
          type="url"
          required
          placeholder="https://…"
          className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        />
        <button className="w-full rounded-lg bg-accent px-2 py-1.5 text-sm font-medium text-white hover:opacity-90">
          I posted it
        </button>
      </form>
    </div>
  );
}
