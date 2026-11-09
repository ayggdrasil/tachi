// Agentic tool loop: plan → call tools → observe → verify → final answer. Provider-neutral; the caller supplies `turn`.
import { pad2 } from '../../shared/constants';
import type { PrivacyCategory, User } from '../../shared/types';
import { executeTool, toLLMSpecs, toolLabel, type AnyTool, type ToolContext, type ToolRun } from '../tools';
import { extractJson } from './llm';
import type { AgentMessage, LLMToolRequest, LLMToolResponse } from './providers/types';

export type AgentTurnFn = (req: LLMToolRequest, opts: { signal: AbortSignal; timeoutMs: number }) => Promise<LLMToolResponse>;

export interface AgentStep {
  i: number;
  kind: 'tool' | 'draft' | 'verify' | 'error';
  name?: string;
  input?: unknown;
  ok?: boolean;
  summary: string;
  ms: number;
  run?: ToolRun;
}

export interface AgentProvenance { memoryIds: string[]; categories: PrivacyCategory[] }

export interface AgentOutcome {
  ok: boolean;
  answer?: string;
  /** why the loop gave up (the orchestrator then falls back to the state machine) */
  reason?: 'max_steps' | 'deadline' | 'provider_error' | 'refusal' | 'invalid_output' | 'verify_failed' | 'no_plan' | 'offline' | 'aborted';
  detail?: string;
  steps: AgentStep[];
  /** Korean labels of tools that ran successfully, in order (for the "타치가 확인한 것" line) */
  toolsUsed: string[];
  provenance: AgentProvenance;
  /** a state-changing tool succeeded (invite sent, reminder set) — the answer must reflect it even if the loop failed */
  mutated: boolean;
}

export interface AgentConfig {
  turn: AgentTurnFn;
  tools: AnyTool[];
  toolCtx: ToolContext;
  system: string;
  goal: string;
  maxSteps?: number;          // model turns (default 6)
  stepTimeoutMs?: number;     // per model call (default 12s)
  toolTimeoutMs?: number;     // per tool call (default 3s)
  deadlineMs?: number;        // whole loop (default 25s)
  verify?: boolean;           // final self-check turn when tools were used (default true)
  maxTokens?: number;
  log?: (step: AgentStep) => void;
}

const VERIFY_PROMPT = [
  '[검증 단계] 방금 쓴 답을 보내기 전에 점검하세요.',
  '1) 사용자의 목표를 모두 이뤘나요? 2) 모든 사실(시간·장소·이름·숫자)이 도구 결과와 일치하나요? 3) 비공개 정보는 빠졌나요?',
  '부족하면 필요한 도구를 더 호출해도 됩니다. 다 됐으면 도구 없이 JSON 하나만 답하세요:',
  '{"verified": true, "answer": "<최종 답, 해요체 1~3문장>"} — 목표를 이룰 수 없으면 {"verified": false, "answer": "<솔직한 안내>"}',
].join('\n');

export function emptyOutcome(reason: AgentOutcome['reason'], detail?: string): AgentOutcome {
  return { ok: false, reason, detail, steps: [], toolsUsed: [], provenance: { memoryIds: [], categories: [] }, mutated: false };
}

/** Collect labels / provenance / mutation from tool steps. */
export function summarize(steps: AgentStep[], tools: AnyTool[]): Pick<AgentOutcome, 'toolsUsed' | 'provenance' | 'mutated'> {
  const ok = steps.filter(s => s.kind === 'tool' && s.ok && s.run);
  const labels: string[] = [];
  const memoryIds = new Set<string>();
  const categories = new Set<PrivacyCategory>();
  let mutated = false;
  for (const s of ok) {
    const l = toolLabel(s.name!);
    if (!labels.includes(l)) labels.push(l);
    s.run!.output?.provenance?.memoryIds?.forEach(id => memoryIds.add(id));
    s.run!.output?.provenance?.categories?.forEach(c => categories.add(c));
    const t = tools.find(x => x.name === s.name);
    const created = (s.run!.output?.data as { created?: boolean } | undefined)?.created;
    if (t?.mutates && created !== false) mutated = true;
  }
  return { toolsUsed: labels, provenance: { memoryIds: [...memoryIds], categories: [...categories] }, mutated };
}

const cleanAnswer = (s: string): string => s.replace(/\*\*|__|^#+\s*/gm, '').replace(/\s+\n/g, '\n').trim().slice(0, 500);

export async function runAgentLoop(cfg: AgentConfig): Promise<AgentOutcome> {
  const maxSteps = cfg.maxSteps ?? 6;
  const deadline = Date.now() + (cfg.deadlineMs ?? 25_000);
  const stepTimeout = cfg.stepTimeoutMs ?? 12_000;
  const wantVerify = cfg.verify !== false;
  const specs = toLLMSpecs(cfg.tools);
  const messages: AgentMessage[] = [{ role: 'user', text: cfg.goal }];
  const steps: AgentStep[] = [];
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), Math.max(0, deadline - Date.now()));
  let i = 0;
  let verifying = false;
  let verifyRounds = 0;
  let draft: string | undefined;
  const record = (s: Omit<AgentStep, 'i'>) => { const st = { ...s, i: steps.length }; steps.push(st); cfg.log?.(st); return st; };
  const done = (o: Partial<AgentOutcome> & { ok: boolean }): AgentOutcome => {
    clearTimeout(killer);
    return { ...o, steps, ...summarize(steps, cfg.tools) };
  };
  const usedTools = () => steps.some(s => s.kind === 'tool');

  try {
    while (i < maxSteps) {
      const left = deadline - Date.now();
      if (left <= 200) return done({ ok: false, reason: 'deadline' });
      i++;
      const t0 = Date.now();
      let res: LLMToolResponse;
      try {
        res = await cfg.turn({ system: cfg.system, messages, tools: specs, maxTokens: cfg.maxTokens ?? 1500 }, { signal: ctrl.signal, timeoutMs: Math.min(stepTimeout, left) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        record({ kind: 'error', summary: msg.slice(0, 160), ms: Date.now() - t0 });
        if (ctrl.signal.aborted || Date.now() >= deadline) return done({ ok: false, reason: 'deadline', detail: msg });
        const refusal = (e as { reason?: string })?.reason === 'refusal';
        return done({ ok: false, reason: refusal ? 'refusal' : 'provider_error', detail: msg });
      }
      messages.push({ role: 'assistant', text: res.text || undefined, toolCalls: res.toolCalls, raw: res.raw });

      if (res.toolCalls.length) {
        // run this turn's calls (in parallel) and return ALL results in one tool message
        const runs = await Promise.all(res.toolCalls.map(c => c.parseError
          ? Promise.resolve<ToolRun>({ ok: false, name: c.name, input: c.input, error: { code: 'invalid_input', message: c.parseError }, ms: 0, content: JSON.stringify({ error: 'invalid_input', message: c.parseError }) })
          : executeTool(c.name, c.input, cfg.toolCtx, { allowed: cfg.tools, timeoutMs: cfg.toolTimeoutMs })));
        runs.forEach(r => record({
          kind: 'tool', name: r.name, input: r.input, ok: r.ok, ms: r.ms, run: r,
          summary: r.ok ? r.output!.summary : `${r.error!.code}: ${r.error!.message}`.slice(0, 160),
        }));
        messages.push({ role: 'tool', results: res.toolCalls.map((c, k) => ({ callId: c.id, name: c.name, content: runs[k].content, isError: !runs[k].ok })) });
        verifying = false; // new evidence → the next text is a fresh draft
        continue;
      }

      if (res.stop === 'max_tokens') return done({ ok: false, reason: 'invalid_output', detail: 'max_tokens' });
      const text = res.text.trim();
      if (!verifying) {
        if (!text) return done({ ok: false, reason: 'invalid_output', detail: 'empty answer' });
        draft = text;
        record({ kind: 'draft', summary: text.slice(0, 120), ms: Date.now() - t0 });
        if (!wantVerify || !usedTools()) return done({ ok: true, answer: cleanAnswer(text) });
        if (verifyRounds >= 2) return done({ ok: true, answer: cleanAnswer(text) });
        verifying = true; verifyRounds++;
        messages.push({ role: 'user', text: VERIFY_PROMPT });
        continue;
      }
      // verification answer
      let v: { verified?: unknown; answer?: unknown };
      try { v = extractJson(text) as typeof v; } catch { record({ kind: 'verify', ok: false, summary: 'unparseable verification', ms: Date.now() - t0 }); return done({ ok: false, reason: 'invalid_output', detail: 'verification was not JSON' }); }
      const answer = typeof v.answer === 'string' && v.answer.trim() ? v.answer.trim() : draft;
      record({ kind: 'verify', ok: v.verified === true, summary: `${v.verified === true ? 'verified' : 'not verified'}: ${String(answer).slice(0, 100)}`, ms: Date.now() - t0 });
      if (v.verified === true && answer) return done({ ok: true, answer: cleanAnswer(answer) });
      return done({ ok: false, reason: 'verify_failed', detail: String(answer ?? '').slice(0, 200) });
    }
    return done({ ok: false, reason: 'max_steps' });
  } finally { clearTimeout(killer); }
}

// ── prompt ───────────────────────────────────────────────────────────────────
export function agentSystemPrompt(p: { audience: 'senior' | 'family'; senior: User; asker: User; users: User[]; now: Date }): string {
  const d = p.now;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const today = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}(${DOW[d.getDay()]}) ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const roster = p.users.filter(u => u.id !== 'tachi').map(u => `${u.id}=${u.name}(${u.relation})`).join(', ');
  const who = p.audience === 'senior'
    ? `지금 대화 상대는 어머님 ${p.senior.name}(${p.senior.persona ?? ''})이에요. 어머님께 해요체로, 쉬운 말로 짧게(1~3문장) 답하세요.`
    : `지금 가족방에서 ${p.asker.name}(${p.asker.relation})이 물었어요. 어머님은 '어머님'(손주에게는 '할머님')으로 부르고, 해요체로 짧게(1~3문장) 답하세요.`;
  return [
    '당신은 타치, 어르신의 기억을 지키고 가족을 잇는 따뜻한 AI 동반자예요.',
    who,
    `현재 시각: ${today} (모든 시간은 한국 현지 시각, ISO는 오프셋 없이 "YYYY-MM-DDTHH:MM"으로 쓰세요).`,
    `사용자 id: ${roster}.`,
    '일하는 방식: 먼저 무엇을 확인해야 할지 계획하고, 도구로 사실을 확인한 뒤 답하세요. 도구 결과에 없는 사실은 지어내지 마세요.',
    '도구가 오류를 돌려주면 입력을 고쳐 한 번 더 시도하거나, 할 수 없다고 솔직히 말하세요.',
    '비공개 정보(비공개 일정 내용, 공개하지 않은 추억이나 건강 정보)는 절대 말하지 마세요. 도구가 "바쁨"으로만 준 일정은 바쁘다고만 말하세요.',
    '일정 초대나 알림 등록처럼 무언가를 바꾸는 도구는 사용자가 분명히 원할 때만 쓰세요.',
    '마크다운, 목록 기호, 이모지는 쓰지 마세요.',
  ].join('\n');
}
