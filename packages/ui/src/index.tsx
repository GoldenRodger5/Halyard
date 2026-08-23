/**
 * Shared UI primitives.
 *
 * Deliberately small and hand-rolled rather than pulled from a component
 * library: Halyard has one operator and about a dozen screens, and the visual
 * language is the product's own (terracotta on warm cream, Instrument Serif
 * headings). A generic component kit would fight that on every screen.
 */
import type { ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-4xl leading-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className,
  as: Tag = 'div',
  scrollLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
  /**
   * Set on a card that scrolls its own content (`overflow-x-auto`), naming what
   * is inside it.
   *
   * A container that scrolls but cannot be focused is unreachable by keyboard:
   * a mouse can drag a wide table sideways and a keyboard has nothing to put
   * the caret on, so the columns past the fold simply do not exist. Every wide
   * table in Halyard sat behind that, and it only shows at narrow widths, which
   * is why it survived every desktop pass.
   *
   * The label is required rather than optional because `role="region"` with no
   * accessible name is announced as an unnamed landmark, which is worse than
   * no landmark at all.
   */
  scrollLabel?: string;
}) {
  const scrolls = scrollLabel !== undefined;
  return (
    <Tag
      className={cx(
        'rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(42,35,32,0.04)]',
        className,
      )}
      {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': scrollLabel } : {})}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{children}</h2>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunk',
  ghost: 'text-muted hover:bg-sunk hover:text-ink',
  danger: 'border border-danger/30 text-danger hover:bg-danger/10',
};

export function Button({
  children,
  variant = 'secondary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  href,
  variant = 'secondary',
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {children}
    </a>
  );
}

// ── Status ─────────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-sunk text-muted border-line',
  good: 'bg-good/10 text-good border-good/25',
  warn: 'bg-warn/12 text-warn-ink border-warn/30',
  bad: 'bg-danger/10 text-danger border-danger/25',
  info: 'bg-primary/10 text-primary border-primary/25',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]',
        TONE_STYLES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatChip({
  label,
  value,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const inner = (
    <>
      <span className="font-serif text-2xl leading-none text-ink">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </>
  );
  const className = cx(
    'flex min-w-[9rem] flex-1 flex-col gap-1.5 rounded-xl border px-4 py-3 transition-colors',
    TONE_STYLES[tone],
    href && 'hover:border-primary/40',
  );
  return href ? (
    <a href={href} className={className}>
      {inner}
    </a>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/**
 * The honest empty state. v1 §8 is explicit that the analytics page must say
 * "not enough data" rather than rendering noise as signal, and the same applies
 * everywhere else.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="px-6 py-10 text-center">
      <p className="font-serif text-xl text-ink">{title}</p>
      <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Card>
  );
}

// ── Domain-specific ────────────────────────────────────────────────────────

export const PLATFORM_LABELS: Record<string, string> = {
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  youtube: 'YouTube',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

export const PLATFORM_COLORS: Record<string, string> = {
  x: '#2A2320',
  instagram: '#C4714A',
  tiktok: '#3C6E71',
  pinterest: '#B03A2E',
  youtube: '#8E4A3C',
  threads: '#5C6B73',
  bluesky: '#4A6FA5',
};

export function PlatformDot({ platform, className }: { platform: string; className?: string }) {
  return (
    <span
      className={cx('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PLATFORM_COLORS[platform] ?? '#7A6E66' }}
      aria-hidden
    />
  );
}

export const CAPABILITY_TONE: Record<string, Tone> = {
  live: 'good',
  draft_only: 'warn',
  error: 'bad',
  pending_auth: 'neutral',
  disabled: 'neutral',
};

export const CAPABILITY_LABEL: Record<string, string> = {
  live: 'live',
  draft_only: 'draft only',
  error: 'error',
  pending_auth: 'not connected',
  disabled: 'disabled',
};

/**
 * One QC gate, as v2 F.5 renders it:
 *   ✓ Copy       passed  (0 flags)
 *   ⚠ Visual     4.2/5 — "slide 4 text is close to the safe area"
 */
export function GateLine({
  gate,
  status,
  summary,
}: {
  gate: string;
  status: 'passed' | 'warning' | 'failed' | 'skipped';
  summary: string;
}) {
  const mark = status === 'passed' ? '✓' : status === 'warning' ? '!' : status === 'failed' ? '×' : '·';
  const color =
    status === 'passed'
      ? 'text-good'
      : status === 'warning'
        ? 'text-warn-ink'
        : status === 'failed'
          ? 'text-danger'
          : 'text-muted/60';

  return (
    <div className="flex items-baseline gap-2 font-mono text-xs">
      <span className={cx('w-3 shrink-0 text-center font-bold', color)}>{mark}</span>
      <span className="w-14 shrink-0 capitalize text-muted">{gate}</span>
      <span className={cx('truncate', status === 'skipped' ? 'text-muted/60' : 'text-ink')}>
        {summary}
      </span>
    </div>
  );
}

/** Score-breakdown bar used on /ideas and /analytics. */
export function MiniBar({
  value,
  max = 1,
  tone = 'info',
}: {
  value: number;
  max?: number;
  tone?: Tone;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill =
    tone === 'good' ? 'bg-good' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-danger' : 'bg-primary';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunk">
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <dt className="text-xs uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cx('mb-6 rounded-xl border px-4 py-3', TONE_STYLES[tone])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {children ? <div className="mt-1 text-sm leading-relaxed">{children}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
