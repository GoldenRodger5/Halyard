/**
 * §403. Giving `noveltyScore` something to measure.
 *
 * `scoreIdeas` weights novelty at 0.20 — frequently its largest term — and
 * computes it from `ideas.embedding`. Thirteen ideas exist and **none** has an
 * embedding, because nothing has ever written one. So every idea has always
 * taken `noveltyScore`'s unmeasured branch, and "is this the same topic we did
 * last week" has never once been asked.
 *
 * That is why briefing a subject twice returns the same recipe and the same
 * facts about it. The facts repeat because the artifact repeats; the artifact
 * repeats because the *idea* repeats; and the one guard against a repeated idea
 * was scoring a constant. §401's `avoid` list stops the researcher restating a
 * fact, which is a real fix at the wrong level — the piece should not have been
 * about the same thing in the first place.
 *
 * ## Why an embedding rather than word overlap
 *
 * Word overlap was the cheaper plan and it answers the wrong question. *"The
 * history of gluten"* and *"how bread got its stretch"* share almost no tokens
 * and are the same post. An operator reading two of those in one week sees a
 * repetition that a lexical distance would score as maximally novel — and
 * novelty that is confidently wrong is worse than novelty that is absent,
 * because the absent one is already handled honestly.
 *
 * ## Failure is unmeasured, never zero and never invented
 *
 * If the embedding call fails, the idea is stored without one and
 * `noveltyScore` returns its unmeasured neutral. That is the existing honest
 * path, and it is the reason this can be added without a fallback that makes
 * something up. A fabricated vector would rank ideas against noise while
 * looking exactly like a measurement.
 */

/** `text-embedding-3-small`: 1536 dimensions, and the cheapest thing that works. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';

export interface EmbeddingClient {
  /** One vector per input, in order. Throws rather than returning a guess. */
  embed(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingClient implements EmbeddingClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey = process.env.OPENAI_API_KEY, fetchImpl: typeof fetch = fetch) {
    const key = apiKey?.trim();
    if (!key) throw new Error('OPENAI_API_KEY is not set. Run ./scripts/doctor.');
    this.apiKey = key;
    this.fetchImpl = fetchImpl;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.fetchImpl('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!response.ok) {
      throw new Error(`embeddings ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const body = (await response.json()) as {
      data?: { index: number; embedding: number[] }[];
    };
    const data = body.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new Error(`embeddings returned ${data?.length ?? 0} vectors for ${texts.length} inputs`);
    }
    /*
     * Ordered by the index the API reports rather than by arrival. The contract
     * says they come back in order; relying on that silently mislabels every
     * vector on the day it stops being true, and a mislabelled embedding scores
     * one idea's novelty against another idea's topic.
     */
    const ordered = [...data].sort((a, b) => a.index - b.index);
    return ordered.map((d) => d.embedding);
  }
}

/**
 * What an idea is *about*, as one string to embed.
 *
 * Title and angle together, because a title alone is too short to separate
 * *"Gluten, explained"* from *"Gluten, explained"* with a wholly different
 * angle underneath it — which is two different posts.
 */
export function ideaText(idea: { title: string; angle?: string | null }): string {
  return idea.angle ? `${idea.title}. ${idea.angle}` : idea.title;
}
