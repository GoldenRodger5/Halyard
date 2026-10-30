import { describe, expect, it } from 'vitest';
import { buildTarget, needsAiLabel } from './publish.js';

const post = (platform: 'tiktok' | 'youtube', ai_voice = false) => ({ platform, kind: 'video' as const, media: [], text: 'Hidden dairy', title: 'Hidden dairy', ai_voice });

describe('AI labels (TikTok AIGC, YouTube synthetic media)', () => {
  it('labels a silent video whose stills were generated', () => {
    const record = { assets: [{ id: 'a.jpg', provenance: 'OpenAI gpt-image, prompt: hot dog', licence: 'generated', sha256: 'x' }], posts: { tiktok: post('tiktok') } };
    expect(needsAiLabel(record)).toBe(true);
    expect(buildTarget(post('tiktok'), needsAiLabel(record)).isAiGenerated).toBe(true);
    expect(buildTarget(post('youtube'), needsAiLabel(record)).containsSyntheticMedia).toBe(true);
  });
  it('labels a synthetic voice even with licensed photos', () => {
    expect(needsAiLabel({ assets: [{ id: 'p.webp', provenance: 'recipe-fix abc:public/images/originals/x.webp', licence: 'stock', sha256: 'x' }], posts: { tiktok: post('tiktok', true) } })).toBe(true);
  });
  it('does not label licensed photos with no synthetic voice', () => {
    const record = { assets: [{ id: 'p.webp', provenance: 'recipe-fix abc:public/images/originals/x.webp', licence: 'stock', sha256: 'x' }], posts: { tiktok: post('tiktok') } };
    expect(needsAiLabel(record)).toBe(false);
    expect(buildTarget(post('tiktok'), needsAiLabel(record)).isAiGenerated).toBe(false);
  });
});
