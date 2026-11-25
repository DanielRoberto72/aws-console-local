import { encode, json, request } from './http';

export interface BusSummary {
  name: string;
  arn: string;
}

export interface RuleTarget {
  id: string;
  arn: string;
  input: string | null;
}

export interface RuleSummary {
  name: string;
  arn: string;
  bus: string;
  description: string;
  eventPattern: string | null;
  scheduleExpression: string | null;
  state: 'ENABLED' | 'DISABLED';
}

export interface NewRule {
  name: string;
  description: string;
  eventPattern: string | null;
  scheduleExpression: string | null;
  state: 'ENABLED' | 'DISABLED';
  targets: RuleTarget[];
}

const busPath = (bus: string) => `/api/events/buses/${encode(bus)}`;
const rulePath = (bus: string, rule: string) => `${busPath(bus)}/rules/${encode(rule)}`;

export const eventsApi = {
  buses: (signal?: AbortSignal) => request<{ buses: BusSummary[] }>('/api/events/buses', { signal }),
  createBus: (name: string) => request('/api/events/buses', { method: 'POST', body: json({ name }) }),
  deleteBus: (name: string) => request(busPath(name), { method: 'DELETE' }),
  rules: (bus: string, signal?: AbortSignal) => request<{ rules: RuleSummary[] }>(`${busPath(bus)}/rules`, { signal }),
  createRule: (bus: string, rule: NewRule) => request(`${busPath(bus)}/rules`, { method: 'POST', body: json(rule) }),
  rule: (bus: string, rule: string, signal?: AbortSignal) =>
    request<{ rule: RuleSummary; targets: RuleTarget[] }>(rulePath(bus, rule), { signal }),
  deleteRule: (bus: string, rule: string) => request(rulePath(bus, rule), { method: 'DELETE' }),
  setEnabled: (bus: string, rule: string, enabled: boolean) =>
    request(`${rulePath(bus, rule)}/state`, { method: 'PUT', body: json({ enabled }) }),
  addTarget: (bus: string, rule: string, target: RuleTarget) =>
    request(`${rulePath(bus, rule)}/targets`, { method: 'POST', body: json(target) }),
  removeTargets: (bus: string, rule: string, ids: string[]) =>
    request(`${rulePath(bus, rule)}/remove-targets`, { method: 'POST', body: json({ ids }) }),
  putEvent: (event: { source: string; detailType: string; detail: string; bus: string }) =>
    request<{ failed: number; entries: { eventId: string | null; error: string | null }[] }>('/api/events/put-events', {
      method: 'POST',
      body: json(event),
    }),
};
