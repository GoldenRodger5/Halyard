import { describe, expect, it } from 'vitest';
import { fetchPinterestTrends } from './sources.js';

describe('Pinterest trend ingestion', () => {
  it('preserves official growth fields and turns WoW growth into bounded velocity', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          trends: [
            {
              keyword: 'high protein breakfast',
              pct_growth_wow: 30,
              pct_growth_mom: 100,
              pct_growth_yoy: 10,
              time_series: {
                '2026-09-14': 70,
                '2026-09-21': 82,
              },
            },
            {
              keyword: 'unrelated nails',
              pct_growth_wow: 500,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const hits = await fetchPinterestTrends('protein', {
      accessToken: 'token',
      fetchImpl,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      source: 'pinterest',
      title: 'high protein breakfast',
      question: false,
      trend: {
        pctGrowthWow: 30,
        pctGrowthMom: 100,
        pctGrowthYoy: 10,
        velocity: 0.3,
      },
    });
    expect(hits[0]!.trend!.timeSeries).toEqual({
      '2026-09-14': 70,
      '2026-09-21': 82,
    });
  });

  it('uses the time series when explicit growth is unavailable', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          trends: [
            {
              keyword: 'overnight oats',
              time_series: {
                '2026-09-14': 50,
                '2026-09-21': 55,
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const [hit] = await fetchPinterestTrends('oats', {
      accessToken: 'token',
      fetchImpl,
    });

    expect(hit!.trend!.velocity).toBeCloseTo(0.1, 5);
  });
});
