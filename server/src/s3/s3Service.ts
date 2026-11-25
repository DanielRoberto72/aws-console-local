import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
  type _Object,
} from '@aws-sdk/client-s3';

export interface BucketSummary {
  name: string;
  createdAt: string | null;
  objectCount: number;
  totalSize: number;
}

export interface ObjectSummary {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
}

export interface ObjectListing {
  prefixes: string[];
  objects: ObjectSummary[];
}

/** DeleteObjects aceita no máximo 1000 chaves por chamada. */
const DELETE_BATCH_SIZE = 1000;

export class S3Service {
  constructor(private readonly s3: S3Client) {}

  async listBucketNames(): Promise<{ name: string; createdAt: Date | undefined }[]> {
    const { Buckets = [] } = await this.s3.send(new ListBucketsCommand({}));
    return Buckets.filter((b) => b.Name).map((b) => ({ name: b.Name!, createdAt: b.CreationDate }));
  }

  async listBuckets(): Promise<BucketSummary[]> {
    const buckets = await this.listBucketNames();
    return Promise.all(
      buckets.map(async ({ name, createdAt }) => {
        let objectCount = 0;
        let totalSize = 0;
        for await (const object of this.allObjects(name)) {
          objectCount += 1;
          totalSize += object.Size ?? 0;
        }
        return { name, createdAt: createdAt?.toISOString() ?? null, objectCount, totalSize };
      }),
    );
  }

  async createBucket(name: string): Promise<void> {
    await this.s3.send(new CreateBucketCommand({ Bucket: name }));
  }

  async deleteBucket(name: string): Promise<void> {
    await this.s3.send(new DeleteBucketCommand({ Bucket: name }));
  }

  /** Remove todos os objetos do bucket; retorna quantos foram excluídos. */
  async emptyBucket(name: string): Promise<number> {
    const keys: string[] = [];
    for await (const object of this.allObjects(name)) if (object.Key) keys.push(object.Key);
    await this.deleteObjects(name, keys);
    return keys.length;
  }

  async *allObjects(bucket: string, prefix?: string): AsyncGenerator<_Object> {
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      yield* page.Contents ?? [];
      token = page.NextContinuationToken;
    } while (token);
  }

  /** Lista um "nível" do bucket, agrupando por "/" como o console da AWS faz com pastas. */
  async listObjects(bucket: string, prefix: string): Promise<ObjectListing> {
    const prefixes: string[] = [];
    const objects: ObjectSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, Delimiter: '/', ContinuationToken: token }),
      );
      for (const p of page.CommonPrefixes ?? []) if (p.Prefix) prefixes.push(p.Prefix);
      for (const o of page.Contents ?? []) {
        // O próprio marcador da pasta aberta não é exibido como objeto.
        if (!o.Key || o.Key === prefix) continue;
        objects.push({
          key: o.Key,
          size: o.Size ?? 0,
          lastModified: o.LastModified?.toISOString() ?? null,
          etag: o.ETag ?? null,
        });
      }
      token = page.NextContinuationToken;
    } while (token);
    return { prefixes, objects };
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType: string | undefined): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  }

  /** Pastas no S3 são objetos vazios terminados em "/". */
  async createFolder(bucket: string, folderKey: string): Promise<void> {
    await this.putObject(bucket, folderKey.endsWith('/') ? folderKey : `${folderKey}/`, Buffer.alloc(0), undefined);
  }

  async getObject(bucket: string, key: string) {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      etag: result.ETag,
    };
  }

  async getObjectBytes(bucket: string, key: string): Promise<{ body: Buffer; contentType: string | undefined }> {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
    return { body: Buffer.from(bytes), contentType: result.ContentType };
  }

  async deleteObjects(bucket: string, keys: readonly string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      const result = await this.s3.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
      );
      const failure = result.Errors?.[0];
      if (failure) throw new Error(`Falha ao excluir ${failure.Key}: ${failure.Message ?? failure.Code}`);
    }
  }
}
