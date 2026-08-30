/**
 * §391. A mark per room, for the phone's tab bar.
 *
 * The bar drew the same rounded square four times, so the only thing telling
 * the rooms apart was a 10px label — which is exactly the situation an icon
 * exists to fix. Four identical icons are worse than none: they take the space
 * a distinguishing mark would have used and give nothing back.
 *
 * Each mark is the room's own object rather than a generic symbol — a clipboard
 * for the call sheet, desks for the floor, a monitor bank for the gallery, a
 * wire for the wires. Drawn rather than fetched, and `currentColor` throughout
 * so the tab bar's own active state colours them.
 */

export function RoomIcon({ room, className }: { room: string; className?: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (room) {
    /* Call Sheet — the clipboard a production hands you each morning. */
    case '/':
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4h6v2.5H9z" />
          <path d="M9 11h6M9 15h4" />
        </svg>
      );
    /* The Floor — desks around a room. */
    case '/floor':
      return (
        <svg {...common}>
          <rect x="3" y="9" width="6" height="4.5" rx="1" />
          <rect x="15" y="9" width="6" height="4.5" rx="1" />
          <rect x="9" y="16" width="6" height="4.5" rx="1" />
          <path d="M12 3.5v3M9.5 6.5h5" />
        </svg>
      );
    /* Gallery — the monitor wall. */
    case '/gallery':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="8" height="7" rx="1.2" />
          <rect x="13" y="4" width="8" height="7" rx="1.2" />
          <rect x="3" y="13" width="8" height="7" rx="1.2" />
          <rect x="13" y="13" width="8" height="7" rx="1.2" />
        </svg>
      );
    /* Wires — a line coming in, with the message on it. */
    case '/wires':
      return (
        <svg {...common}>
          <path d="M4 17c4 0 4-10 8-10s4 10 8 10" />
          <circle cx="12" cy="7" r="2.2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      );
  }
}
