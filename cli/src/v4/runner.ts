import { categoryScore, median } from '../score.js';
import { taskRng } from './rng.js';
import type {
  ChatMessage, ChatProvider, ChatResponse, GradeContext, Suite, TaskInstance, V4Summary, V4Task, V4TaskResult,
} from './types.js';

export const SUITE_WEIGHTS: Record<Suite, number> = {
  code: 0.18, repo: 0.12, agent: 0.25, fncall: 0.12, reason: 0.13, longdoc: 0.10, instruct: 0.10,
};

// Reasoning models think before answering; a tight cap scores their silence, not their skill.
const DEFAULT_MAX_TOKENS = 16384;
const TOOL_FOLLOW_UPS = 6;
// A tool call the server failed to parse arrives as raw chat-format text.
const RAW_TOOL_CALL = /\bto=functions\.[\w.-]+/;

async function execute(inst: TaskInstance, provider: ChatProvider, ctx: GradeContext) {
  const served: string[] = [];
  const note = (r: ChatResponse) => { if (r.servedBy) served.push(r.servedBy); };
  let tokensIn = 0;
  let tokensOut = 0;
  let latency = 0;
  const maxTokens = Math.max(inst.maxTokens ?? DEFAULT_MAX_TOKENS, provider.maxOutputTokens ?? 0);

  if (inst.kind === 'single') {
    // Some models (gpt-oss's chat format among them) emit one tool call per
    // message. Let them finish the same calls over a few turns so the grade
    // measures which calls were made, not whether they arrived in one message.
    const transcript: ChatMessage[] = [...inst.messages];
    const calls: ChatResponse['toolCalls'] = [];
    let res = await provider.chat(transcript, { tools: inst.tools, maxTokens });
    note(res);
    let turns = 1;
    tokensIn += res.tokensIn ?? 0;
    tokensOut += res.tokensOut ?? 0;
    latency += res.latencyMs;
    calls.push(...res.toolCalls);
    const prefixes = [calls.length];
    while (inst.tools?.length && res.toolCalls.length && turns <= TOOL_FOLLOW_UPS) {
      transcript.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
      for (const c of res.toolCalls) transcript.push({ role: 'tool', toolCallId: c.id, name: c.name, content: inst.toolResult?.(c) ?? '{"ok": true}' });
      res = await provider.chat(transcript, { tools: inst.tools, maxTokens });
      note(res);
      turns++;
      tokensIn += res.tokensIn ?? 0;
      tokensOut += res.tokensOut ?? 0;
      latency += res.latencyMs;
      calls.push(...res.toolCalls);
      prefixes.push(calls.length);
    }
    // Grade the calls as they stood after each turn and keep the best: credit
    // lands when the requested calls are all made, and anything the model
    // wanders into afterwards (answering an "ok") can't take it away.
    let g = await inst.grade({ ...res, toolCalls: calls.slice(0, prefixes[0]) }, ctx);
    for (const n of prefixes.slice(1)) {
      const next = await inst.grade({ ...res, toolCalls: calls.slice(0, n) }, ctx);
      if (next.score > g.score) g = next;
    }
    return { grade: g, turns, tokensIn, tokensOut, latency, text: res.text, served };
  }

  const transcript: ChatMessage[] = [...inst.messages];
  let finalText = '';
  let turns = 0;
  while (turns < inst.maxTurns) {
    turns++;
    const res = await provider.chat(transcript, { tools: inst.tools, maxTokens });
    note(res);
    tokensIn += res.tokensIn ?? 0;
    tokensOut += res.tokensOut ?? 0;
    latency += res.latencyMs;
    transcript.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
    if (res.toolCalls.length === 0) {
      finalText = res.text;
      break;
    }
    for (const call of res.toolCalls) {
      let out: string;
      try {
        out = call.invalid !== undefined ? `error: arguments were not a JSON object` : await inst.handle(call, ctx);
      } catch (e) {
        out = `error: ${(e as Error).message}`;
      }
      transcript.push({ role: 'tool', toolCallId: call.id, name: call.name, content: out });
    }
  }
  const g = await inst.grade(finalText, transcript, ctx);
  return { grade: g, turns, tokensIn, tokensOut, latency, text: finalText, served };
}

export async function runTask(task: V4Task, seed: string, provider: ChatProvider, ctx: GradeContext): Promise<V4TaskResult> {
  const inst = task.build(taskRng(seed, task.id));
  try {
    const r = await execute(inst, provider, ctx);
    return {
      task_id: task.id, suite: task.suite,
      score: Math.max(0, Math.min(1, r.grade.score)),
      detail: RAW_TOOL_CALL.test(r.text) ? `server returned an unparsed tool call; ${r.grade.detail}` : r.grade.detail,
      response: r.text.slice(0, 4000),
      turns: r.turns, latency_ms: r.latency, tokens_in: r.tokensIn, tokens_out: r.tokensOut,
      ...(r.served.length ? { served_by: r.served } : {}),
    };
  } catch (e) {
    return {
      task_id: task.id, suite: task.suite, score: 0, detail: 'provider error', response: '', turns: 0,
      latency_ms: 0, tokens_in: 0, tokens_out: 0, error: (e as Error).message,
    };
  }
}

// Quality only. Speed is reported next to the score, never folded into it.
export function summarize(results: V4TaskResult[]): Pick<V4Summary, 'pipeline_score' | 'suite_scores' | 'speed'> {
  const suites = Object.keys(SUITE_WEIGHTS) as Suite[];
  const suite_scores = {} as V4Summary['suite_scores'];
  let weighted = 0;
  let weightSum = 0;
  for (const s of suites) {
    const rs = results.filter((r) => r.suite === s);
    const c = categoryScore(rs.map((r) => ({ x: r.score * 100, withinStd: 0 })));
    suite_scores[s] = { mean: c.mean, ci_low: c.ci_low, ci_high: c.ci_high, n: c.n };
    if (c.n > 0) {
      weighted += SUITE_WEIGHTS[s] * c.mean;
      weightSum += SUITE_WEIGHTS[s];
    }
  }
  const tps = results
    .filter((r) => r.score >= 0.7 && r.tokens_out > 0 && r.latency_ms > 0)
    .map((r) => r.tokens_out / (r.latency_ms / 1000));
  return {
    pipeline_score: weightSum ? +(weighted / weightSum).toFixed(2) : 0,
    suite_scores,
    speed: {
      tps_p50: tps.length >= 3 ? +median(tps).toFixed(1) : null,
      total_tokens_out: results.reduce((a, r) => a + r.tokens_out, 0),
      wall_s: +(results.reduce((a, r) => a + r.latency_ms, 0) / 1000).toFixed(1),
    },
  };
}
