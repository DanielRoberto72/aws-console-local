import { encode, json, request } from './http';

export interface FunctionSummary {
  name: string;
  arn: string;
  runtime: string | null;
  handler: string | null;
  memorySize: number | null;
  timeout: number | null;
  codeSize: number;
  lastModified: string | null;
  state: string | null;
  description: string;
}

export interface SourceFile {
  name: string;
  content: string;
}

export interface FunctionDetail {
  summary: FunctionSummary;
  role: string;
  environment: Record<string, string>;
  logGroup: string;
  codeSha256: string | null;
  files: SourceFile[];
  skippedFiles: string[];
}

export type FunctionCode = { files: SourceFile[] } | { zipBase64: string };

export interface NewFunction {
  name: string;
  runtime: string;
  handler: string;
  memorySize: number;
  timeout: number;
  role?: string;
  description?: string;
  environment?: Record<string, string>;
  code: FunctionCode;
}

export interface FunctionConfigurationUpdate {
  handler: string;
  memorySize: number;
  timeout: number;
  description: string;
  environment: Record<string, string>;
  role?: string;
}

export interface InvocationResult {
  statusCode: number;
  functionError: string | null;
  payload: string;
  logs: string;
  durationMs: number;
}

const fnPath = (name: string) => `/api/lambda/functions/${encode(name)}`;

export const lambdaApi = {
  list: (signal?: AbortSignal) => request<{ functions: FunctionSummary[] }>('/api/lambda/functions', { signal }),
  get: (name: string, signal?: AbortSignal) => request<FunctionDetail>(fnPath(name), { signal }),
  create: (fn: NewFunction) => request('/api/lambda/functions', { method: 'POST', body: json(fn) }),
  updateCode: (name: string, code: FunctionCode) => request(`${fnPath(name)}/code`, { method: 'PUT', body: json(code) }),
  updateConfiguration: (name: string, config: FunctionConfigurationUpdate) =>
    request(`${fnPath(name)}/configuration`, { method: 'PUT', body: json(config) }),
  remove: (name: string) => request(fnPath(name), { method: 'DELETE' }),
  invoke: (name: string, payload: string) =>
    request<InvocationResult>(`${fnPath(name)}/invoke`, { method: 'POST', body: json({ payload }) }),
};
