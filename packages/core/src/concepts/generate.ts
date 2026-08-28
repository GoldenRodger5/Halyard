/**
 * The Concept Generator — several materially different directions, not one. §218.
 *
 * Halyard could take an idea and write a post. What it could not do is the
 * thing a creative team does before anyone opens an editor: propose three or
 * four genuinely different ways to tell the same subject, argue for each, and
 * let a person choose.
 *
 * ## Why a model here
 *
 * Writing a premise is writing, which the governing rule assigns to a model.
 * The half that stays deterministic is everything after: `scoreConcepts` weighs
 * evidence availability, novelty against this account, objective fit and what
 * performance established, and `conceptDiversity` checks whether the batch is
 * actually varied. A model that ranked its own output would be grading its own
 * work — the same reason `review_media` runs on a different provider.
 *
 * ## The failure this is built against
 *
 * A generator asked for five concepts will happily return five phrasings of
 * one. The prompt names that failure explicitly, requires a distinct treatment
 * per concept, and `conceptDiversity` measures the result — because a prompt
 * instruction is followed most of the time and a check is followed every time.
 *
 * ## Evidence requirements are part of the concept
 *
 * A concept that needs product footage says so, and `scoreConcepts` scores it
 * zero when no capture exists. Discovering that three stages later — after a
 * brief, a script and a render — is how a pipeline wastes an afternoon.
 */
import { STRATEGY_MODEL, asArray, asString, extractJson, type LlmClient } from '../generation/llm.js';
import type { Concept, ConceptObjective, EvidenceRequirement } from './score.js';

export const CONCEPT_PROMPT_VERSION = 'concept_generator.v1';

const OBJECTIVES: ConceptObjective[] = [
  'awareness',
  'engagement',
  'education',
  'traffic',
  'conversion',
  'retention',
  'follower_growth',
  'product_promotion',
];

/** Treatments a concept may ask for. Mirrors `CreativeType`. */
const TREATMENTS = [
  'before_after',
  'how_to',
  'process_montage',
  'listicle',
  'comparison',
  'myth_fact',
  'feature_demo',
];

export interface ConceptRequest {
  /** What the operator asked for, or what discovery surfaced. */
  intent: string;
  productName: string;
  productBrief: string;
  /** Verified capabilities the concept may build on. Nothing else may be claimed. */
  verifiedFacts: string[];
  /** Platforms in play, so `platformIntent` means something. */
  platforms: string[];
  /** Treatments recently used, so the generator can be told to avoid them. */
  recentTreatments: string[];
  /** Whether a usable product capture exists, so it can plan for one honestly. */
  hasProductCapture: boolean;
  objective?: ConceptObjective | null;
  /** How many to ask for. The scorer discards most. */
  count?: number;
}

export interface ConceptBatch {
  concepts: Concept[];
  promptVersion: string;
  costUsd: number;
  /** Concepts the model returned that could not be parsed into the contract. */
  malformed: number;
}

export function buildConceptPrompt(request: ConceptRequest): { system: string; user: string } {
  const count = request.count ?? 4;

  const system = `You are the creative director for ${request.productName}'s social accounts.

Your job is to propose ${count} materially DIFFERENT ways to tell one subject —
not ${count} rewordings of the same idea. Two concepts that share a premise and
differ only in phrasing are one concept, and returning them wastes the
operator's time.

WHAT MAKES CONCEPTS DIFFERENT
- Different treatment (a how-to is not a myth-bust is not a demo).
- Different premise — the actual claim or story, not the topic.
- Different emotional angle — curiosity, relief, surprise, recognition.
- Different objective where it genuinely fits.

TREATMENTS AVAILABLE
${TREATMENTS.join(', ')}

Use a different treatment for each concept.

EVIDENCE — THIS IS NOT OPTIONAL
You may only build on what is verified below. If a concept needs something the
account may not have, declare it in evidence_requirements and it will be scored
accordingly rather than silently failing later.

  product_capture — needs real footage of the product being used
  verified_fact   — needs a verified product capability, listed below
  owned_image     — needs photography the account owns
  metric          — needs measured performance data
  none            — needs nothing external

${request.hasProductCapture ? 'A usable product capture exists.' : 'NO product capture exists. A concept requiring one will score zero.'}

Never invent a product capability. Never describe product behaviour that is not
in the verified list.

VOICE
Specific over clever. No "here's why", no fake enthusiasm, no exclamation marks,
no "game-changer". Write like someone who knows the subject talking to someone
who also cooks.`;

  const user = `SUBJECT
${request.intent}

PRODUCT
${request.productBrief}

VERIFIED CAPABILITIES — the only product behaviour you may reference
${request.verifiedFacts.length > 0 ? request.verifiedFacts.map((f) => `- ${f}`).join('\n') : '- (none verified yet; do not describe product behaviour)'}

PLATFORMS IN PLAY
${request.platforms.join(', ')}

TREATMENTS USED RECENTLY ON THIS ACCOUNT — avoid these
${request.recentTreatments.length > 0 ? request.recentTreatments.join(', ') : '(none)'}

${request.objective ? `OBJECTIVE\nThe strategy for this piece is "${request.objective}". At least two concepts should serve it.` : ''}

OUTPUT — reply with this JSON and nothing else:
{
  "concepts": [
    {
      "title": "short, specific, not a headline",
      "premise": "one or two sentences: the actual claim or story",
      "hook": "the opening line, 8 words or fewer",
      "audience": "who this is for",
      "objective": "one of: ${OBJECTIVES.join(' | ')}",
      "emotional_angle": "curiosity | relief | surprise | recognition | delight",
      "treatment": "one of: ${TREATMENTS.join(' | ')}",
      "platform_intent": ["the platforms this genuinely suits"],
      "differentiation": "why this rather than the others you are returning",
      "retention_strategy": "what keeps someone watching past three seconds",
      "evidence_requirements": [
        {"kind": "none | product_capture | verified_fact | owned_image | metric",
         "detail": "what specifically is needed"}
      ]
    }
  ]
}`;

  return { system, user };
}

/** Narrow a model's free text onto the contract, dropping what does not fit. */
function toConcept(raw: unknown): Concept | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const title = asString(r.title);
  const premise = asString(r.premise);
  const treatment = asString(r.treatment);
  if (!title || !premise || !treatment) return null;
  if (!TREATMENTS.includes(treatment)) return null;

  const objective = asString(r.objective) as ConceptObjective;
  if (!OBJECTIVES.includes(objective)) return null;

  const requirements: EvidenceRequirement[] = asArray(r.evidence_requirements)
    .map((e) => {
      const item = e as Record<string, unknown>;
      const kind = asString(item?.kind) as EvidenceRequirement['kind'];
      const detail = asString(item?.detail);
      if (!['none', 'product_capture', 'verified_fact', 'owned_image', 'metric'].includes(kind)) {
        return null;
      }
      return { kind, detail: detail || kind };
    })
    .filter((e): e is EvidenceRequirement => e !== null);

  return {
    title,
    premise,
    hook: asString(r.hook) || null,
    audience: asString(r.audience) || null,
    objective,
    emotionalAngle: asString(r.emotional_angle) || null,
    treatment,
    platformIntent: asArray(r.platform_intent)
      .map((p) => asString(p))
      .filter((p): p is string => Boolean(p)),
    differentiation: asString(r.differentiation) || null,
    /* An empty requirement list means "needs nothing", stated rather than
       assumed — the model omitting the field is not the same claim. */
    evidenceRequirements: requirements.length > 0 ? requirements : [{ kind: 'none', detail: 'Nothing external needed.' }],
    retentionStrategy: asString(r.retention_strategy) || null,
  };
}

export async function generateConcepts(
  request: ConceptRequest,
  llm: LlmClient,
): Promise<ConceptBatch> {
  const prompt = buildConceptPrompt(request);

  const response = await llm.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    /* Strategy-grade: these decisions shape everything downstream, and a cheap
       model that returns four rewordings costs more than it saves. */
    model: STRATEGY_MODEL,
    maxTokens: 3000,
    promptVersion: CONCEPT_PROMPT_VERSION,
  });

  const parsed = extractJson(response.text) as { concepts?: unknown[] } | null;
  const candidates = asArray(parsed?.concepts);

  const concepts: Concept[] = [];
  let malformed = 0;
  for (const candidate of candidates) {
    const concept = toConcept(candidate);
    if (concept) concepts.push(concept);
    else malformed += 1;
  }

  return {
    concepts,
    promptVersion: CONCEPT_PROMPT_VERSION,
    costUsd: response.costUsd,
    malformed,
  };
}
