import type { FastifyInstance } from 'fastify';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { SecretsService, SecretValue } from './secretsService.js';

// Nomes de segredo podem ter "/", por isso vão no corpo ou na query string.
const nameQuery = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 512 } },
} as const;

const valueSchema = {
  oneOf: [
    { type: 'object', required: ['kind', 'value'], properties: { kind: { const: 'string' }, value: { type: 'string', maxLength: 65536 } } },
    { type: 'object', required: ['kind', 'base64'], properties: { kind: { const: 'binary' }, base64: { type: 'string', maxLength: 90000 } } },
  ],
} as const;

export function secretsRoutes(app: FastifyInstance, { secrets, activity, onChange }: RouteDeps & { secrets: SecretsService }): void {
  const track = createTracker(activity, 'secretsmanager', onChange);

  app.get('/api/secrets', async () => ({ secrets: await secrets.listSecrets() }));

  app.post<{ Body: { name: string; description?: string; value: SecretValue } }>(
    '/api/secrets',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'value'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 512, pattern: '^[a-zA-Z0-9/_+=.@-]+$' },
            description: { type: 'string', maxLength: 2048 },
            value: valueSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const { name, description = '', value } = request.body;
      await track('CreateSecret', name, () => secrets.create(name, description, value));
      return reply.status(201).send({ name });
    },
  );

  app.get<{ Querystring: { name: string } }>('/api/secrets/detail', { schema: { querystring: nameQuery } }, async (request) =>
    secrets.describe(request.query.name),
  );

  app.post<{ Body: { name: string } }>('/api/secrets/value', { schema: { body: nameQuery } }, async (request) => {
    const { name } = request.body;
    // Leitura de valor sensível: registrada no histórico, como no CloudTrail.
    return { value: await track('GetSecretValue', name, () => secrets.getValue(name)) };
  });

  app.put<{ Body: { name: string; value: SecretValue; description?: string } }>(
    '/api/secrets/value',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'value'],
          properties: { name: nameQuery.properties.name, value: valueSchema, description: { type: 'string', maxLength: 2048 } },
        },
      },
    },
    async (request) => {
      const { name, value, description } = request.body;
      await track('PutSecretValue', name, async () => {
        await secrets.putValue(name, value);
        if (description !== undefined) await secrets.updateDescription(name, description);
      });
      return { ok: true };
    },
  );

  app.post<{ Body: { name: string } }>('/api/secrets/delete', { schema: { body: nameQuery } }, async (request) => {
    const { name } = request.body;
    await track('DeleteSecret', name, () => secrets.delete(name));
    return { ok: true };
  });
}
