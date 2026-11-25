import { request } from './http';

export interface SyncStatus {
  emulator: 'unknown' | 'online' | 'offline';
  emulatorReason: string | null;
  phase: 'idle' | 'restoring' | 'snapshotting';
  lastRestoreAt: string | null;
  lastSnapshotAt: string | null;
  lastError: string | null;
}

export interface Overview {
  resources: { service: string; type: string; count: number }[];
  s3: { buckets: number; objects: number; bytes: number };
  dynamodb: { tables: number; items: number };
  sqs: { queues: number; messages: number };
  topBuckets: { name: string; objects: number; bytes: number }[];
  topTables: { name: string; items: number }[];
  sync: SyncStatus;
}

export interface ActivityEntry {
  id: number;
  at: string;
  service: string;
  action: string;
  target: string;
  outcome: 'success' | 'failure';
  message: string | null;
}

export const overviewApi = {
  status: (signal?: AbortSignal) => request<SyncStatus>('/api/status', { signal }),
  overview: (signal?: AbortSignal) => request<Overview>('/api/overview', { signal }),
  syncNow: () => request('/api/sync', { method: 'POST' }),
  activity: (limit: number, signal?: AbortSignal) =>
    request<{ entries: ActivityEntry[] }>(`/api/activity?limit=${limit}`, { signal }),
};
