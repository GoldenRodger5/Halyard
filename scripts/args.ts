/**
 * The flags, accepting both spellings of every one of them.
 *
 * §154. `--platform=x` used `=` and `--item` used a following token, so
 * `--item=<uuid>` — the spelling the sibling flag teaches — parsed as nothing
 * at all and the id was silently dropped. On `--dry-run` that prints the wrong
 * post; on `--publish` it would have posted one.
 *
 * Exported so the parsing is testable without running the script, which is the
 * only part of this file that can be.
 */
export function parseArgs(args: string[]): { itemId?: string; platform?: string } {
  const valueOf = (flag: string): string | undefined => {
    const joined = args.find((a) => a.startsWith(`${flag}=`));
    if (joined) return joined.slice(flag.length + 1) || undefined;
    const i = args.indexOf(flag);
    if (i >= 0) {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) return next;
    }
    return undefined;
  };
  return { itemId: valueOf('--item'), platform: valueOf('--platform') };
}
