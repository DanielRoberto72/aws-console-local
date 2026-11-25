import type { FastifyInstance } from 'fastify';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { ParameterInput, SsmService } from './ssmService.js';

// Nomes de parâmetro são hierárquicos ("/app/db/url"), por isso vão no corpo ou na query.
const nameQuery = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 2048 } },
} as const;

const parameterBody = {
  type: 'object',
  required: ['name', 'type', 'value'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[a-zA-Z0-9_.\\-/]+$' },
    type: { enum: ['String', 'StringList', 'SecureString'] },
    value: { type: 'string', minLength: 1, maxLength: 8192 },
    description: { type: 'string', maxLength: 1024 },
  },
} as const;

export function ssmRoutes(app: FastifyInstance, { ssm, activity, onChange }: RouteDeps & { ssm: SsmService }): void {
  const track = createTracker(activity, 'ssm', onChange);

  app.get('/api/ssm/parameters', async () => ({ parameters: await ssm.listParameters() }));

  app.post<{ Body: ParameterInput }>('/api/ssm/parameters', { schema: { body: parameterBody } }, async (request, reply) => {
    const input = { ...request.body, description: request.body.description ?? '' };
    const version = await track('PutParameter', input.name, () => ssm.putParameter(input, false));
    return reply.status(201).send({ version });
  });

  app.put<{ Body: ParameterInput }>('/api/ssm/parameters', { schema: { body: parameterBody } }, async (request) => {
    const input = { ...request.body, description: request.body.description ?? '' };
    const version = await track('PutParameter', input.name, () => ssm.putParameter(input, true));
    return { version };
  });

  app.get<{ Querystring: { name: string } }>('/api/ssm/parameters/detail', { schema: { querystring: nameQuery } }, async (request) =>
    ssm.getParameter(request.query.name),
  );

  app.post<{ Body: { name: string } }>('/api/ssm/parameters/delete', { schema: { body: nameQuery } }, async (request) => {
    const { name } = request.body;
    await track('DeleteParameter', name, () => ssm.deleteParameter(name));
    return { ok: true };
  });
}
