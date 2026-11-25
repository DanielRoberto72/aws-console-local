import type { FastifyInstance } from 'fastify';
import type { ActivityLog } from '../activity/activityLog.js';
import { BadRequestError } from '../http/errors.js';
import type { S3Service } from './s3Service.js';

interface Deps {
  s3: S3Service;
  activity: ActivityLog;
  onChange: () => void;
}

const bucketParams = {
  type: 'object',
  required: ['bucket'],
  properties: { bucket: { type: 'string', minLength: 1 } },
} as const;

export function s3Routes(app: FastifyInstance, { s3, activity, onChange }: Deps): void {
  const track = async <T>(action: string, target: string, run: () => Promise<T>): Promise<T> => {
    const result = await activity.track('s3', action, target, run);
    onChange();
    return result;
  };

  app.get('/api/s3/buckets', async () => ({ buckets: await s3.listBuckets() }));

  app.post<{ Body: { name: string } }>(
    '/api/s3/buckets',
    {
      schema: {
        body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 3, maxLength: 63 } } },
      },
    },
    async (request, reply) => {
      const { name } = request.body;
      await track('CreateBucket', name, () => s3.createBucket(name));
      return reply.status(201).send({ name });
    },
  );

  app.delete<{ Params: { bucket: string } }>('/api/s3/buckets/:bucket', { schema: { params: bucketParams } }, async (request, reply) => {
    const { bucket } = request.params;
    await track('DeleteBucket', bucket, () => s3.deleteBucket(bucket));
    return reply.status(204).send();
  });

  app.post<{ Params: { bucket: string } }>('/api/s3/buckets/:bucket/empty', { schema: { params: bucketParams } }, async (request) => {
    const { bucket } = request.params;
    const deleted = await track('EmptyBucket', bucket, () => s3.emptyBucket(bucket));
    return { deleted };
  });

  app.get<{ Params: { bucket: string }; Querystring: { prefix?: string } }>(
    '/api/s3/buckets/:bucket/objects',
    { schema: { params: bucketParams } },
    async (request) => s3.listObjects(request.params.bucket, request.query.prefix ?? ''),
  );

  app.post<{ Params: { bucket: string } }>('/api/s3/buckets/:bucket/objects', { schema: { params: bucketParams } }, async (request, reply) => {
    const { bucket } = request.params;
    let prefix = '';
    const uploaded: string[] = [];
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'prefix' && typeof part.value === 'string') prefix = part.value;
        continue;
      }
      const key = `${prefix}${part.filename}`;
      const body = await part.toBuffer();
      await track('PutObject', `${bucket}/${key}`, () => s3.putObject(bucket, key, body, part.mimetype));
      uploaded.push(key);
    }
    if (uploaded.length === 0) throw new BadRequestError('Nenhum arquivo enviado.');
    return reply.status(201).send({ uploaded });
  });

  app.post<{ Params: { bucket: string }; Body: { key: string } }>(
    '/api/s3/buckets/:bucket/folders',
    {
      schema: {
        params: bucketParams,
        body: { type: 'object', required: ['key'], properties: { key: { type: 'string', minLength: 1, maxLength: 1024 } } },
      },
    },
    async (request, reply) => {
      const { bucket } = request.params;
      await track('CreateFolder', `${bucket}/${request.body.key}`, () => s3.createFolder(bucket, request.body.key));
      return reply.status(201).send();
    },
  );

  app.get<{ Params: { bucket: string }; Querystring: { key: string } }>(
    '/api/s3/buckets/:bucket/download',
    {
      schema: {
        params: bucketParams,
        querystring: { type: 'object', required: ['key'], properties: { key: { type: 'string', minLength: 1 } } },
      },
    },
    async (request, reply) => {
      const { key } = request.query;
      const object = await s3.getObject(request.params.bucket, key);
      const filename = key.split('/').pop() || 'download';
      void reply.header('content-type', object.contentType ?? 'application/octet-stream');
      void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      if (object.contentLength !== undefined) void reply.header('content-length', object.contentLength);
      return reply.send(object.body);
    },
  );

  app.post<{ Params: { bucket: string }; Body: { keys?: string[]; prefixes?: string[] } }>(
    '/api/s3/buckets/:bucket/delete-objects',
    {
      schema: {
        params: bucketParams,
        body: {
          type: 'object',
          properties: {
            keys: { type: 'array', items: { type: 'string', minLength: 1 } },
            prefixes: { type: 'array', items: { type: 'string', minLength: 1 } },
          },
        },
      },
    },
    async (request) => {
      const { bucket } = request.params;
      const { keys = [], prefixes = [] } = request.body;
      if (keys.length === 0 && prefixes.length === 0) throw new BadRequestError('Selecione ao menos um objeto ou pasta.');
      // Excluir uma pasta, como no console, remove tudo que está sob o prefixo.
      const all = new Set(keys);
      for (const prefix of prefixes) {
        for await (const object of s3.allObjects(bucket, prefix)) if (object.Key) all.add(object.Key);
      }
      const targets = [...all];
      await track('DeleteObjects', `${bucket} (${targets.length})`, () => s3.deleteObjects(bucket, targets));
      return { deleted: targets.length };
    },
  );
}
