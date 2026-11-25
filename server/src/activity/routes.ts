import type { FastifyInstance } from 'fastify';
import type { ActivityLog } from './activityLog.js';

export function activityRoutes(app: FastifyInstance, activity: ActivityLog): void {
  app.get<{ Querystring: { limit?: number } }>(
    '/api/activity',
    { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 500 } } } } },
    async (request) => ({ entries: await activity.recent(request.query.limit ?? 100) }),
  );
}
