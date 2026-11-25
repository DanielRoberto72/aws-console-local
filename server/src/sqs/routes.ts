import type { FastifyInstance } from 'fastify';
import type { ActivityLog } from '../activity/activityLog.js';
import { BadRequestError } from '../http/errors.js';
import type { NewQueue, OutgoingMessage, SqsService } from './sqsService.js';

interface Deps {
  sqs: SqsService;
  activity: ActivityLog;
  onChange: () => void;
}

const queueParams = {
  type: 'object',
  required: ['queue'],
  properties: { queue: { type: 'string', minLength: 1, maxLength: 80 } },
} as const;

export function sqsRoutes(app: FastifyInstance, { sqs, activity, onChange }: Deps): void {
  const track = async <T>(action: string, target: string, run: () => Promise<T>): Promise<T> => {
    const result = await activity.track('sqs', action, target, run);
    onChange();
    return result;
  };

  app.get('/api/sqs/queues', async () => ({ queues: await sqs.listQueues() }));

  app.post<{ Body: NewQueue }>(
    '/api/sqs/queues',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'fifo'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9_-]+(\\.fifo)?$' },
            fifo: { type: 'boolean' },
            visibilityTimeout: { type: 'integer', minimum: 0, maximum: 43200 },
            messageRetentionPeriod: { type: 'integer', minimum: 60, maximum: 1209600 },
            delaySeconds: { type: 'integer', minimum: 0, maximum: 900 },
            contentBasedDeduplication: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const queue = request.body;
      if (queue.fifo !== queue.name.endsWith('.fifo')) {
        throw new BadRequestError('Filas FIFO precisam terminar em ".fifo", e só elas.');
      }
      const url = await track('CreateQueue', queue.name, () => sqs.createQueue(queue));
      return reply.status(201).send({ name: queue.name, url });
    },
  );

  app.get<{ Params: { queue: string } }>('/api/sqs/queues/:queue', { schema: { params: queueParams } }, async (request) =>
    sqs.getQueue(request.params.queue),
  );

  app.delete<{ Params: { queue: string } }>('/api/sqs/queues/:queue', { schema: { params: queueParams } }, async (request, reply) => {
    const { queue } = request.params;
    await track('DeleteQueue', queue, () => sqs.deleteQueue(queue));
    return reply.status(204).send();
  });

  app.post<{ Params: { queue: string } }>('/api/sqs/queues/:queue/purge', { schema: { params: queueParams } }, async (request) => {
    const { queue } = request.params;
    await track('PurgeQueue', queue, () => sqs.purge(queue));
    return { ok: true };
  });

  app.post<{ Params: { queue: string }; Body: OutgoingMessage }>(
    '/api/sqs/queues/:queue/messages',
    {
      schema: {
        params: queueParams,
        body: {
          type: 'object',
          required: ['body'],
          properties: {
            body: { type: 'string', minLength: 1, maxLength: 262144 },
            groupId: { type: 'string', minLength: 1, maxLength: 128 },
            deduplicationId: { type: 'string', minLength: 1, maxLength: 128 },
            delaySeconds: { type: 'integer', minimum: 0, maximum: 900 },
          },
        },
      },
    },
    async (request, reply) => {
      const { queue } = request.params;
      const messageId = await track('SendMessage', queue, () => sqs.send(queue, request.body));
      return reply.status(201).send({ messageId });
    },
  );

  app.post<{ Params: { queue: string }; Body: { maxMessages?: number; waitSeconds?: number } }>(
    '/api/sqs/queues/:queue/receive',
    {
      schema: {
        params: queueParams,
        body: {
          type: 'object',
          properties: {
            maxMessages: { type: 'integer', minimum: 1, maximum: 10 },
            waitSeconds: { type: 'integer', minimum: 0, maximum: 20 },
          },
        },
      },
    },
    async (request) => {
      const { queue } = request.params;
      const { maxMessages = 10, waitSeconds = 0 } = request.body ?? {};
      return { messages: await sqs.receive(queue, maxMessages, waitSeconds) };
    },
  );

  app.post<{ Params: { queue: string }; Body: { receiptHandle: string } }>(
    '/api/sqs/queues/:queue/delete-message',
    {
      schema: {
        params: queueParams,
        body: { type: 'object', required: ['receiptHandle'], properties: { receiptHandle: { type: 'string', minLength: 1 } } },
      },
    },
    async (request) => {
      const { queue } = request.params;
      await track('DeleteMessage', queue, () => sqs.deleteMessage(queue, request.body.receiptHandle));
      return { ok: true };
    },
  );
}
