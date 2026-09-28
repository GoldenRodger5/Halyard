import { Label, Pill, Sheet } from '@halyard/ui/studio';

export const dynamic = 'force-dynamic';

const ownerSteps = [
  {
    n: '01',
    title: 'Create the dedicated Google account',
    detail: 'MomentCircuit owner account only. Do not import contacts. Keep the public profile pseudonymous.',
    href: 'https://accounts.google.com/signup',
    action: 'Create Google account',
  },
  {
    n: '02',
    title: 'Create TikTok — Personal account',
    detail: 'Use MomentCircuit or the closest approved handle. Immediately disable contact/Facebook/link-based account suggestions and contact syncing.',
    href: 'https://www.tiktok.com/signup',
    action: 'Create TikTok',
  },
  {
    n: '03',
    title: 'Create Instagram — Creator account',
    detail: 'Do not add it to the same Accounts Center as personal accounts. Do not sync contacts.',
    href: 'https://www.instagram.com/accounts/emailsignup/',
    action: 'Create Instagram',
  },
  {
    n: '04',
    title: 'Create the YouTube channel',
    detail: 'Use the dedicated Google account. Public name: MomentCircuit. No personal name or photo.',
    href: 'https://www.youtube.com/create_channel',
    action: 'Create YouTube',
  },
  {
    n: '05',
    title: 'Connect socials to Content Rewards',
    detail: 'You complete OAuth/verification and accept current creator terms if prompted. This is required for campaign analytics and payouts.',
    href: 'https://contentrewards.com/creators',
    action: 'Open Content Rewards',
  },
  {
    n: '06',
    title: 'Connect socials to Blotato',
    detail: 'This is the publishing transport. Use the existing Blotato account and connect the new anonymous brand accounts.',
    href: 'https://my.blotato.com/settings',
    action: 'Open Blotato',
  },
  {
    n: '07',
    title: 'Acknowledge the CoCo source-package terms',
    detail: 'Open the official WeTransfer package and accept its Terms/Privacy acknowledgement if you are comfortable. Do not edit anything yourself.',
    href: 'https://we.tl/t-hUhMTinoPcU4oGTS',
    action: 'Open official footage',
  },
] as const;

const ready = [
  ['Brand', 'MomentCircuit positioning, handles, bios and anonymity rules are written.'],
  ['Paid lane', 'CoCo Jones is the first executable campaign; COD stays on the watchlist until its official asset host works.'],
  ['Editing', 'Growth Cut, Story Cut and Episode templates exist in the Descript workspace.'],
  ['Quality', 'Rights, brief compliance, mobile visual QA, audio, captions and anonymity are release-gated.'],
  ['Cadence', 'Launch plan is 2 masters/day, initially 1 PM + 8 PM ET, then adapt from measured performance.'],
  ['Learning', 'Daily performance review and 6-hour campaign scouting automations are active.'],
] as const;

export default function MomentCircuitLaunch() {
  return (
    <div className="flex flex-col gap-3.5">
      <Sheet tone="dark">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] font-display text-xl font-extrabold tracking-[-0.05em]"
          >
            MC
          </div>
          <div className="min-w-0 flex-1">
            <Label className="!text-dmut">MomentCircuit launch</Label>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.035em] text-white">
              Everything is staged. Accounts are the gate.
            </h1>
            <p className="mt-1.5 max-w-[72ch] text-[12.5px] leading-relaxed text-dmut">
              No more product work is required before launch. Complete the owner-only account and
              consent steps below. After that, the operator takes over source ingest, editing, QA,
              publishing preparation, measurement and iteration.
            </p>
          </div>
          <Pill tone="working">waiting on owner</Pill>
        </div>
      </Sheet>

      <div className="grid gap-3.5 lg:grid-cols-[1.15fr_0.85fr]">
        <Sheet>
          <Label>Only you do these</Label>
          <ol className="flex flex-col">
            {ownerSteps.map((step) => (
              <li
                key={step.n}
                className="grid gap-2 border-t border-rule2 py-3 first:border-t-0 first:pt-0 sm:grid-cols-[2rem_1fr_auto] sm:items-center"
              >
                <span className="font-data text-[10px] text-quiet">{step.n}</span>
                <span>
                  <span className="block text-[13px] font-semibold text-sink">{step.title}</span>
                  <span className="mt-0.5 block max-w-[68ch] text-[11.5px] leading-relaxed text-quiet">
                    {step.detail}
                  </span>
                </span>
                <a
                  href={step.href}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit rounded-lg border border-rule2 bg-sheet px-2.5 py-1.5 text-[11px] font-medium text-sink transition-colors hover:border-sink"
                >
                  {step.action}
                </a>
              </li>
            ))}
          </ol>
        </Sheet>

        <div className="flex flex-col gap-3.5">
          <Sheet tone="cool">
            <Label>Already ready</Label>
            <ul className="flex flex-col gap-2">
              {ready.map(([title, detail]) => (
                <li key={title} className="flex gap-2">
                  <span className="pt-px font-data text-[11px] text-passed">✓</span>
                  <span>
                    <span className="block text-[12.5px] font-semibold text-sink">{title}</span>
                    <span className="block text-[11.5px] leading-relaxed text-quiet">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Sheet>

          <Sheet tone="lit">
            <Label>First money test</Label>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold tracking-[-0.025em]">CoCo Jones</span>
              <Pill tone="ready">source live</Pill>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-quiet">
              First production order: How They Met → Tennis Confidence → Street Runway → Purple
              Suit. The real footage decides which concepts survive.
            </p>
          </Sheet>

          <Sheet>
            <Label>Watchlist</Label>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">Call of Duty MW4 / Warzone</span>
              <Pill tone="holding">asset link broken</Pill>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-quiet">
              Economics are attractive, but the official MediaSilo source currently returns “This
              link could not be found.” Campaign Scout is watching for repair or replacement.
            </p>
          </Sheet>
        </div>
      </div>

      <Sheet>
        <Label>Launch cadence</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="font-data text-[10px] uppercase tracking-[0.08em] text-quiet">13:00 ET</div>
            <div className="mt-1 text-[13px] font-semibold">Exploration slot</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-quiet">
              Test hooks, niches and formats without treating the slot as sacred.
            </p>
          </div>
          <div>
            <div className="font-data text-[10px] uppercase tracking-[0.08em] text-quiet">20:00 ET</div>
            <div className="mt-1 text-[13px] font-semibold">Primary slot</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-quiet">
              Initial evening anchor. It will move when MomentCircuit has enough real data.
            </p>
          </div>
          <div>
            <div className="font-data text-[10px] uppercase tracking-[0.08em] text-quiet">After data</div>
            <div className="mt-1 text-[13px] font-semibold">Adaptive schedule</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-quiet">
              Daily review learns which slot × niche × format combinations actually earn reach,
              follows and payout.
            </p>
          </div>
        </div>
      </Sheet>

      <Sheet tone="onair">
        <Label>The handoff</Label>
        <p className="font-display text-[16px] font-semibold tracking-[-0.02em]">
          When those owner steps are finished, say: “MomentCircuit accounts are created.”
        </p>
        <p className="mt-1.5 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
          Include the final handles only if they differ from MomentCircuit. From that point, account
          setup stops being your job. The next action is footage ingest and first-video production.
        </p>
      </Sheet>
    </div>
  );
}
