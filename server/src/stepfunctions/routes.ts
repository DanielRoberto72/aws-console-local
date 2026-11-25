import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { StateMachineDefinition, StepFunctionsService } from './stepFunctionsService.js';

const nameParams = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 80 } },
} as const;

const arnBody = {
  type: 'object',
  required: ['arn'],
  properties: { arn: { type: 'string', minLength: 1, maxLength: 2048 } },
} as const;

function assertJson(text: string, label: string): void {
  try {
    JSON.parse(text);
  } catch (err) {
    throw new BadRequestError(`${label} não é um JSON válido: ${(err as Error).message}`);
  }
}

export function stepFunctionsRoutes(app: FastifyInstance, { sfn, activity, onChange }: RouteDeps & { sfn: StepFunctionsService }): void {
  const track = createTracker(activity, 'stepfunctions', onChange);

  app.get('/api/stepfunctions/state-machines', async () => ({ stateMachines: await sfn.listStateMachines() }));

  app.post<{ Body: StateMachineDefinition }>(
    '/api/stepfunctions/state-machines',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'type', 'definition'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' },
            type: { enum: ['STANDARD', 'EXPRESS'] },
            definition: { type: 'string', minLength: 2, maxLength: 1048576 },
            roleArn: { type: 'string', maxLength: 2048 },
          },
        },
      },
    },
    async (request, reply) => {
      const machine = { ...request.body, roleArn: request.body.roleArn ?? '' };
      assertJson(machine.definition, 'A definição');
      const arn = await track('CreateStateMachine', machine.name, () => sfn.create(machine));
      return reply.status(201).send({ arn });
    },
  );

  app.get<{ Params: { name: string } }>('/api/stepfunctions/state-machines/:name', { schema: { params: nameParams } }, async (request) =>
    sfn.describe(request.params.name),
  );

  app.put<{ Params: { name: string }; Body: { definition: string; roleArn?: string } }>(
    '/api/stepfunctions/state-machines/:name',
    {
      schema: {
        params: nameParams,
        body: {
          type: 'object',
          required: ['definition'],
          properties: { definition: { type: 'string', minLength: 2, maxLength: 1048576 }, roleArn: { type: 'string', maxLength: 2048 } },
        },
      },
    },
    async (request) => {
      const { name } = request.params;
      assertJson(request.body.definition, 'A definição');
      await track('UpdateStateMachine', name, () => sfn.update(name, request.body.definition, request.body.roleArn ?? ''));
      return { ok: true };
    },
  );

  app.delete<{ Params: { name: string } }>('/api/stepfunctions/state-machines/:name', { schema: { params: nameParams } }, async (request, reply) => {
    const { name } = request.params;
    await track('DeleteStateMachine', name, () => sfn.delete(name));
    return reply.status(204).send();
  });

  app.get<{ Params: { name: string } }>('/api/stepfunctions/state-machines/:name/executions', { schema: { params: nameParams } }, async (request) => ({
    executions: await sfn.listExecutions(request.params.name),
  }));

  app.post<{ Params: { name: string }; Body: { input: string; executionName?: string } }>(
    '/api/stepfunctions/state-machines/:name/executions',
    {
      schema: {
        params: nameParams,
        body: {
          type: 'object',
          required: ['input'],
          properties: {
            input: { type: 'string', maxLength: 262144 },
            executionName: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const input = request.body.input || '{}';
      assertJson(input, 'A entrada');
      const executionArn = await track('StartExecution', name, () => sfn.start(name, input, request.body.executionName));
      return reply.status(201).send({ executionArn });
    },
  );

  // ARNs de execução têm ":", por isso vão no corpo.
  app.post<{ Body: { arn: string } }>('/api/stepfunctions/executions/describe', { schema: { body: arnBody } }, async (request) =>
    sfn.describeExecution(request.body.arn),
  );

  app.post<{ Body: { arn: string } }>('/api/stepfunctions/executions/stop', { schema: { body: arnBody } }, async (request) => {
    await track('StopExecution', request.body.arn, () => sfn.stopExecution(request.body.arn));
    return { ok: true };
  });
}
