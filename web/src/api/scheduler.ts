import { encode, json, request } from './http';

export interface ScheduleSummary {
  name: string;
  group: string;
  state: string;
  targetArn: string;
  createdAt: string | null;
}

export interface ScheduleDefinition {
  name: string;
  group: string;
  expression: string;
  timezone: string;
  description: string;
  targetArn: string;
  roleArn: string;
  input: string | null;
  state: 'ENABLED' | 'DISABLED';
}

const schedulePath = (group: string, name: string) => `/api/scheduler/schedules/${encode(group)}/${encode(name)}`;

export const schedulerApi = {
  groups: (signal?: AbortSignal) => request<{ groups: string[] }>('/api/scheduler/groups', { signal }),
  createGroup: (name: string) => request('/api/scheduler/groups', { method: 'POST', body: json({ name }) }),
  schedules: (signal?: AbortSignal) => request<{ schedules: ScheduleSummary[] }>('/api/scheduler/schedules', { signal }),
  create: (schedule: ScheduleDefinition) => request('/api/scheduler/schedules', { method: 'POST', body: json(schedule) }),
  get: (group: string, name: string, signal?: AbortSignal) =>
    request<ScheduleDefinition & { arn: string; createdAt: string | null }>(schedulePath(group, name), { signal }),
  setEnabled: (group: string, name: string, enabled: boolean) =>
    request(`${schedulePath(group, name)}/state`, { method: 'PUT', body: json({ enabled }) }),
  remove: (group: string, name: string) => request(schedulePath(group, name), { method: 'DELETE' }),
};
