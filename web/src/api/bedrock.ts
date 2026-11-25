import { json, request } from './http';

export interface FoundationModel {
  id: string;
  name: string;
  provider: string;
  inputModalities: string[];
  outputModalities: string[];
  streaming: boolean;
  status: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConverseResult {
  text: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
}

export const bedrockApi = {
  models: (signal?: AbortSignal) => request<{ models: FoundationModel[] }>('/api/bedrock/models', { signal }),
  converse: (body: { modelId: string; messages: ChatMessage[]; system?: string; maxTokens?: number; temperature?: number }) =>
    request<ConverseResult>('/api/bedrock/converse', { method: 'POST', body: json(body) }),
};
