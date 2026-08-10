/**
 * RecipeFix connector, over the existing MCP server (v1 §3).
 *
 * Every highlight carries a `sourcePath` pointing back into the raw artifact.
 * That path is what Gate 2 (claim verification) resolves — the whole reason
 * content built here cannot say something the product never said.
 */
import { McpClient, type McpClientOptions } from './mcpClient.js';
import {
  ConnectorUnavailableError,
  type ActivityItem,
  type ChangelogEntry,
  type ConnectorHealth,
  type Highlight,
  type ProductArtifact,
  type ProductConnector,
  type SampleSpec,
} from './types.js';

export interface RecipeFixIngredient {
  original: string | null;
  adapted: string;
  changed?: boolean;
  changeType?: string;
  changeReason?: string | null;
  alternative?: string | null;
}

export interface RecipeFixStep {
  index?: number;
  title: string;
  original_note?: string | null;
  updated_note?: string | null;
}

export interface RecipeFixToolStatus {
  name: string;
  present: boolean;
  required: boolean;
  gates: string;
}

export interface RecipeFixAdaptation {
  recipeName: string;
  sourceUrl?: string;
  dietary?: string[];
  servings?: { original?: number; adapted?: number; unit?: string };
  ingredients: RecipeFixIngredient[];
  steps: RecipeFixStep[];
  explanations?: string[];
  nutrition?: unknown;
  warnings?: string[];
}

export interface RecipeFixConnectorOptions extends Omit<McpClientOptions, 'clientName'> {
  /** Injected in tests; defaults to a real MCP client. */
  client?: Pick<McpClient, 'callToolJson' | 'listTools'>;
  /**
   * Measured, not assumed: a cold adaptation of a fresh URL completed in 26
   * seconds against the live server in August 2026, and a repeat of the same
   * URL and diet came back in under 10 because RecipeFix caches the result.
   * The 60-to-75-second figure this was originally sized against came from a
   * July audit and no longer holds.
   *
   * 90s is roughly 3.5× the measured cold path — enough headroom for a bad day,
   * and small enough that a hung call plus its one retry (180s) still fits
   * inside the generate job's 5-minute timeout with room for the rest of
   * generation. At the old 150s, two attempts consumed the entire job budget,
   * so a hung adaptation killed the job on a timeout instead of failing with a
   * reason.
   */
  adaptTimeoutMs?: number;
  /** One retry. A second failure is a real failure, not a blip. */
  adaptRetries?: number;
  /** Injected in tests so a retry does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/** Tools the health check probes, and what each one gates. */
export const RECIPEFIX_TOOLS: Array<{ name: string; required: boolean; gates: string }> = [
  { name: 'adapt_recipe', required: true, gates: 'all generated content' },
  { name: 'list_adaptation_history', required: false, gates: 'product-activity signals' },
  { name: 'estimate_nutrition', required: false, gates: 'macro callouts only' },
  { name: 'search_recipes', required: false, gates: 'idea seeding from real recipes' },
];

export class RecipeFixConnector implements ProductConnector {
  readonly id = 'recipefix';
  private readonly client: Pick<McpClient, 'callToolJson' | 'listTools'>;
  private readonly adaptTimeoutMs: number;
  private readonly adaptRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: RecipeFixConnectorOptions) {
    this.adaptTimeoutMs = options.adaptTimeoutMs ?? 90_000;
    this.adaptRetries = options.adaptRetries ?? 1;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.client =
      options.client ??
      new McpClient({
        ...options,
        timeoutMs: options.timeoutMs ?? this.adaptTimeoutMs,
        clientName: 'halyard-recipefix-connector',
      });
  }

  async generateSample(spec: SampleSpec): Promise<ProductArtifact> {
    const recipe = await this.adaptWithRetry(spec);

    // Nutrition is enrichment, never a dependency. `estimate_nutrition` returns
    // non-2xx in production today, and a post about a bread swap does not need
    // macros to be worth publishing.
    if (spec.params.withNutrition === true && !recipe.nutrition) {
      try {
        recipe.nutrition = await this.client.callToolJson('estimate_nutrition', {
          recipe: recipe.recipeName,
          ingredients: recipe.ingredients.map((i) => i.adapted),
        });
      } catch {
        // Deliberately swallowed. The artifact is still complete without it.
      }
    }

    return toArtifact(recipe);
  }

  /**
   * One retry, then give up. A 75-second call that fails twice is a real
   * outage, and burning three attempts on it delays every other draft.
   */
  private async adaptWithRetry(spec: SampleSpec): Promise<RecipeFixAdaptation> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.adaptRetries; attempt++) {
      try {
        return await this.client.callToolJson<RecipeFixAdaptation>('adapt_recipe', {
          url: spec.params.url,
          dietary: spec.params.dietary,
          servings: spec.params.servings,
          notes: spec.intent,
        });
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.adaptRetries) await this.sleep(5_000);
      }
    }

    throw new ConnectorUnavailableError(
      this.id,
      `${lastError?.message ?? 'unknown error'} (after ${this.adaptRetries + 1} attempts, ${
        this.adaptTimeoutMs / 1000
      }s timeout each)`,
    );
  }

  async listRecentActivity(since: Date): Promise<ActivityItem[]> {
    try {
      const raw = await this.client.callToolJson<{
        adaptations?: Array<{
          id: string;
          created_at: string;
          recipe_name: string;
          dietary?: string[];
        }>;
      }>('list_adaptation_history', { since: since.toISOString(), limit: 50 });

      return (raw.adaptations ?? []).map((a) => ({
        id: a.id,
        occurredAt: new Date(a.created_at),
        kind: 'adaptation',
        summary: `${a.recipe_name}${a.dietary?.length ? ` → ${a.dietary.join(', ')}` : ''}`,
        raw: a,
      }));
    } catch (err) {
      throw new ConnectorUnavailableError(this.id, (err as Error).message);
    }
  }

  async getChangelog(): Promise<ChangelogEntry[]> {
    // RecipeFix exposes no changelog tool today. Returning empty is correct and
    // honest; the signal collector simply produces nothing from this source.
    return [];
  }

  /**
   * Per-tool health, not a single boolean. `estimate_nutrition` being down is a
   * footnote; `adapt_recipe` being down stops all generation, and the health
   * page needs to say which is which.
   */
  async healthCheck(): Promise<ConnectorHealth & { tools: RecipeFixToolStatus[] }> {
    const startedAt = Date.now();
    try {
      const available = new Set((await this.client.listTools()).map((t) => t.name));

      const tools: RecipeFixToolStatus[] = RECIPEFIX_TOOLS.map((tool) => ({
        name: tool.name,
        present: available.has(tool.name),
        required: tool.required,
        gates: tool.gates,
      }));

      const missingRequired = tools.filter((t) => t.required && !t.present);
      const missingOptional = tools.filter((t) => !t.required && !t.present);

      return {
        ok: missingRequired.length === 0,
        detail:
          missingRequired.length > 0
            ? `Connected, but ${missingRequired.map((t) => t.name).join(', ')} is not exposed. Generation cannot run.`
            : missingOptional.length > 0
              ? `${available.size} tools available. Missing ${missingOptional.map((t) => t.name).join(', ')} — ${missingOptional.map((t) => t.gates).join('; ')} unavailable.`
              : `${available.size} tools available.`,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
        tools,
      };
    } catch (err) {
      return {
        ok: false,
        detail: (err as Error).message,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
        tools: RECIPEFIX_TOOLS.map((tool) => ({
          name: tool.name,
          present: false,
          required: tool.required,
          gates: tool.gates,
        })),
      };
    }
  }
}

/**
 * Map a raw adaptation into the artifact shape.
 *
 * Deliberately selective: swaps whose reason is substantive, not merely scaled;
 * step notes, which are the highest-value content in the payload; and the chef
 * explanations.
 */
export function toArtifact(recipe: RecipeFixAdaptation): ProductArtifact {
  const highlights: Highlight[] = [];

  recipe.ingredients?.forEach((ingredient, i) => {
    if (!ingredient.changed) return;
    if (!ingredient.changeReason) return;
    // "scaled" changes are arithmetic, not insight. They make dull content.
    if (ingredient.changeType === 'scaled') return;
    highlights.push({
      type: 'swap',
      sourcePath: `ingredients[${i}].changeReason`,
      before: ingredient.original ?? undefined,
      after: ingredient.adapted,
      reason: ingredient.changeReason,
      alternative: ingredient.alternative ?? null,
    });
  });

  recipe.steps?.forEach((step, i) => {
    if (!step.updated_note) return;
    highlights.push({
      type: 'technique',
      sourcePath: `steps[${i}].updated_note`,
      title: step.title,
      note: step.updated_note,
    });
  });

  recipe.explanations?.forEach((text, i) => {
    highlights.push({ type: 'chef_note', sourcePath: `explanations[${i}]`, text });
  });

  const scaled = recipe.servings?.original && recipe.servings?.adapted
    ? recipe.servings.original !== recipe.servings.adapted
    : false;

  return {
    kind: 'recipe_adaptation',
    raw: recipe,
    headline: recipe.recipeName,
    highlights,
    visualHints: [
      'transformation_diff_1x1',
      'transformation_diff_4x5',
      'carousel_6',
      ...(highlights.some((h) => h.type === 'swap') ? ['substitution_ratio'] : []),
      ...(highlights.some((h) => h.type === 'chef_note') ? ['chef_note_quote'] : []),
      ...(scaled ? ['scaling_math'] : []),
      'pinterest_tall',
      'TransformationDiff',
    ],
  };
}
