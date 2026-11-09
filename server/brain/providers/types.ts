import type { ChatTurn } from '../contract';

export interface LLMImage { mime: string; base64: string }
export interface LLMRequest {
  system: string;
  turns: ChatTurn[];
  images?: LLMImage[];
  json?: boolean;
  maxTokens: number;
}

// ── Tool use (additive) ─────────────────────────────────────────────────────
/** Provider-neutral tool definition (JSON Schema for the input object). */
export interface LLMToolSpec { name: string; description: string; inputSchema: Record<string, unknown> }
/** One tool call requested by the model. `parseError` is set when the provider sent unparseable arguments. */
export interface LLMToolCall { id: string; name: string; input: unknown; parseError?: string }
export interface LLMToolResult { callId: string; name: string; content: string; isError?: boolean }
/** Provider-neutral conversation for a tool-using loop. `raw` keeps the provider's own assistant content for verbatim echo. */
export type AgentMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls: LLMToolCall[]; raw?: { provider: 'anthropic' | 'openai'; content: unknown } }
  | { role: 'tool'; results: LLMToolResult[] };
export interface LLMToolRequest {
  system: string;
  messages: AgentMessage[];
  tools: LLMToolSpec[];
  maxTokens: number;
}
export interface LLMToolResponse {
  text: string;
  toolCalls: LLMToolCall[];
  stop: 'tool_use' | 'end' | 'max_tokens';
  /** provider-native assistant content, to be echoed back unchanged on the next turn */
  raw?: { provider: 'anthropic' | 'openai'; content: unknown };
}
