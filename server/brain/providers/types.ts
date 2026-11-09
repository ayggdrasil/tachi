import type { ChatTurn } from '../contract';

export interface LLMImage { mime: string; base64: string }
export interface LLMRequest {
  system: string;
  turns: ChatTurn[];
  images?: LLMImage[];
  json?: boolean;
  maxTokens: number;
}
