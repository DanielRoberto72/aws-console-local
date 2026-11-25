import type { FastifyInstance } from 'fastify';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { BedrockService, ConverseRequest } from './bedrockService.js';

export function bedrockRoutes(app: FastifyInstance, { bedrock, activity, onChange }: RouteDeps & { bedrock: BedrockService }): void {
  const track = createTracker(activity, 'bedrock', onChange);

  app.get('/api/bedrock/models', async () => ({ models: await bedrock.listModels() }));

  app.post<{ Body: ConverseRequest }>(
    '/api/bedrock/converse',
    {
      schema: {
        body: {
          type: 'object',
          required: ['modelId', 'messages'],
          properties: {
            modelId: { type: 'string', minLength: 1, maxLength: 256 },
            system: { type: 'string', maxLength: 20000 },
            maxTokens: { type: 'integer', minimum: 1, maximum: 64000 },
            temperature: { type: 'number', minimum: 0, maximum: 1 },
            messages: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['role', 'text'],
                properties: { role: { enum: ['user', 'assistant'] }, text: { type: 'string', minLength: 1, maxLength: 100000 } },
              },
            },
          },
        },
      },
    },
    async (request) => track('Converse', request.body.modelId, () => bedrock.converse(request.body)),
  );
}
