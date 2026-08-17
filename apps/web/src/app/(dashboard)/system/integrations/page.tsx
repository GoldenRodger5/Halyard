import { Badge, Card, EmptyState, PageHeader, PLATFORM_LABELS } from '@halyard/ui';
import type { PlatformId } from '@halyard/core';
import { query } from '@/lib/db';
import { SystemNav } from '../../agents/AgentsNav';

export const dynamic = 'force-dynamic';

interface AccountRow {
  platform: string;
  handle: string;
  persona: string;
  capability_state: string;
  capability_detail: string | null;
  transport: string | null;
  token_expires_at: string | null;
}

const TONE = {
  live: 'good',
  draft_only: 'warn',
  pending_auth: 'neutral',
  error: 'bad',
  disabled: 'neutral',
} as const;

export default async function SystemIntegrationsPage() {
  const accounts = await query<AccountRow>(
    `select platform, handle, persona, capability_state, capability_detail, transport,
            token_expires_at
       from social_accounts order by platform, persona`,
  );

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Connected accounts and what each one can actually do."
      />
      <SystemNav current="/system/integrations" />

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts connected"
          body="Connect an account on /accounts. Until then nothing can publish, and the whole publishing path is untestable against a real platform."
        />
      ) : (
        <Card className="divide-y divide-line">
          {accounts.map((a) => (
            <div
              key={`${a.platform}-${a.persona}-${a.handle}`}
              className="flex flex-wrap items-baseline justify-between gap-2 p-4"
            >
              <div>
                <p className="font-medium text-ink">
                  {PLATFORM_LABELS[a.platform as PlatformId] ?? a.platform} · {a.handle}
                </p>
                <p className="text-sm text-muted">
                  {a.persona}
                  {a.transport ? ` · via ${a.transport}` : ''}
                  {a.capability_detail ? ` · ${a.capability_detail}` : ''}
                </p>
              </div>
              <Badge tone={TONE[a.capability_state as keyof typeof TONE] ?? 'neutral'}>
                {a.capability_state.replace(/_/g, ' ')}
              </Badge>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
