/**
 * Recording agent executions, without any agent knowing it is being recorded.
 *
 * ## Why at the client seam
 *
 * Every model-driven agent in Halyard reaches the model through one interface —
 * `LlmClient.complete` — and every request carries a `promptVersion`. The
 * registry maps prompt versions to agents. So a wrapper here can attribute a
 * run to an agent with no change to any agent, any caller, or any prompt.
 *
 * The alternative was to wrap each of the sixteen call sites in a
 * `withAgentRun(...)`. That is sixteen opportunities to forget one, and a
 * forgotten one would look exactly like an agent that never ran — the precise
 * false negative this system exists to prevent. Instrumenting the seam makes
 * coverage structural: an agent cannot call a model *without* being recorded.
 *
 * ## What it deliberately does not do
 *
 * It does not store prompts or completions. A run log holding every draft
 * becomes the largest table in the database inside a week, and the interesting
 * facts — did it run, did it work, how long, what did it cost, was the output
 * used — are all small.
 *
 * It never lets a recording failure break the agent. Telemetry that can take
 * down generation is worse than no telemetry.
 */
import type { LlmClient, LlmRequest, LlmResponse } from '../generation/llm.js';
import { agentForPromptVersion } from './registry.js';

export type RunTrigger = 'job' | 'ui_action' | 'schedule' | 'test' | 'manual' | 'unknown';
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'refused' | 'skipped';

export interface AgentRunStart {
  agentId: string;
  agentVersion: string;
  team: string;
  trigger: RunTrigger;
  triggerRef?: string | null;
  inputRef?: Record<string, unknown>;
}

export interface AgentRunFinish {
  status: RunStatus;
  outputRef?: Record<string, unknown>;
  error?: string | null;
  costUsd?: number | null;
  durationMs: number;
}

/**
 * Where run records go.
 *
 * An interface rather than a direct database call because this lives in
 * `core`, which has no database handle of its own — and because a test wants to
 * assert what *would* have been recorded without a Postgres.
 */
export interface AgentRunSink {
  begin(start: AgentRunStart): Promise<string | null>;
  finish(runId: string, finish: AgentRunFinish): Promise<void>;
}

/** Discards everything. The default, so an unwired context still works. */
export const NULL_SINK: AgentRunSink = {
  async begin() {
    return null;
  },
  async finish() {
    /* nothing */
  },
};

export interface RecordingContext {
  trigger: RunTrigger;
  triggerRef?: string | null;
}

/**
 * Wrap a client so every completion is attributed and recorded.
 *
 * A prompt version with no agent in the registry is **not** dropped silently.
 * It is recorded against a synthetic `unregistered:<version>` id, because an
 * unregistered agent running in production is a finding, and a recorder that
 * ignored it would be the one component guaranteed not to notice.
 */
export function recordingLlmClient(
  inner: LlmClient,
  sink: AgentRunSink,
  context: RecordingContext,
): LlmClient {
  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const agent = agentForPromptVersion(request.promptVersion);
      const started = Date.now();

      let runId: string | null;
      try {
        runId = await sink.begin({
          agentId: agent?.agentId ?? `unregistered:${request.promptVersion}`,
          agentVersion: agent?.version ?? '0',
          team: agent?.team ?? 'system',
          trigger: context.trigger,
          triggerRef: context.triggerRef ?? null,
          inputRef: {
            promptVersion: request.promptVersion,
            model: request.model ?? null,
            // Sizes rather than contents: enough to spot a prompt that has
            // doubled, without keeping the prompt.
            systemChars: request.system.length,
            messageCount: request.messages.length,
          },
        });
      } catch {
        // Recording must never break generation.
        runId = null;
      }

      try {
        const response = await inner.complete(request);
        if (runId) {
          await sink
            .finish(runId, {
              status: 'succeeded',
              outputRef: {
                model: response.model,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                textChars: response.text.length,
              },
              costUsd: response.costUsd,
              durationMs: Date.now() - started,
            })
            .catch(() => undefined);
        }
        return response;
      } catch (err) {
        if (runId) {
          await sink
            .finish(runId, {
              status: 'failed',
              error: (err as Error).message.slice(0, 500),
              durationMs: Date.now() - started,
            })
            .catch(() => undefined);
        }
        throw err;
      }
    },
  };
}

/**
 * Record a run for an agent that does not go through `LlmClient`.
 *
 * The vision describer is the only one today: it calls a vision endpoint
 * directly and carries no prompt version, so the seam above cannot see it.
 * Explicit instrumentation is the honest alternative to pretending the seam
 * covers everything.
 */
export async function recordAgentRun<T>(
  sink: AgentRunSink,
  start: AgentRunStart,
  work: () => Promise<T>,
  describeOutput?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const started = Date.now();
  const runId = await sink.begin(start).catch(() => null);

  try {
    const result = await work();
    if (runId) {
      await sink
        .finish(runId, {
          status: 'succeeded',
          outputRef: describeOutput?.(result) ?? {},
          durationMs: Date.now() - started,
        })
        .catch(() => undefined);
    }
    return result;
  } catch (err) {
    if (runId) {
      await sink
        .finish(runId, {
          status: 'failed',
          error: (err as Error).message.slice(0, 500),
          durationMs: Date.now() - started,
        })
        .catch(() => undefined);
    }
    throw err;
  }
}
