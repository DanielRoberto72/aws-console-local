import type { FastifyInstance } from 'fastify';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { FunctionCode, FunctionSettings, LambdaService } from './lambdaService.js';

const nameParams = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;

const codeSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'content'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 256 }, content: { type: 'string' } },
      },
    },
    zipBase64: { type: 'string', minLength: 1 },
  },
  oneOf: [{ required: ['files'] }, { required: ['zipBase64'] }],
} as const;

const settingsProperties = {
  handler: { type: 'string', minLength: 1, maxLength: 128 },
  role: { type: 'string', maxLength: 2048 },
  memorySize: { type: 'integer', minimum: 128, maximum: 10240 },
  timeout: { type: 'integer', minimum: 1, maximum: 900 },
  description: { type: 'string', maxLength: 256 },
  environment: { type: 'object', additionalProperties: { type: 'string' } },
} as const;

export function lambdaRoutes(app: FastifyInstance, { lambda, activity, onChange }: RouteDeps & { lambda: LambdaService }): void {
  const track = createTracker(activity, 'lambda', onChange);

  app.get('/api/lambda/functions', async () => ({ functions: await lambda.listFunctions() }));

  type CreateBody = Pick<FunctionSettings, 'runtime' | 'handler' | 'memorySize' | 'timeout'> &
    Partial<Pick<FunctionSettings, 'role' | 'description' | 'environment'>> & { name: string; code: FunctionCode };

  app.post<{ Body: CreateBody }>(
    '/api/lambda/functions',
    {
      bodyLimit: 60 * 1024 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'runtime', 'handler', 'memorySize', 'timeout', 'code'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' },
            runtime: { type: 'string', minLength: 1 },
            ...settingsProperties,
            code: codeSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const { name, code, role = '', description = '', environment = {}, ...settings } = request.body;
      await track('CreateFunction', name, () => lambda.createFunction(name, { ...settings, role, description, environment }, code));
      return reply.status(201).send({ name });
    },
  );

  app.get<{ Params: { name: string } }>('/api/lambda/functions/:name', { schema: { params: nameParams } }, async (request) =>
    lambda.getFunction(request.params.name),
  );

  app.put<{ Params: { name: string }; Body: FunctionCode }>(
    '/api/lambda/functions/:name/code',
    { bodyLimit: 60 * 1024 * 1024, schema: { params: nameParams, body: codeSchema } },
    async (request) => {
      const { name } = request.params;
      await track('UpdateFunctionCode', name, () => lambda.updateCode(name, request.body));
      return { ok: true };
    },
  );

  app.put<{ Params: { name: string }; Body: Omit<FunctionSettings, 'runtime'> }>(
    '/api/lambda/functions/:name/configuration',
    {
      schema: {
        params: nameParams,
        body: { type: 'object', required: ['handler', 'memorySize', 'timeout'], properties: settingsProperties },
      },
    },
    async (request) => {
      const { name } = request.params;
      const { environment = {}, description = '', ...rest } = request.body;
      await track('UpdateFunctionConfiguration', name, () =>
        lambda.updateConfiguration(name, { ...rest, environment, description }),
      );
      return { ok: true };
    },
  );

  app.delete<{ Params: { name: string } }>('/api/lambda/functions/:name', { schema: { params: nameParams } }, async (request, reply) => {
    const { name } = request.params;
    await track('DeleteFunction', name, () => lambda.deleteFunction(name));
    return reply.status(204).send();
  });

  app.post<{ Params: { name: string }; Body: { payload: string } }>(
    '/api/lambda/functions/:name/invoke',
    {
      schema: {
        params: nameParams,
        body: { type: 'object', required: ['payload'], properties: { payload: { type: 'string', maxLength: 6 * 1024 * 1024 } } },
      },
    },
    async (request) => {
      const { name } = request.params;
      return track('Invoke', name, () => lambda.invoke(name, request.body.payload));
    },
  );
}
