import { encode, json, request } from './http';

export interface SecretSummary {
  name: string;
  arn: string;
  description: string;
  lastChangedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string | null;
}

export interface SecretDetail {
  name: string;
  arn: string;
  description: string;
  createdAt: string | null;
  lastChangedAt: string | null;
  versions: number;
}

export type SecretValue = { kind: 'string'; value: string } | { kind: 'binary'; base64: string };

export const secretsApi = {
  list: (signal?: AbortSignal) => request<{ secrets: SecretSummary[] }>('/api/secrets', { signal }),
  create: (name: string, description: string, value: SecretValue) =>
    request('/api/secrets', { method: 'POST', body: json({ name, description, value }) }),
  detail: (name: string, signal?: AbortSignal) => request<SecretDetail>(`/api/secrets/detail?name=${encode(name)}`, { signal }),
  value: (name: string) => request<{ value: SecretValue }>('/api/secrets/value', { method: 'POST', body: json({ name }) }),
  putValue: (name: string, value: SecretValue, description?: string) =>
    request('/api/secrets/value', { method: 'PUT', body: json({ name, value, description }) }),
  remove: (name: string) => request('/api/secrets/delete', { method: 'POST', body: json({ name }) }),
};
