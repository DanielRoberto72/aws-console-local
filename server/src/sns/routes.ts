import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { NewSubscription, SnsService } from './snsService.js';

const topicParams = {
  type: 'object',
  required: ['topic'],
  properties: { topic: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;

export function snsRoutes(app: FastifyInstance, { sns, activity, onChange }: RouteDeps & { sns: SnsService }): void {
  const track = createTracker(activity, 'sns', onChange);

  app.get('/api/sns/topics', async () => ({ topics: await sns.listTopics() }));

  app.post<{ Body: { name: string; fifo: boolean; displayName?: string; contentBasedDeduplication?: boolean } }>(
    '/api/sns/topics',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'fifo'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[a-zA-Z0-9_-]+(\\.fifo)?$' },
            fifo: { type: 'boolean' },
            displayName: { type: 'string', maxLength: 100 },
            contentBasedDeduplication: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, fifo, displayName, contentBasedDeduplication } = request.body;
      if (fifo !== name.endsWith('.fifo')) throw new BadRequestError('Tópicos FIFO precisam terminar em ".fifo", e só eles.');
      const attributes: Record<string, string> = {};
      if (fifo) attributes.FifoTopic = 'true';
      if (fifo && contentBasedDeduplication) attributes.ContentBasedDeduplication = 'true';
      if (displayName) attributes.DisplayName = displayName;
      const arn = await track('CreateTopic', name, () => sns.createTopic(name, attributes));
      return reply.status(201).send({ name, arn });
    },
  );

  app.get<{ Params: { topic: string } }>('/api/sns/topics/:topic', { schema: { params: topicParams } }, async (request) =>
    sns.getTopic(request.params.topic),
  );

  app.delete<{ Params: { topic: string } }>('/api/sns/topics/:topic', { schema: { params: topicParams } }, async (request, reply) => {
    const { topic } = request.params;
    await track('DeleteTopic', topic, () => sns.deleteTopic(topic));
    return reply.status(204).send();
  });

  app.post<{ Params: { topic: string }; Body: NewSubscription }>(
    '/api/sns/topics/:topic/subscriptions',
    {
      schema: {
        params: topicParams,
        body: {
          type: 'object',
          required: ['protocol', 'endpoint'],
          properties: {
            protocol: { enum: ['sqs', 'lambda', 'http', 'https', 'email', 'email-json', 'sms', 'application', 'firehose'] },
            endpoint: { type: 'string', minLength: 1, maxLength: 2048 },
            rawMessageDelivery: { type: 'boolean' },
            filterPolicy: { type: 'string', maxLength: 16384 },
          },
        },
      },
    },
    async (request, reply) => {
      const { topic } = request.params;
      if (request.body.filterPolicy) {
        try {
          JSON.parse(request.body.filterPolicy);
        } catch {
          throw new BadRequestError('A política de filtro deve ser um JSON válido.');
        }
      }
      const arn = await sns.arnOf(topic);
      const subscriptionArn = await track('Subscribe', `${topic} → ${request.body.endpoint}`, () => sns.subscribe(arn, request.body));
      return reply.status(201).send({ subscriptionArn });
    },
  );

  app.post<{ Body: { subscriptionArn: string } }>(
    '/api/sns/unsubscribe',
    { schema: { body: { type: 'object', required: ['subscriptionArn'], properties: { subscriptionArn: { type: 'string', minLength: 1 } } } } },
    async (request) => {
      const { subscriptionArn } = request.body;
      await track('Unsubscribe', subscriptionArn, () => sns.unsubscribe(subscriptionArn));
      return { ok: true };
    },
  );

  app.post<{ Params: { topic: string }; Body: { message: string; subject?: string; groupId?: string; deduplicationId?: string } }>(
    '/api/sns/topics/:topic/publish',
    {
      schema: {
        params: topicParams,
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 262144 },
            subject: { type: 'string', maxLength: 100 },
            groupId: { type: 'string', minLength: 1, maxLength: 128 },
            deduplicationId: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { topic } = request.params;
      const messageId = await track('Publish', topic, () => sns.publish(topic, request.body));
      return reply.status(201).send({ messageId });
    },
  );
}
