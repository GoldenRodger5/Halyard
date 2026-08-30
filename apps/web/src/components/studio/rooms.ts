/**
 * §384. The seven rooms, and what each one is for.
 *
 * The single source of truth for navigation. The sidebar, the phone tab bar,
 * the slate and the "where am I" highlight all read this — three
 * implementations of "which room is this" would disagree eventually, and the
 * one that disagreed would be the one nobody looked at.
 *
 * Every name is a real term from a broadcast gallery *and* immediately obvious
 * to somebody who has never been in one. That is the test a metaphor has to
 * pass: it earns its place by making the thing easier, not more charming.
 */

export interface RoomTab {
  href: string;
  label: string;
  /** One line, on hover. What the tab is for, not what it is called. */
  hint?: string;
  /**
   * The right-hand note on the slate — what *this screen* can do without a
   * mouse.
   *
   * On the tab rather than the room, because a room's tabs do different work.
   * The Gallery's wall binds `J`/`K`; its Stock tab has no monitors to move
   * between, and advertising the keys there is the same defect as a payload
   * key nobody reads — declared, and not wired.
   *
   * Advertised keys must be bound. The Gallery says `↵ OPEN` and not
   * `A APPROVE`, because approving happens on the piece where the render and
   * the gates are visible.
   */
  detail?: string;
}

export interface Room {
  href: string;
  /** What the sidebar says. */
  label: string;
  /** The question this room answers, in the operator's words. Shown on the slate. */
  question: string;
  /** The number on the slate. Rooms are numbered because they are a sequence. */
  number: number;
  tabs: RoomTab[];
  /**
   * Whether this room is on the phone's tab bar.
   *
   * Four of the seven. The rest are reached from the Call Sheet — the phone is
   * not a subset, and every decision is still available; only the route to it
   * is one tap longer.
   */
  pocket?: boolean;
}

export const ROOMS: Room[] = [
  {
    href: '/',
    label: 'Call Sheet',
    question: 'What needs me?',
    number: 1,
    pocket: true,
    tabs: [
      { href: '/', label: 'Today', hint: 'What happened overnight, and the one thing to do now' },
      { href: '/first-run', label: 'First run', hint: 'Daily generation will not start until this is done' },
    ],
  },
  {
    href: '/floor',
    label: 'The Floor',
    question: 'What do I want to publish?',
    number: 2,
    pocket: true,
    tabs: [
      { href: '/floor', label: 'Brief', hint: 'Stand at the front of the room and brief the crew' },
      { href: '/floor/live', label: 'Live', hint: 'Watch the team work' },
      { href: '/floor/concepts', label: 'Concepts', hint: 'Be offered several directions and choose one' },
      { href: '/floor/chat', label: 'Chat', hint: 'Talk it out, then send it to the floor' },
      { href: '/floor/sources', label: 'Sources', hint: 'Ideas, hooks and the swipe file a brief can draw from' },
    ],
  },
  {
    href: '/gallery',
    label: 'Gallery',
    question: 'What needs a decision?',
    number: 3,
    pocket: true,
    tabs: [
      {
        href: '/gallery',
        label: 'Holding',
        hint: 'Everything waiting on you',
        detail: 'J / K MOVE · ↵ OPEN',
      },
      { href: '/gallery/scheduled', label: 'Scheduled', hint: 'Approved, waiting for a slot' },
      { href: '/gallery/onair', label: 'On air', hint: 'What has published, and how it did' },
      { href: '/gallery/stock', label: 'Stock', hint: 'Media, sound, submissions and social proof' },
    ],
  },
  {
    href: '/rundown',
    label: 'Rundown',
    question: 'What goes out, and when?',
    number: 4,
    tabs: [
      { href: '/rundown', label: 'This week', hint: 'The running order, by the clock' },
      { href: '/rundown/series', label: 'Series', hint: 'Recurring shapes with their own cadence' },
      { href: '/rundown/campaigns', label: 'Campaigns', hint: 'A window where the mix is allowed to change' },
      { href: '/rundown/launch', label: 'First two weeks', hint: 'The opening run for a new account' },
    ],
  },
  {
    href: '/wires',
    label: 'Wires',
    question: 'Who is talking to us?',
    number: 5,
    pocket: true,
    tabs: [
      { href: '/wires', label: 'Replies', hint: 'Drafted for you to send. Nothing sends on its own.' },
      { href: '/wires/finds', label: 'Finds', hint: 'Conversations worth joining' },
      { href: '/wires/take', label: 'Daily Take', hint: 'Your opinion, which nothing writes without' },
    ],
  },
  {
    href: '/numbers',
    label: 'Numbers',
    question: 'How is it doing, and what did it teach?',
    number: 6,
    tabs: [
      { href: '/numbers', label: 'Performance', hint: 'What the platforms reported' },
      { href: '/numbers/learned', label: 'Learned', hint: 'Beliefs computed from measured performance' },
    ],
  },
  {
    href: '/master',
    label: 'Master Control',
    question: 'Is it wired up, and does it know the product?',
    number: 7,
    tabs: [
      { href: '/master', label: 'The rig', hint: 'What is connected, and what is stopping the rest' },
      { href: '/master/rules', label: 'Platform rules', hint: 'What a review actually unlocks' },
      { href: '/master/crew', label: 'The crew', hint: 'Forty agents, and the state the Auditor derived' },
      { href: '/master/product', label: 'The product', hint: 'What Halyard believes, and what backs it' },
      { href: '/master/templates', label: 'Templates', hint: 'Every card and composition' },
      { href: '/master/system', label: 'System', hint: 'Jobs, health, the kill switch' },
    ],
  },
];

/**
 * Which room a path is in.
 *
 * Longest match wins, so `/gallery/stock` resolves through its tab rather than
 * falling to the room's own href — and a drill-down like `/gallery/abc-123`
 * still lands in the Gallery.
 */
export function roomFor(pathname: string): Room | null {
  let best: Room | null = null;
  let bestLength = -1;
  for (const room of ROOMS) {
    for (const href of [room.href, ...room.tabs.map((t) => t.href)]) {
      const hit = pathname === href || pathname.startsWith(`${href}/`);
      if (hit && href.length > bestLength) {
        best = room;
        bestLength = href.length;
      }
    }
  }
  return best;
}

/** Which tab within a room, for the underline. Longest match again. */
export function tabFor(room: Room, pathname: string): RoomTab | null {
  let best: RoomTab | null = null;
  let bestLength = -1;
  for (const tab of room.tabs) {
    const hit = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (hit && tab.href.length > bestLength) {
      best = tab;
      bestLength = tab.href.length;
    }
  }
  /* A drill-down under the room but not under any tab belongs to the first. */
  return best ?? room.tabs[0] ?? null;
}

/** The four rooms on the phone's tab bar. */
export const POCKET_ROOMS = ROOMS.filter((r) => r.pocket);
