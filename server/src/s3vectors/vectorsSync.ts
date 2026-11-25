import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { IndexDefinition, VectorRecord, VectorsService } from './vectorsService.js';

interface SavedIndex {
  bucket: string;
  index: IndexDefinition;
}

/** Buckets, índices e vetores; os vetores ficam no campo binário, como JSON. */
export class VectorsSync implements SyncAdapter {
  readonly service = 's3vectors' as const;

  constructor(
    private readonly vectors: VectorsService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const resources: StoredResource[] = [];
    const buckets = await this.vectors.listBuckets();
    for (const bucket of buckets) resources.push({ type: 'bucket', name: bucket.name, data: {} });
    for (const bucket of buckets) {
      for (const { arn: _arn, createdAt: _createdAt, ...index } of await this.vectors.listIndexes(bucket.name)) {
        const records = await this.vectors.listVectors(bucket.name, index.name);
        const data: SavedIndex = { bucket: bucket.name, index };
        resources.push({ type: 'index', name: `${bucket.name}|${index.name}`, data, blob: Buffer.from(JSON.stringify(records)) });
      }
    }
    await this.store.replace(tx, 's3vectors', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { name } of await this.store.list(db, 's3vectors', 'bucket')) await createIfMissing(() => this.vectors.createBucket(name));
    for (const { data, blob } of await this.store.list<SavedIndex>(db, 's3vectors', 'index')) {
      await createIfMissing(() => this.vectors.createIndex(data.bucket, data.index));
      const records = blob ? (JSON.parse(blob.toString('utf8')) as VectorRecord[]) : [];
      if (records.length > 0) await this.vectors.putVectors(data.bucket, data.index.name, records);
    }
  }
}
