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
}

export class RecipeFixConnector implements ProductConnector {
  readonly id = 'recipefix';
  private readonly client: Pick<McpClient, 'callToolJson' | 'listTools'>;

  constructor(options: RecipeFixConnectorOptions) {
    this.client =
      options.client ?? new McpClient({ ...options, clientName: 'halyard-recipefix-connector' });
  }

  async generateSample(spec: SampleSpec): Promise<ProductArtifact> {
    let recipe: RecipeFixAdaptation;
    try {
      recipe = await this.client.callToolJson<RecipeFixAdaptation>('adapt_recipe', {
        url: spec.params.url,
        dietary: spec.params.dietary,
        servings: spec.params.servings,
        notes: spec.intent,
      });
    } catch (err) {
      throw new ConnectorUnavailableError(this.id, (err as Error).message);
    }
    return toArtifact(recipe);
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

  async healthCheck(): Promise<ConnectorHealth> {
    const startedAt = Date.now();
    try {
      const tools = await this.client.listTools();
      const hasAdapt = tools.some((t) => t.name === 'adapt_recipe');
      return {
        ok: hasAdapt,
        detail: hasAdapt
          ? `${tools.length} tools available`
          : `Connected, but adapt_recipe is not exposed. Saw: ${tools.map((t) => t.name).join(', ')}`,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        ok: false,
        detail: (err as Error).message,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
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
