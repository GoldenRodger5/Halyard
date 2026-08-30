/**
 * §386. The route strip makes claims about what happened to a piece, and a
 * wrong claim here is worse than no strip — it tells an operator a gate passed
 * when it never ran. These tests are mostly about the honest-absence cases.
 */
import { describe, expect, it } from 'vitest';
import { ALL_STAGES, routeFor, stopForStage } from './route';
import type { QueueItem } from '@/lib/queries';

function item(over: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 'a', platform: 'tiktok', account_handle: null, delivery_mode: null,
    delivery_external_id: null, delivery_permalink: null, delivery_manual_url: null,
    delivery_at: null, persona: 'p', format: 'quiz', category: 'c',
    body: 'Some words.', title: null, alt_text: null, hashtags: [],
    final_link_url: null, link_url: null, status: 'pending_approval',
    scheduled_at: null, qc_results: {}, claims: [], ai_components: [],
    requires_ai_label: null, disclosure_text: null, audio_mode: 'silent',
    idea_title: null, series_name: null, sequence_number: null,
    render_total: 0, render_done: 0, render_failed: 0, render_error: null,
    preview_urls: [], artifact_headline: null, edited_by_human: false,
    product_id: 'recipefix', attached_asset_ids: [], attached_urls: [],
    failed_because: null, reject_reason: null,
    ...over,
  } as QueueItem;
}

const state = (r: ReturnType<typeof routeFor>, key: string) =>
  r.stops.find((s) => s.key === key)!.state;

describe('the route strip', () => {
  it('condenses every production stage onto a stop', () => {
    /*
     * The guard against a twelfth stage being added and silently vanishing.
     * §-gotcha-1 is this shape: two lists that must agree, written apart.
     */
    const orphans = ALL_STAGES.filter((s) => stopForStage(s) === null);
    expect(orphans).toEqual([]);
  });

  it('lands every stage on a stop the strip actually draws', () => {
    const drawn = new Set(routeFor(item()).stops.map((s) => s.key));
    for (const stage of ALL_STAGES) expect(drawn.has(stopForStage(stage)!)).toBe(true);
  });

  it('reports a gate that never ran as ahead, not passed', () => {
    // Gotcha 6, in the one place an operator would read it as approval.
    expect(state(routeFor(item({ qc_results: {} })), 'gate')).toBe('ahead');
  });

  it('reports a failed gate as refused, and says which one', () => {
    const r = routeFor(
      item({ qc_results: { gates: [{ gate: 'claims', status: 'failed', summary: 'two sources 403ed' }] } }),
    );
    expect(state(r, 'gate')).toBe('refused');
    expect(r.note).toContain('claims');
    expect(r.note).toContain('two sources 403ed');
  });

  it('does not treat a skipped gate as a failure', () => {
    const r = routeFor(
      item({
        qc_results: {
          gates: [
            { gate: 'copy', status: 'passed', summary: 'ok' },
            { gate: 'audio', status: 'skipped', summary: 'nobody speaks' },
          ],
        },
      }),
    );
    expect(state(r, 'gate')).toBe('done');
  });

  it('does not treat an all-skipped gate run as a gate that passed', () => {
    /*
     * Gotcha 6 in the place it would be least visible. Every gate skipping is
     * not the gates clearing it — nothing examined this piece.
     */
    const r = routeFor(
      item({
        qc_results: {
          gates: [
            { gate: 'visual', status: 'skipped', summary: 'no media here' },
            { gate: 'audio', status: 'skipped', summary: 'nobody speaks' },
          ],
        },
      }),
    );
    expect(state(r, 'gate')).toBe('ahead');
  });

  it('counts a gate that cleared with a warning as having run', () => {
    // `warning` is a real GateStatus and means it ran and passed, with a note.
    const r = routeFor(
      item({ qc_results: { gates: [{ gate: 'copy', status: 'warning', summary: '1 warning' }] } }),
    );
    expect(state(r, 'gate')).toBe('done');
  });

  it('counts a text-only post with no renders as made, not stalled', () => {
    // An X post has nothing to render. `ahead` would read as "still working".
    expect(state(routeFor(item({ render_total: 0, body: 'hi' })), 'art')).toBe('done');
  });

  it('separates a render still running from one that failed', () => {
    expect(state(routeFor(item({ render_total: 3, render_done: 1 })), 'art')).toBe('now');
    expect(state(routeFor(item({ render_total: 3, render_done: 3, render_failed: 1 })), 'art')).toBe('refused');
  });

  it('puts a rejection at the human stop, not upstream', () => {
    const r = routeFor(item({ status: 'rejected', reject_reason: 'wrong photo' }));
    expect(state(r, 'ok')).toBe('refused');
    expect(state(r, 'gate')).toBe('ahead');
    expect(r.note).toContain('wrong photo');
  });

  it('puts a publish failure at the platform, after the human said yes', () => {
    const r = routeFor(item({ status: 'failed', failed_because: 'X returned 402' }));
    expect(state(r, 'air')).toBe('refused');
    expect(r.note).toBe('X returned 402');
  });

  it('prefers the recorded reason over one it could derive', () => {
    // §362: `failed_because` was written and read by nothing.
    const r = routeFor(
      item({
        failed_because: 'the format refused it four times',
        qc_results: { gates: [{ gate: 'copy', status: 'failed', summary: 'too long' }] },
      }),
    );
    expect(r.note).toBe('the format refused it four times');
  });

  it('says nothing when a run was clean', () => {
    const r = routeFor(
      item({
        status: 'published', claims: [{ text: 't', source: 's' }],
        render_total: 1, render_done: 1,
        qc_results: { gates: [{ gate: 'copy', status: 'passed', summary: 'ok' }] },
      }),
    );
    expect(r.note).toBeNull();
    expect(r.stops.every((s) => s.state === 'done')).toBe(true);
  });

  it('gives every stop a sentence', () => {
    for (const s of routeFor(item()).stops) expect(s.means.length).toBeGreaterThan(10);
  });
});
