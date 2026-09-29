import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/internal/momentcircuit/render/route.ts'),
  'utf8',
);

describe('MomentCircuit speaker_switch crop contract', () => {
  it('supports speaker_switch explicitly instead of falling through to single-speaker crop', () => {
    expect(route).toContain("'speaker_switch'");
    expect(route).toContain("cropMode === 'speaker_switch'");
    expect(route).toContain("'[left][right]vstack=inputs=2,format=yuv420p[v0]'");
  });

  it('keeps both source halves in the stacked 9:16 composition', () => {
    expect(route).toContain("'[left0]crop=iw/2:ih:0:0,scale=1080:960");
    expect(route).toContain("'[right0]crop=iw/2:ih:iw/2:0,scale=1080:960");
  });

  it('fails speaker_switch on non-people families rather than silently using another layout', () => {
    expect(route).toContain("SPEAKER_SWITCH_REQUIRES_NATIVE_PEOPLE");
  });
});
