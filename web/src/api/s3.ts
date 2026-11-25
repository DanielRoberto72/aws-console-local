import { encode, json, request } from './http';

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

const bucketPath = (bucket: string) => `/api/s3/buckets/${encode(bucket)}`;

export const s3Api = {
  listBuckets: (signal?: AbortSignal) => request<{ buckets: BucketSummary[] }>('/api/s3/buckets', { signal }),
  createBucket: (name: string) => request('/api/s3/buckets', { method: 'POST', body: json({ name }) }),
  deleteBucket: (bucket: string) => request(bucketPath(bucket), { method: 'DELETE' }),
  emptyBucket: (bucket: string) => request<{ deleted: number }>(`${bucketPath(bucket)}/empty`, { method: 'POST' }),
  listObjects: (bucket: string, prefix: string, signal?: AbortSignal) =>
    request<ObjectListing>(`${bucketPath(bucket)}/objects?prefix=${encode(prefix)}`, { signal }),
  upload: (bucket: string, prefix: string, files: readonly File[]) => {
    const form = new FormData();
    // O prefixo vem antes dos arquivos para o servidor saber onde gravá-los.
    form.append('prefix', prefix);
    for (const file of files) form.append('file', file, file.name);
    return request<{ uploaded: string[] }>(`${bucketPath(bucket)}/objects`, { method: 'POST', body: form });
  },
  createFolder: (bucket: string, key: string) =>
    request(`${bucketPath(bucket)}/folders`, { method: 'POST', body: json({ key }) }),
  deleteObjects: (bucket: string, keys: string[], prefixes: string[]) =>
    request<{ deleted: number }>(`${bucketPath(bucket)}/delete-objects`, { method: 'POST', body: json({ keys, prefixes }) }),
  downloadUrl: (bucket: string, key: string) => `${bucketPath(bucket)}/download?key=${encode(key)}`,
};
