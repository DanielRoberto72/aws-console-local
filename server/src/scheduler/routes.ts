import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { ScheduleDefinition, SchedulerService } from './schedulerService.js';

const nameField = { type: 'string', minLength: 1, maxLength: 64, pattern: '^[0-9a-zA-Z\\-_.]+$' } as const;

const scheduleParams = {
  type: 'object',
  required: ['group', 'name'],
  properties: { group: nameField, name: nameField },
} as const;

/** at(...), rate(...) ou cron(...), como aceito pelo EventBridge Scheduler. */
export const SCHEDULE_EXPRESSION = /^(at\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)|rate\(\d+ (minute|minutes|hour|hours|day|days)\)|cron\(.+\))$/;

export function schedulerRoutes(app: FastifyInstance, { scheduler, activity, onChange }: RouteDeps & { scheduler: SchedulerService }): void {
  const track = createTracker(activity, 'scheduler', onChange);

  app.get('/api/scheduler/groups', async () => ({ groups: await scheduler.listGroups() }));

  app.post<{ Body: { name: string } }>(
    '/api/scheduler/groups',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: nameField } } } },
    async (request, reply) => {
      const { name } = request.body;
      await track('CreateScheduleGroup', name, () => scheduler.createGroup(name));
      return reply.status(201).send({ name });
    },
  );

  app.get('/api/scheduler/schedules', async () => ({ schedules: await scheduler.listSchedules() }));

  app.post<{ Body: ScheduleDefinition }>(
    '/api/scheduler/schedules',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'group', 'expression', 'targetArn', 'state'],
          properties: {
            name: nameField,
            group: nameField,
            expression: { type: 'string', minLength: 1, maxLength: 256 },
            timezone: { type: 'string', maxLength: 50 },
            description: { type: 'string', maxLength: 512 },
            targetArn: { type: 'string', minLength: 1, maxLength: 1600 },
            roleArn: { type: 'string', maxLength: 1600 },
            input: { anyOf: [{ type: 'string', maxLength: 8192 }, { type: 'null' }] },
            state: { enum: ['ENABLED', 'DISABLED'] },
          },
        },
      },
    },
    async (request, reply) => {
      const schedule: ScheduleDefinition = {
        ...request.body,
        timezone: request.body.timezone ?? 'UTC',
        description: request.body.description ?? '',
        roleArn: request.body.roleArn ?? '',
        input: request.body.input || null,
      };
      if (!SCHEDULE_EXPRESSION.test(schedule.expression)) {
        throw new BadRequestError('Use at(aaaa-mm-ddThh:mm:ss), rate(N minutes|hours|days) ou cron(...).');
      }
      await track('CreateSchedule', `${schedule.group}/${schedule.name}`, () => scheduler.createSchedule(schedule));
      return reply.status(201).send({ name: schedule.name });
    },
  );

  app.get<{ Params: { group: string; name: string } }>('/api/scheduler/schedules/:group/:name', { schema: { params: scheduleParams } }, async (request) =>
    scheduler.getSchedule(request.params.group, request.params.name),
  );

  app.put<{ Params: { group: string; name: string }; Body: { enabled: boolean } }>(
    '/api/scheduler/schedules/:group/:name/state',
    { schema: { params: scheduleParams, body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } } },
    async (request) => {
      const { group, name } = request.params;
      const state = request.body.enabled ? 'ENABLED' : 'DISABLED';
      await track('UpdateSchedule', `${group}/${name}`, () => scheduler.setState(group, name, state));
      return { ok: true };
    },
  );

  app.delete<{ Params: { group: string; name: string } }>('/api/scheduler/schedules/:group/:name', { schema: { params: scheduleParams } }, async (request, reply) => {
    const { group, name } = request.params;
    await track('DeleteSchedule', `${group}/${name}`, () => scheduler.deleteSchedule(group, name));
    return reply.status(204).send();
  });
}
