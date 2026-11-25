import { encode, json, request } from './http';

export type DistanceMetric = 'cosine' | 'euclidean';

export interface VectorBucket {
  name: string;
  arn: string;
  createdAt: string | null;
}

export interface VectorIndex {
  name: string;
  arn: string;
  dimension: number;
  distanceMetric: DistanceMetric;
  createdAt: string | null;
}

export interface VectorRecord {
  key: string;
  values: number[];
  metadata: Record<string, unknown> | null;
}

export interface QueryResult {
  key: string;
  distance: number | null;
  metadata: Record<string, unknown> | null;
}

const bucketPath = (bucket: string) => `/api/s3vectors/buckets/${encode(bucket)}`;
const indexPath = (bucket: string, index: string) => `${bucketPath(bucket)}/indexes/${encode(index)}`;

export const vectorsApi = {
  buckets: (signal?: AbortSignal) => request<{ buckets: VectorBucket[] }>('/api/s3vectors/buckets', { signal }),
  createBucket: (name: string) => request('/api/s3vectors/buckets', { method: 'POST', body: json({ name }) }),
  deleteBucket: (name: string) => request(bucketPath(name), { method: 'DELETE' }),
  indexes: (bucket: string, signal?: AbortSignal) => request<{ indexes: VectorIndex[] }>(`${bucketPath(bucket)}/indexes`, { signal }),
  createIndex: (bucket: string, index: { name: string; dimension: number; distanceMetric: DistanceMetric }) =>
    request(`${bucketPath(bucket)}/indexes`, { method: 'POST', body: json(index) }),
  index: (bucket: string, index: string, signal?: AbortSignal) =>
    request<{ index: VectorIndex; vectors: VectorRecord[] }>(indexPath(bucket, index), { signal }),
  deleteIndex: (bucket: string, index: string) => request(indexPath(bucket, index), { method: 'DELETE' }),
  putVectors: (bucket: string, index: string, vectors: VectorRecord[]) =>
    request(`${indexPath(bucket, index)}/vectors`, { method: 'POST', body: json({ vectors }) }),
  deleteVectors: (bucket: string, index: string, keys: string[]) =>
    request(`${indexPath(bucket, index)}/delete-vectors`, { method: 'POST', body: json({ keys }) }),
  query: (bucket: string, index: string, values: number[], topK: number, filter: Record<string, unknown> | null) =>
    request<{ results: QueryResult[] }>(`${indexPath(bucket, index)}/query`, { method: 'POST', body: json({ values, topK, filter }) }),
};
