import { encode, json, request } from './http';

export interface StateMachineSummary {
  name: string;
  arn: string;
  type: string;
  createdAt: string | null;
}

export interface StateMachineDetail {
  name: string;
  arn: string;
  type: 'STANDARD' | 'EXPRESS';
  definition: string;
  roleArn: string;
  status: string | null;
  createdAt: string | null;
}

export interface ExecutionSummary {
  arn: string;
  name: string;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

export interface ExecutionDetail extends ExecutionSummary {
  input: string | null;
  output: string | null;
  error: string | null;
  cause: string | null;
  events: { id: number; type: string; timestamp: string | null; detail: unknown }[];
}

const machinePath = (name: string) => `/api/stepfunctions/state-machines/${encode(name)}`;

export const sfnApi = {
  list: (signal?: AbortSignal) => request<{ stateMachines: StateMachineSummary[] }>('/api/stepfunctions/state-machines', { signal }),
  create: (machine: { name: string; type: 'STANDARD' | 'EXPRESS'; definition: string; roleArn?: string }) =>
    request('/api/stepfunctions/state-machines', { method: 'POST', body: json(machine) }),
  get: (name: string, signal?: AbortSignal) => request<StateMachineDetail>(machinePath(name), { signal }),
  update: (name: string, definition: string, roleArn?: string) =>
    request(machinePath(name), { method: 'PUT', body: json({ definition, roleArn }) }),
  remove: (name: string) => request(machinePath(name), { method: 'DELETE' }),
  executions: (name: string, signal?: AbortSignal) => request<{ executions: ExecutionSummary[] }>(`${machinePath(name)}/executions`, { signal }),
  start: (name: string, input: string, executionName?: string) =>
    request<{ executionArn: string }>(`${machinePath(name)}/executions`, { method: 'POST', body: json({ input, executionName }) }),
  execution: (arn: string, signal?: AbortSignal) =>
    request<ExecutionDetail>('/api/stepfunctions/executions/describe', { method: 'POST', body: json({ arn }), signal }),
  stop: (arn: string) => request('/api/stepfunctions/executions/stop', { method: 'POST', body: json({ arn }) }),
};
