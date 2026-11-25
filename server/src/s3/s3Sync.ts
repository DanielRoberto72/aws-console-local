import type pg from 'pg';
import type { Queryable } from '../db/pool.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { S3Service } from './s3Service.js';

const ALREADY_EXISTS = new Set(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists']);

export class S3Sync implements SyncAdapter {
  readonly service = 's3' as const;

  constructor(private readonly s3: S3Service) {}

  async snapshot(tx: pg.PoolClient): Promise<void> {
    const buckets = await this.s3.listBucketNames();
    const names = buckets.map((b) => b.name);
    await tx.query('DELETE FROM s3_buckets WHERE NOT (name = ANY($1::text[]))', [names]);

    for (const { name, createdAt } of buckets) {
      await tx.query(
        `INSERT INTO s3_buckets (name, created_at) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET created_at = EXCLUDED.created_at`,
        [name, createdAt ?? null],
      );
      await this.snapshotObjects(tx, name);
    }
  }

  /** Baixa só objetos novos ou alterados (pelo ETag), para não copiar tudo a cada ciclo. */
  private async snapshotObjects(tx: pg.PoolClient, bucket: string): Promise<void> {
    const { rows } = await tx.query<{ key: string; etag: string }>(
      'SELECT key, etag FROM s3_objects WHERE bucket = $1',
      [bucket],
    );
    const savedEtags = new Map(rows.map((r) => [r.key, r.etag]));
    const currentKeys: string[] = [];

    for await (const object of this.s3.allObjects(bucket)) {
      if (!object.Key) continue;
      currentKeys.push(object.Key);
      const etag = object.ETag ?? '';
      if (savedEtags.get(object.Key) === etag) continue;

      const { body, contentType } = await this.s3.getObjectBytes(bucket, object.Key);
      await tx.query(
        `INSERT INTO s3_objects (bucket, key, etag, size, content_type, last_modified, body)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (bucket, key) DO UPDATE SET etag = EXCLUDED.etag, size = EXCLUDED.size,
           content_type = EXCLUDED.content_type, last_modified = EXCLUDED.last_modified, body = EXCLUDED.body`,
        [bucket, object.Key, etag, body.length, contentType ?? null, object.LastModified ?? null, body],
      );
    }
    await tx.query('DELETE FROM s3_objects WHERE bucket = $1 AND NOT (key = ANY($2::text[]))', [bucket, currentKeys]);
  }

  async restore(db: Queryable): Promise<void> {
    const { rows: buckets } = await db.query<{ name: string }>('SELECT name FROM s3_buckets ORDER BY name');
    for (const { name } of buckets) {
      try {
        await this.s3.createBucket(name);
      } catch (err) {
        if (!ALREADY_EXISTS.has((err as Error).name)) throw err;
      }
      // Corpo carregado um objeto por vez para não manter o bucket inteiro em memória.
      const { rows: keys } = await db.query<{ key: string }>('SELECT key FROM s3_objects WHERE bucket = $1', [name]);
      for (const { key } of keys) {
        const { rows } = await db.query<{ body: Buffer; content_type: string | null }>(
          'SELECT body, content_type FROM s3_objects WHERE bucket = $1 AND key = $2',
          [name, key],
        );
        const object = rows[0];
        if (object) await this.s3.putObject(name, key, object.body, object.content_type ?? undefined);
      }
    }
  }
}
