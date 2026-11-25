import { encode, json, request } from './http';

export type ParameterKind = 'String' | 'StringList' | 'SecureString';

export interface ParameterSummary {
  name: string;
  type: ParameterKind;
  version: number;
  description: string;
  lastModified: string | null;
  tier: string;
}

export interface ParameterDetail {
  name: string;
  type: ParameterKind;
  value: string;
  version: number;
  arn: string;
  lastModified: string | null;
}

export interface ParameterInput {
  name: string;
  type: ParameterKind;
  value: string;
  description?: string;
}

export const ssmApi = {
  list: (signal?: AbortSignal) => request<{ parameters: ParameterSummary[] }>('/api/ssm/parameters', { signal }),
  create: (input: ParameterInput) => request('/api/ssm/parameters', { method: 'POST', body: json(input) }),
  update: (input: ParameterInput) => request('/api/ssm/parameters', { method: 'PUT', body: json(input) }),
  detail: (name: string, signal?: AbortSignal) => request<ParameterDetail>(`/api/ssm/parameters/detail?name=${encode(name)}`, { signal }),
  remove: (name: string) => request('/api/ssm/parameters/delete', { method: 'POST', body: json({ name }) }),
};
