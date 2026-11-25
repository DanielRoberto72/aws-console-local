import { encode, json, request } from './http';

export interface LogGroupSummary {
  name: string;
  arn: string | null;
  retentionDays: number | null;
  storedBytes: number;
  createdAt: string | null;
}

export interface LogStreamSummary {
  name: string;
  lastEventAt: string | null;
  createdAt: string | null;
}

export interface LogEvent {
  timestamp: string | null;
  message: string;
}

export const RETENTION_DAYS = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653] as const;

export const logsApi = {
  groups: (signal?: AbortSignal) => request<{ groups: LogGroupSummary[] }>('/api/logs/groups', { signal }),
  createGroup: (name: string, retentionDays: number | null) =>
    request('/api/logs/groups', { method: 'POST', body: json({ name, retentionDays }) }),
  setRetention: (group: string, retentionDays: number | null) =>
    request('/api/logs/groups/retention', { method: 'PUT', body: json({ group, retentionDays }) }),
  deleteGroup: (group: string) => request('/api/logs/groups/delete', { method: 'POST', body: json({ group }) }),
  streams: (group: string, signal?: AbortSignal) =>
    request<{ streams: LogStreamSummary[] }>(`/api/logs/streams?group=${encode(group)}`, { signal }),
  events: (group: string, stream: string, signal?: AbortSignal) =>
    request<{ events: LogEvent[] }>(`/api/logs/events?group=${encode(group)}&stream=${encode(stream)}`, { signal }),
};
