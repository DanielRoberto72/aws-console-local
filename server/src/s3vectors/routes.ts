import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { IndexDefinition, VectorRecord, VectorsService } from './vectorsService.js';

const nameField = { type: 'string', minLength: 3, maxLength: 63, pattern: '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' } as const;
const bucketParams = { type: 'object', required: ['bucket'], properties: { bucket: nameField } } as const;
const indexParams = { type: 'object', required: ['bucket', 'index'], properties: { bucket: nameField, index: nameField } } as const;

const valuesSchema = { type: 'array', minItems: 1, maxItems: 4096, items: { type: 'number' } } as const;

export function vectorsRoutes(app: FastifyInstance, { vectors, activity, onChange }: RouteDeps & { vectors: VectorsService }): void {
  const track = createTracker(activity, 's3vectors', onChange);

  /** A dimensão do vetor precisa bater com a do índice; o erro fica mais claro aqui do que no emulador. */
  const assertDimension = async (bucket: string, index: string, lengths: number[]) => {
    const { dimension } = await vectors.getIndex(bucket, index);
    const wrong = lengths.find((n) => n !== dimension);
    if (wrong !== undefined) throw new BadRequestError(`O índice tem dimensão ${dimension}, mas recebeu um vetor com ${wrong} valores.`);
  };

  app.get('/api/s3vectors/buckets', async () => ({ buckets: await vectors.listBuckets() }));

  app.post<{ Body: { name: string } }>(
    '/api/s3vectors/buckets',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: nameField } } } },
    async (request, reply) => {
      const { name } = request.body;
      await track('CreateVectorBucket', name, () => vectors.createBucket(name));
      return reply.status(201).send({ name });
    },
  );

  app.delete<{ Params: { bucket: string } }>('/api/s3vectors/buckets/:bucket', { schema: { params: bucketParams } }, async (request, reply) => {
    const { bucket } = request.params;
    await track('DeleteVectorBucket', bucket, () => vectors.deleteBucket(bucket));
    return reply.status(204).send();
  });

  app.get<{ Params: { bucket: string } }>('/api/s3vectors/buckets/:bucket/indexes', { schema: { params: bucketParams } }, async (request) => ({
    indexes: await vectors.listIndexes(request.params.bucket),
  }));

  app.post<{ Params: { bucket: string }; Body: IndexDefinition }>(
    '/api/s3vectors/buckets/:bucket/indexes',
    {
      schema: {
        params: bucketParams,
        body: {
          type: 'object',
          required: ['name', 'dimension', 'distanceMetric'],
          properties: { name: nameField, dimension: { type: 'integer', minimum: 1, maximum: 4096 }, distanceMetric: { enum: ['cosine', 'euclidean'] } },
        },
      },
    },
    async (request, reply) => {
      const { bucket } = request.params;
      await track('CreateIndex', `${bucket}/${request.body.name}`, () => vectors.createIndex(bucket, request.body));
      return reply.status(201).send({ name: request.body.name });
    },
  );

  app.get<{ Params: { bucket: string; index: string } }>('/api/s3vectors/buckets/:bucket/indexes/:index', { schema: { params: indexParams } }, async (request) => {
    const { bucket, index } = request.params;
    const [definition, records] = await Promise.all([vectors.getIndex(bucket, index), vectors.listVectors(bucket, index)]);
    return { index: definition, vectors: records };
  });

  app.delete<{ Params: { bucket: string; index: string } }>('/api/s3vectors/buckets/:bucket/indexes/:index', { schema: { params: indexParams } }, async (request, reply) => {
    const { bucket, index } = request.params;
    await track('DeleteIndex', `${bucket}/${index}`, () => vectors.deleteIndex(bucket, index));
    return reply.status(204).send();
  });

  app.post<{ Params: { bucket: string; index: string }; Body: { vectors: VectorRecord[] } }>(
    '/api/s3vectors/buckets/:bucket/indexes/:index/vectors',
    {
      bodyLimit: 20 * 1024 * 1024,
      schema: {
        params: indexParams,
        body: {
          type: 'object',
          required: ['vectors'],
          properties: {
            vectors: {
              type: 'array',
              minItems: 1,
              maxItems: 5000,
              items: {
                type: 'object',
                required: ['key', 'values'],
                properties: {
                  key: { type: 'string', minLength: 1, maxLength: 1024 },
                  values: valuesSchema,
                  metadata: { anyOf: [{ type: 'object' }, { type: 'null' }] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { bucket, index } = request.params;
      const records = request.body.vectors.map((v) => ({ ...v, metadata: v.metadata ?? null }));
      await assertDimension(bucket, index, records.map((v) => v.values.length));
      await track('PutVectors', `${bucket}/${index} (${records.length})`, () => vectors.putVectors(bucket, index, records));
      return reply.status(201).send({ count: records.length });
    },
  );

  app.post<{ Params: { bucket: string; index: string }; Body: { keys: string[] } }>(
    '/api/s3vectors/buckets/:bucket/indexes/:index/delete-vectors',
    {
      schema: {
        params: indexParams,
        body: { type: 'object', required: ['keys'], properties: { keys: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string', minLength: 1 } } } },
      },
    },
    async (request) => {
      const { bucket, index } = request.params;
      const { keys } = request.body;
      await track('DeleteVectors', `${bucket}/${index} (${keys.length})`, () => vectors.deleteVectors(bucket, index, keys));
      return { deleted: keys.length };
    },
  );

  app.post<{ Params: { bucket: string; index: string }; Body: { values: number[]; topK: number; filter?: Record<string, unknown> | null } }>(
    '/api/s3vectors/buckets/:bucket/indexes/:index/query',
    {
      schema: {
        params: indexParams,
        body: {
          type: 'object',
          required: ['values', 'topK'],
          properties: { values: valuesSchema, topK: { type: 'integer', minimum: 1, maximum: 100 }, filter: { anyOf: [{ type: 'object' }, { type: 'null' }] } },
        },
      },
    },
    async (request) => {
      const { bucket, index } = request.params;
      await assertDimension(bucket, index, [request.body.values.length]);
      return { results: await vectors.query(bucket, index, request.body.values, request.body.topK, request.body.filter ?? null) };
    },
  );
}
