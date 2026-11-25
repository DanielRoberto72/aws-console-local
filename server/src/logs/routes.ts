import type { FastifyInstance } from 'fastify';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { LogsService } from './logsService.js';

/** Valores aceitos pela AWS para retenção, em dias. */
export const RETENTION_DAYS = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653] as const;

const groupQuery = {
  type: 'object',
  required: ['group'],
  properties: { group: { type: 'string', minLength: 1, maxLength: 512 } },
} as const;

const retention = { anyOf: [{ enum: [...RETENTION_DAYS] }, { type: 'null' }] } as const;

// Nomes de grupos têm "/", por isso vão na query string e não no caminho.
export function logsRoutes(app: FastifyInstance, { logs, activity, onChange }: RouteDeps & { logs: LogsService }): void {
  const track = createTracker(activity, 'logs', onChange);

  app.get('/api/logs/groups', async () => ({ groups: await logs.listGroups() }));

  app.post<{ Body: { name: string; retentionDays: number | null } }>(
    '/api/logs/groups',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 512, pattern: '^[\\.\\-_/#A-Za-z0-9]+$' }, retentionDays: retention },
        },
      },
    },
    async (request, reply) => {
      const { name, retentionDays = null } = request.body;
      await track('CreateLogGroup', name, () => logs.createGroup(name, retentionDays));
      return reply.status(201).send({ name });
    },
  );

  app.put<{ Body: { group: string; retentionDays: number | null } }>(
    '/api/logs/groups/retention',
    { schema: { body: { type: 'object', required: ['group', 'retentionDays'], properties: { group: groupQuery.properties.group, retentionDays: retention } } } },
    async (request) => {
      const { group, retentionDays } = request.body;
      await track('PutRetentionPolicy', group, () => logs.setRetention(group, retentionDays));
      return { ok: true };
    },
  );

  app.post<{ Body: { group: string } }>('/api/logs/groups/delete', { schema: { body: groupQuery } }, async (request) => {
    const { group } = request.body;
    await track('DeleteLogGroup', group, () => logs.deleteGroup(group));
    return { ok: true };
  });

  app.get<{ Querystring: { group: string } }>('/api/logs/streams', { schema: { querystring: groupQuery } }, async (request) => ({
    streams: await logs.listStreams(request.query.group),
  }));

  app.get<{ Querystring: { group: string; stream: string } }>(
    '/api/logs/events',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['group', 'stream'],
          properties: { group: { type: 'string', minLength: 1 }, stream: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request) => ({ events: await logs.getEvents(request.query.group, request.query.stream) }),
  );
}
