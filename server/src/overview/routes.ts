import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/pool.js';
import type { SyncMonitor } from '../sync/syncMonitor.js';

/**
 * Uso consolidado a partir do espelho no banco: barato de consultar e disponível
 * mesmo com o emulador fora do ar (reflete o último snapshot).
 */
export function overviewRoutes(app: FastifyInstance, db: Db, sync: SyncMonitor): void {
  app.get('/api/status', async () => sync.status());

  app.post('/api/sync', async (_request, reply) => {
    sync.trigger();
    return reply.status(202).send({ ok: true });
  });

  app.get('/api/overview', async () => {
    const { rows } = await db.query(`
      SELECT
        (SELECT count(*) FROM s3_buckets)::int AS buckets,
        (SELECT count(*) FROM s3_objects)::int AS objects,
        (SELECT coalesce(sum(size), 0) FROM s3_objects)::bigint AS bytes,
        (SELECT count(*) FROM dynamodb_tables)::int AS tables,
        (SELECT count(*) FROM dynamodb_items)::int AS items,
        (SELECT count(*) FROM sqs_queues)::int AS queues,
        (SELECT coalesce(sum((attributes->>'ApproximateNumberOfMessages')::int), 0) FROM sqs_queues)::int AS messages
    `);
    const usage = rows[0];
    const { rows: buckets } = await db.query(
      `SELECT b.name, count(o.key)::int AS objects, coalesce(sum(o.size), 0)::bigint AS bytes
         FROM s3_buckets b LEFT JOIN s3_objects o ON o.bucket = b.name
        GROUP BY b.name ORDER BY bytes DESC, b.name LIMIT 10`,
    );
    const { rows: tables } = await db.query(
      `SELECT t.name, count(i.id)::int AS items
         FROM dynamodb_tables t LEFT JOIN dynamodb_items i ON i.table_name = t.name
        GROUP BY t.name ORDER BY items DESC, t.name LIMIT 10`,
    );
    const { rows: others } = await db.query<{ service: string; type: string; count: number }>(
      `SELECT service, type, count(*)::int AS count FROM stored_resources GROUP BY service, type ORDER BY service, type`,
    );
    return {
      resources: others,
      s3: { buckets: usage.buckets, objects: usage.objects, bytes: Number(usage.bytes) },
      dynamodb: { tables: usage.tables, items: usage.items },
      sqs: { queues: usage.queues, messages: usage.messages },
      topBuckets: buckets.map((b) => ({ name: b.name, objects: b.objects, bytes: Number(b.bytes) })),
      topTables: tables,
      sync: await sync.status(),
    };
  });
}
