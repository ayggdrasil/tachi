// Tool registry + guarded executor (validation, audience check, timeout, error capture).
import type { LLMToolSpec } from '../brain/providers/types';
import { graphSearch } from './graph';
import { mapSearch, transitRoute } from './places';
import { reminderCreate, reminderList } from './reminders';
import type { AnyTool, ToolAudience, ToolContext, ToolOutput } from './types';
import { ToolError } from './types';
import { validate } from './validate';
import { getLocale } from '../brain/locale';

export const TOOLS: AnyTool[] = [graphSearch, transitRoute, mapSearch, reminderCreate, reminderList];
const byName = new Map(TOOLS.map(t => [t.name, t]));

export const getTool = (name: string): AnyTool | undefined => byName.get(name);
export const toolsFor = (audience: ToolAudience, names?: string[]): AnyTool[] =>
  TOOLS.filter(t => t.audiences.includes(audience) && (!names || names.includes(t.name)));
export const toLLMSpecs = (tools: AnyTool[]): LLMToolSpec[] => tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> }));
/** UI label of a tool in the active product language. */
export const toolLabel = (name: string): string => { const t = byName.get(name); return (getLocale() === 'en' ? t?.labelEn ?? t?.label : t?.label) ?? name; };

export interface ToolRun {
  ok: boolean;
  name: string;
  input: unknown;
  output?: ToolOutput;
  error?: { code: string; message: string };
  ms: number;
  /** JSON string handed back to the model */
  content: string;
}

const DEFAULT_TOOL_TIMEOUT_MS = 3000;

/** Run one tool call. Never throws: every failure becomes an error result the model (or the planner) can see. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext, opts: { allowed?: AnyTool[]; timeoutMs?: number } = {}): Promise<ToolRun> {
  const t0 = Date.now();
  const fail = (code: string, message: string): ToolRun => ({ ok: false, name, input, error: { code, message }, ms: Date.now() - t0, content: JSON.stringify({ error: code, message }) });
  const tool = (opts.allowed ?? TOOLS).find(t => t.name === name);
  if (!tool) return fail('unknown_tool', `no such tool: ${name}`);
  if (!tool.audiences.includes(ctx.audience)) return fail('forbidden', `${name} is not available here`);
  const v = validate(tool.inputSchema, input ?? {});
  if (!v.ok) return fail('invalid_input', v.errors.slice(0, 5).join('; '));
  let timer: NodeJS.Timeout | undefined;
  try {
    const output = await Promise.race([
      Promise.resolve().then(() => tool.execute(v.value, ctx)),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ToolError('unavailable', 'tool timed out')), opts.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS); }),
    ]);
    return { ok: true, name, input: v.value, output, ms: Date.now() - t0, content: JSON.stringify(output.data).slice(0, 6000) };
  } catch (e) {
    if (e instanceof ToolError) return fail(e.code, e.message);
    return fail('internal', e instanceof Error ? e.message.slice(0, 200) : String(e));
  } finally { if (timer) clearTimeout(timer); }
}

export type { AnyTool, ToolAudience, ToolContext, ToolOutput } from './types';
