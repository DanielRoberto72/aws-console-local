import {
  CreateIndexCommand,
  CreateVectorBucketCommand,
  DeleteIndexCommand,
  DeleteVectorBucketCommand,
  DeleteVectorsCommand,
  GetIndexCommand,
  ListIndexesCommand,
  ListVectorBucketsCommand,
  ListVectorsCommand,
  PutVectorsCommand,
  QueryVectorsCommand,
  type S3VectorsClient,
} from '@aws-sdk/client-s3vectors';

export type DistanceMetric = 'cosine' | 'euclidean';

export interface IndexDefinition {
  name: string;
  dimension: number;
  distanceMetric: DistanceMetric;
}

export interface VectorRecord {
  key: string;
  values: number[];
  metadata: Record<string, unknown> | null;
}

/** PutVectors aceita no máximo 500 vetores por chamada. */
const PUT_BATCH_SIZE = 500;
const iso = (d: Date | undefined) => d?.toISOString() ?? null;

export class VectorsService {
  constructor(private readonly s3vectors: S3VectorsClient) {}

  async listBuckets() {
    const buckets: { name: string; arn: string; createdAt: string | null }[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3vectors.send(new ListVectorBucketsCommand({ nextToken: token }));
      for (const b of page.vectorBuckets ?? []) {
        if (b.vectorBucketName) buckets.push({ name: b.vectorBucketName, arn: b.vectorBucketArn ?? '', createdAt: iso(b.creationTime) });
      }
      token = page.nextToken;
    } while (token);
    return buckets;
  }

  async createBucket(name: string): Promise<void> {
    await this.s3vectors.send(new CreateVectorBucketCommand({ vectorBucketName: name }));
  }

  async deleteBucket(name: string): Promise<void> {
    await this.s3vectors.send(new DeleteVectorBucketCommand({ vectorBucketName: name }));
  }

  async listIndexNames(bucket: string): Promise<string[]> {
    const names: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3vectors.send(new ListIndexesCommand({ vectorBucketName: bucket, nextToken: token }));
      for (const i of page.indexes ?? []) if (i.indexName) names.push(i.indexName);
      token = page.nextToken;
    } while (token);
    return names;
  }

  async getIndex(bucket: string, name: string): Promise<IndexDefinition & { arn: string; createdAt: string | null }> {
    const { index } = await this.s3vectors.send(new GetIndexCommand({ vectorBucketName: bucket, indexName: name }));
    return {
      name,
      arn: index?.indexArn ?? '',
      dimension: index?.dimension ?? 0,
      distanceMetric: (index?.distanceMetric ?? 'cosine') as DistanceMetric,
      createdAt: iso(index?.creationTime),
    };
  }

  async listIndexes(bucket: string) {
    return Promise.all((await this.listIndexNames(bucket)).map((name) => this.getIndex(bucket, name)));
  }

  async createIndex(bucket: string, index: IndexDefinition): Promise<void> {
    await this.s3vectors.send(
      new CreateIndexCommand({
        vectorBucketName: bucket,
        indexName: index.name,
        dataType: 'float32',
        dimension: index.dimension,
        distanceMetric: index.distanceMetric,
      }),
    );
  }

  async deleteIndex(bucket: string, name: string): Promise<void> {
    await this.s3vectors.send(new DeleteIndexCommand({ vectorBucketName: bucket, indexName: name }));
  }

  async listVectors(bucket: string, index: string): Promise<VectorRecord[]> {
    const vectors: VectorRecord[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3vectors.send(
        new ListVectorsCommand({ vectorBucketName: bucket, indexName: index, nextToken: token, returnData: true, returnMetadata: true }),
      );
      for (const v of page.vectors ?? []) {
        if (!v.key) continue;
        vectors.push({
          key: v.key,
          values: v.data?.float32 ?? [],
          metadata: (v.metadata as Record<string, unknown> | undefined) ?? null,
        });
      }
      token = page.nextToken;
    } while (token);
    return vectors;
  }

  async putVectors(bucket: string, index: string, vectors: readonly VectorRecord[]): Promise<void> {
    for (let i = 0; i < vectors.length; i += PUT_BATCH_SIZE) {
      await this.s3vectors.send(
        new PutVectorsCommand({
          vectorBucketName: bucket,
          indexName: index,
          vectors: vectors.slice(i, i + PUT_BATCH_SIZE).map((v) => ({
            key: v.key,
            data: { float32: v.values },
            ...(v.metadata ? { metadata: v.metadata as never } : {}),
          })),
        }),
      );
    }
  }

  async deleteVectors(bucket: string, index: string, keys: readonly string[]): Promise<void> {
    await this.s3vectors.send(new DeleteVectorsCommand({ vectorBucketName: bucket, indexName: index, keys: [...keys] }));
  }

  async query(bucket: string, index: string, values: number[], topK: number, filter: Record<string, unknown> | null) {
    const { vectors = [] } = await this.s3vectors.send(
      new QueryVectorsCommand({
        vectorBucketName: bucket,
        indexName: index,
        queryVector: { float32: values },
        topK,
        returnDistance: true,
        returnMetadata: true,
        ...(filter ? { filter: filter as never } : {}),
      }),
    );
    return vectors.map((v) => ({ key: v.key ?? '', distance: v.distance ?? null, metadata: (v.metadata as Record<string, unknown> | undefined) ?? null }));
  }
}
