import type { ReactNode } from 'react';

/**
 * Shared shell for the public legal pages.
 *
 * These sit outside the `(dashboard)` group, so they carry no operator layout
 * and need no session — Meta's reviewers must be able to open them while signed
 * out, and a page that redirects to a login screen fails App Review.
 */
export const UPDATED = '19 August 2026';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-muted">Halyard</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {updated}.</p>
      <div className="mt-10 space-y-8">{children}</div>
      <p className="mt-16 border-t border-line pt-6 text-sm text-muted">
        <a className="underline" href="/privacy">
          Privacy
        </a>{' '}
        ·{' '}
        <a className="underline" href="/terms">
          Terms
        </a>{' '}
        ·{' '}
        <a className="underline" href="/data-deletion">
          Data deletion
        </a>
      </p>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-medium text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}
