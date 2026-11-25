import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { EventsService, OutgoingEvent, RuleDefinition, RuleTarget } from './eventsService.js';

const busParams = {
  type: 'object',
  required: ['bus'],
  properties: { bus: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;

const ruleParams = {
  type: 'object',
  required: ['bus', 'rule'],
  properties: { bus: busParams.properties.bus, rule: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;

const targetSchema = {
  type: 'object',
  required: ['id', 'arn'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[\\.\\-_A-Za-z0-9]+$' },
    arn: { type: 'string', minLength: 1, maxLength: 1600 },
    input: { anyOf: [{ type: 'string', maxLength: 8192 }, { type: 'null' }] },
  },
} as const;

function assertJson(text: string | null | undefined, label: string): void {
  if (!text) return;
  try {
    JSON.parse(text);
  } catch {
    throw new BadRequestError(`${label} deve ser um JSON válido.`);
  }
}

export function eventsRoutes(app: FastifyInstance, { events, activity, onChange }: RouteDeps & { events: EventsService }): void {
  const track = createTracker(activity, 'events', onChange);

  app.get('/api/events/buses', async () => ({ buses: await events.listBuses() }));

  app.post<{ Body: { name: string } }>(
    '/api/events/buses',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[\\.\\-_A-Za-z0-9]+$' } } } } },
    async (request, reply) => {
      const { name } = request.body;
      await track('CreateEventBus', name, () => events.createBus(name));
      return reply.status(201).send({ name });
    },
  );

  app.delete<{ Params: { bus: string } }>('/api/events/buses/:bus', { schema: { params: busParams } }, async (request, reply) => {
    const { bus } = request.params;
    await track('DeleteEventBus', bus, () => events.deleteBus(bus));
    return reply.status(204).send();
  });

  app.get<{ Params: { bus: string } }>('/api/events/buses/:bus/rules', { schema: { params: busParams } }, async (request) => ({
    rules: await events.listRules(request.params.bus),
  }));

  app.post<{ Params: { bus: string }; Body: Omit<RuleDefinition, 'bus'> & { targets: RuleTarget[] } }>(
    '/api/events/buses/:bus/rules',
    {
      schema: {
        params: busParams,
        body: {
          type: 'object',
          required: ['name', 'state', 'targets'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[\\.\\-_A-Za-z0-9]+$' },
            description: { type: 'string', maxLength: 512 },
            eventPattern: { anyOf: [{ type: 'string', maxLength: 4096 }, { type: 'null' }] },
            scheduleExpression: { anyOf: [{ type: 'string', maxLength: 256 }, { type: 'null' }] },
            state: { enum: ['ENABLED', 'DISABLED'] },
            targets: { type: 'array', maxItems: 5, items: targetSchema },
          },
        },
      },
    },
    async (request, reply) => {
      const { bus } = request.params;
      const { targets, ...rest } = request.body;
      const rule: RuleDefinition = {
        ...rest,
        bus,
        description: rest.description ?? '',
        eventPattern: rest.eventPattern || null,
        scheduleExpression: rest.scheduleExpression || null,
      };
      if (!rule.eventPattern === !rule.scheduleExpression) {
        throw new BadRequestError('Informe um padrão de evento ou uma expressão de agendamento (apenas um).');
      }
      assertJson(rule.eventPattern, 'O padrão de evento');
      for (const t of targets) assertJson(t.input, `A entrada do destino ${t.id}`);
      await track('PutRule', `${bus}/${rule.name}`, async () => {
        await events.putRule(rule);
        await events.putTargets(bus, rule.name, targets);
      });
      return reply.status(201).send({ name: rule.name });
    },
  );

  app.get<{ Params: { bus: string; rule: string } }>('/api/events/buses/:bus/rules/:rule', { schema: { params: ruleParams } }, async (request) =>
    events.getRule(request.params.bus, request.params.rule),
  );

  app.delete<{ Params: { bus: string; rule: string } }>('/api/events/buses/:bus/rules/:rule', { schema: { params: ruleParams } }, async (request, reply) => {
    const { bus, rule } = request.params;
    await track('DeleteRule', `${bus}/${rule}`, () => events.deleteRule(bus, rule));
    return reply.status(204).send();
  });

  app.put<{ Params: { bus: string; rule: string }; Body: { enabled: boolean } }>(
    '/api/events/buses/:bus/rules/:rule/state',
    { schema: { params: ruleParams, body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } } },
    async (request) => {
      const { bus, rule } = request.params;
      const { enabled } = request.body;
      await track(enabled ? 'EnableRule' : 'DisableRule', `${bus}/${rule}`, () => events.setEnabled(bus, rule, enabled));
      return { ok: true };
    },
  );

  app.post<{ Params: { bus: string; rule: string }; Body: RuleTarget }>(
    '/api/events/buses/:bus/rules/:rule/targets',
    { schema: { params: ruleParams, body: targetSchema } },
    async (request, reply) => {
      const { bus, rule } = request.params;
      assertJson(request.body.input, 'A entrada do destino');
      await track('PutTargets', `${bus}/${rule}`, () => events.putTargets(bus, rule, [{ ...request.body, input: request.body.input ?? null }]));
      return reply.status(201).send({ ok: true });
    },
  );

  app.post<{ Params: { bus: string; rule: string }; Body: { ids: string[] } }>(
    '/api/events/buses/:bus/rules/:rule/remove-targets',
    {
      schema: {
        params: ruleParams,
        body: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } } },
      },
    },
    async (request) => {
      const { bus, rule } = request.params;
      await track('RemoveTargets', `${bus}/${rule}`, () => events.removeTargets(bus, rule, request.body.ids));
      return { ok: true };
    },
  );

  app.post<{ Body: OutgoingEvent }>(
    '/api/events/put-events',
    {
      schema: {
        body: {
          type: 'object',
          required: ['source', 'detailType', 'detail', 'bus'],
          properties: {
            source: { type: 'string', minLength: 1, maxLength: 256 },
            detailType: { type: 'string', minLength: 1, maxLength: 256 },
            detail: { type: 'string', minLength: 2, maxLength: 262144 },
            bus: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request) => {
      assertJson(request.body.detail, 'O detalhe do evento');
      return track('PutEvents', `${request.body.bus}: ${request.body.detailType}`, () => events.putEvents([request.body]));
    },
  );
}
