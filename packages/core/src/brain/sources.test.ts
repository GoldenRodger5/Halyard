/**
 * §146. Source discovery, which is what makes Product Understanding
 * product-agnostic rather than RecipeFix-shaped.
 *
 * The property under test throughout: **no source is required**, and every
 * source reports why it is or is not configured rather than being silently
 * absent.
 */
import { describe, expect, it } from 'vitest';
import { discoverEvidenceSources, hasAnyEvidenceSource } from './sources.js';

const byId = (sources: ReturnType<typeof discoverEvidenceSources>, id: string) =>
  sources.find((s) => s.id === id)!;

describe('discoverEvidenceSources', () => {
  it('supports a product that has nothing but a website', () => {
    const sources = discoverEvidenceSources(
      { id: 'kinolog', website_url: 'https://kinolog.app', connector_type: 'none' },
      {},
    );

    expect(byId(sources, 'website').configured).toBe(true);
    expect(hasAnyEvidenceSource(sources)).toBe(true);
    // Everything else is absent, and none of it blocks anything.
    expect(byId(sources, 'mcp').configured).toBe(false);
    expect(byId(sources, 'github').configured).toBe(false);
    expect(byId(sources, 'app_store').configured).toBe(false);
  });

  it('never reports MCP as required, only as available or not', () => {
    const without = discoverEvidenceSources({ id: 'kinolog', connector_type: 'none' }, {});
    expect(byId(without, 'mcp').detail).toMatch(/optional/i);
  });

  it('distinguishes MCP unchosen from MCP chosen but unset here', () => {
    /*
     * These need different actions from an operator — pick a connector, versus
     * set a variable in this environment — so they must not read the same.
     */
    const unchosen = byId(discoverEvidenceSources({ id: 'p', connector_type: 'none' }, {}), 'mcp');
    const unset = byId(discoverEvidenceSources({ id: 'p', connector_type: 'mcp' }, {}), 'mcp');

    expect(unchosen.configured).toBe(false);
    expect(unset.configured).toBe(false);
    expect(unset.detail).toContain('P_MCP_URL');
    expect(unset.detail).not.toEqual(unchosen.detail);
  });

  it('reads the env var the product names, not a fixed one', () => {
    const sources = discoverEvidenceSources(
      { id: 'kinolog', connector_type: 'mcp', connector_config: { url_env: 'KINO_MCP' } },
      { KINO_MCP: 'https://kinolog.app/mcp' },
    );
    expect(byId(sources, 'mcp').configured).toBe(true);
  });

  it('does not call a source configured because the row says so', () => {
    // Gotcha 5, in a different table: `connector_type = 'mcp'` is a stored
    // word, not a reachable server. Without the variable there is nothing here
    // to reach.
    const sources = discoverEvidenceSources({ id: 'p', connector_type: 'mcp' }, {});
    expect(byId(sources, 'mcp').configured).toBe(false);
  });

  it('requires owner, repo and a token before a repository counts', () => {
    const partial = discoverEvidenceSources(
      { id: 'p', connector_type: 'github', connector_config: { owner: 'me' } },
      { GITHUB_TOKEN: 't' },
    );
    expect(byId(partial, 'github').configured).toBe(false);

    const complete = discoverEvidenceSources(
      { id: 'p', connector_type: 'github', connector_config: { owner: 'me', repo: 'r' } },
      { GITHUB_TOKEN: 't' },
    );
    expect(byId(complete, 'github').configured).toBe(true);
  });

  it('prefers destinations over the legacy url columns', () => {
    const sources = discoverEvidenceSources(
      {
        id: 'p',
        website_url: 'https://old.example',
        destinations: { web: 'https://new.example' },
      },
      {},
    );
    expect(byId(sources, 'website').detail).toContain('https://new.example');
  });

  it('counts the operator brief as a source, not as ground truth', () => {
    const sources = discoverEvidenceSources({ id: 'p', brief_markdown: 'A film diary.' }, {});
    const brief = byId(sources, 'operator_brief');
    expect(brief.configured).toBe(true);
    expect(brief.detail).toMatch(/corroboration/i);
  });

  it('reports nothing connected when nothing is', () => {
    const sources = discoverEvidenceSources({ id: 'p', connector_type: 'none' }, {});
    expect(hasAnyEvidenceSource(sources)).toBe(false);
    // Still enumerated, so the operator sees what they could connect.
    expect(sources).toHaveLength(6);
  });

  it('names no product anywhere in what an operator is shown', () => {
    /*
     * The guard against RecipeFix leaking into generic copy. Onboarding must
     * never say "Connect your RecipeFix MCP".
     */
    const sources = discoverEvidenceSources(
      { id: 'recipefix', connector_type: 'mcp', website_url: 'https://recipefix.app' },
      { RECIPEFIX_MCP_URL: 'https://example.test/mcp' },
    );
    for (const source of sources) {
      expect(source.label.toLowerCase()).not.toContain('recipefix');
    }
  });
});
