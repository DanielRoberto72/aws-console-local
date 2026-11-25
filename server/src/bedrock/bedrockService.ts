import { ListFoundationModelsCommand, type BedrockClient } from '@aws-sdk/client-bedrock';
import { ConverseCommand, type BedrockRuntimeClient, type Message } from '@aws-sdk/client-bedrock-runtime';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConverseRequest {
  modelId: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Sem estado a persistir: modelos são um catálogo fixo do emulador e o Converse
 * responde um texto padrão (o emulador não executa modelos de linguagem).
 */
export class BedrockService {
  constructor(
    private readonly bedrock: BedrockClient,
    private readonly runtime: BedrockRuntimeClient,
  ) {}

  async listModels() {
    const { modelSummaries = [] } = await this.bedrock.send(new ListFoundationModelsCommand({}));
    return modelSummaries.map((m) => ({
      id: m.modelId ?? '',
      name: m.modelName ?? m.modelId ?? '',
      provider: m.providerName ?? '',
      inputModalities: m.inputModalities ?? [],
      outputModalities: m.outputModalities ?? [],
      streaming: m.responseStreamingSupported ?? false,
      status: m.modelLifecycle?.status ?? null,
    }));
  }

  async converse(request: ConverseRequest) {
    const started = Date.now();
    const messages: Message[] = request.messages.map((m) => ({ role: m.role, content: [{ text: m.text }] }));
    const result = await this.runtime.send(
      new ConverseCommand({
        modelId: request.modelId,
        messages,
        system: request.system ? [{ text: request.system }] : undefined,
        inferenceConfig: { maxTokens: request.maxTokens, temperature: request.temperature },
      }),
    );
    const text = (result.output?.message?.content ?? []).map((c) => c.text ?? '').join('');
    return {
      text,
      stopReason: result.stopReason ?? null,
      usage: {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
      },
      latencyMs: result.metrics?.latencyMs ?? Date.now() - started,
    };
  }
}
