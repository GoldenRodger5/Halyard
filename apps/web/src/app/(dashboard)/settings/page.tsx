import Link from 'next/link';
import { Card, PageHeader, SectionTitle } from '@halyard/ui';
import { getSettings } from '@/lib/queries';
import { setKillSwitch, setGeneration, setLogRetention, exportData } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="One toggle stops all outbound posting. It is checked at the top of every publish job, before anything else happens."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          className={`p-5 ${settings.publishing_enabled ? '' : 'border-danger/40 bg-danger/5'}`}
        >
          <SectionTitle>Kill switch</SectionTitle>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Publishing is currently{' '}
            <strong className={settings.publishing_enabled ? 'text-good' : 'text-danger'}>
              {settings.publishing_enabled ? 'enabled' : 'paused'}
            </strong>
            .{' '}
            {settings.publishing_disabled_reason
              ? `Reason on file: ${settings.publishing_disabled_reason}`
              : ''}
          </p>
          <form action={setKillSwitch} className="space-y-2">
            <input type="hidden" name="enabled" value={settings.publishing_enabled ? '0' : '1'} />
            {settings.publishing_enabled ? (
              <input
                name="reason"
                placeholder="Why are you pausing? (recorded)"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
            ) : null}
            <button
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                settings.publishing_enabled
                  ? 'border border-danger/40 text-danger hover:bg-danger/10'
                  : 'bg-primary text-white hover:bg-primary-dark'
              }`}
            >
              {settings.publishing_enabled ? 'Pause all publishing' : 'Resume publishing'}
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <SectionTitle>Log retention</SectionTitle>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            {settings.log_retention_days === null
              ? 'Everything is kept. Halyard ships no default here on purpose — how long your data is retained is your decision, not a number invented in a migration.'
              : `Finished jobs, read notifications, agent runs and capability probes are deleted after ${settings.log_retention_days} days.`}{' '}
            The audit log — what you decided, and when — is never purged.
          </p>
          <form action={setLogRetention} className="flex items-end gap-2">
            <label className="flex-1 text-xs uppercase tracking-[0.08em] text-muted">
              Days to keep
              <input
                name="days"
                type="number"
                min={1}
                max={3650}
                defaultValue={settings.log_retention_days ?? ''}
                placeholder="blank = keep everything"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
              />
            </label>
            <button className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-sunk">
              Save
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <SectionTitle>Generation</SectionTitle>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            The daily generation cron is{' '}
            <strong className={settings.generation_enabled ? 'text-good' : 'text-muted'}>
              {settings.generation_enabled ? 'on' : 'off'}
            </strong>
            . It also refuses to run while the first-run wizard is unfinished, and says so rather
            than producing generic content silently.
          </p>
          <form action={setGeneration}>
            <input type="hidden" name="enabled" value={settings.generation_enabled ? '0' : '1'} />
            <button className="w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-sunk">
              {settings.generation_enabled ? 'Pause generation' : 'Resume generation'}
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <SectionTitle>Data ownership</SectionTitle>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Platform data comes and goes; your content history should not depend on any vendor. The
            export dumps every content item, publication and metric to JSON.
          </p>
          <form action={exportData}>
            <button className="rounded-lg border border-line px-3 py-2 text-sm text-ink hover:bg-sunk">
              Export everything to JSON
            </button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Pinterest is an exception by their terms: metric rows carry a purge deadline and are
            deleted on schedule rather than kept.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle>Health</SectionTitle>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Connector status, per-account capability state and token expiry, job queue depth, failed
            jobs, last successful publish per platform, and render success rate.
          </p>
          <Link
            href="/settings/health"
            className="inline-flex rounded-lg border border-line px-3 py-2 text-sm text-ink hover:bg-sunk"
          >
            Open health page
          </Link>
        </Card>
      </div>
    </>
  );
}
