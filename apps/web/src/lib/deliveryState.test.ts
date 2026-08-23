/**
 * §156. The words an operator reads about where their post actually is.
 *
 * The mistake this guards against is specific: calling a private upload a
 * "draft". That sends someone to YouTube Studio to finish something that needs
 * no finishing, and hides that Halyard could have published it over the API.
 */
import { describe, expect, it } from 'vitest';
import { readDelivery, type DeliveryFields } from '../components/DeliveryState';

const base: DeliveryFields = {
  platform: 'youtube',
  status: 'awaiting_manual_publish',
  delivery_mode: null,
  delivery_external_id: null,
  delivery_permalink: null,
  delivery_manual_url: null,
};

describe('readDelivery', () => {
  it('sends the operator into the app for a native draft, and says Halyard cannot finish it', () => {
    const out = readDelivery({
      ...base,
      platform: 'tiktok',
      delivery_mode: 'draft',
      delivery_external_id: 'pub-1',
      delivery_manual_url: 'https://www.tiktok.com/upload',
    });

    expect(out.creatorActionRequired).toBe(true);
    expect(out.label).toMatch(/draft/i);
    expect(out.detail).toMatch(/only a person can finish/i);
    expect(out.href).toBe('https://www.tiktok.com/upload');
  });

  it('does not call a private upload a draft, and asks nothing of the operator', () => {
    const out = readDelivery({
      ...base,
      delivery_mode: 'private',
      delivery_external_id: 'vid-1',
      delivery_permalink: 'https://youtube.com/watch?v=vid-1',
    });

    expect(out.creatorActionRequired).toBe(false);
    expect(out.label.toLowerCase()).not.toContain('draft');
    expect(out.detail).toMatch(/not a draft/i);
    expect(out.detail).toMatch(/not public/i);
  });

  it('reports a direct post as published', () => {
    const out = readDelivery({ ...base, platform: 'x', delivery_mode: 'direct' });
    expect(out.label).toBe('Published');
    expect(out.creatorActionRequired).toBe(false);
  });

  it('says nothing was sent when nothing was, without implying a failure', () => {
    const out = readDelivery(base);
    expect(out.label).toMatch(/Halyard/);
    expect(out.detail).toMatch(/once a person approves/i);
    expect(out.href).toBeNull();
    expect(out.creatorActionRequired).toBe(false);
  });

  it('reads the delivery record, not the item status', () => {
    /*
     * A native draft and a private upload both sit at
     * `awaiting_manual_publish`. If the wording came from the status they would
     * be indistinguishable, which is the whole reason the mode is carried.
     */
    const draft = readDelivery({ ...base, delivery_mode: 'draft' });
    const priv = readDelivery({ ...base, delivery_mode: 'private' });
    expect(draft.label).not.toBe(priv.label);
    expect(draft.creatorActionRequired).not.toBe(priv.creatorActionRequired);
  });
});
