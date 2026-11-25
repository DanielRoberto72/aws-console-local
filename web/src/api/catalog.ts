import { encode, json, request } from './http';

/** Espelho do catálogo publicado pelo servidor em /api/catalog. */
export type FieldType = 'text' | 'password' | 'number' | 'select' | 'multiselect' | 'textarea' | 'code' | 'boolean' | 'list';
export type FieldValue = string | number | boolean | string[];
export type Input = Record<string, FieldValue>;

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: FieldValue;
  description?: string;
  placeholder?: string;
  options?: FieldOption[];
  source?: string;
  min?: number;
  max?: number;
  pattern?: string;
  patternHint?: string;
  rows?: number;
}

export interface ActionMeta {
  key: string;
  label: string;
  description?: string;
  submitLabel?: string;
  mutates: boolean;
  fields: FieldSpec[];
}

export type StatusTone = 'success' | 'error' | 'warning' | 'pending' | 'in-progress' | 'stopped' | 'info';

export interface ResourceRow {
  id: string;
  name: string;
  status?: { label: string; tone: StatusTone };
  attrs: Record<string, string | number | boolean | null>;
  managedBy?: string;
}

export interface TypeMeta {
  key: string;
  label: string;
  singular: string;
  description?: string;
  parent?: string;
  hidden: boolean;
  notes?: string;
  columns: { key: string; label: string }[];
  create: { label?: string; fields: FieldSpec[] } | null;
  remove: { label?: string; warning?: string } | null;
  actions: ActionMeta[];
  persisted: boolean;
}

export interface ServiceMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  notes?: string;
  types: TypeMeta[];
  tools: ActionMeta[];
}

export type ActionResult =
  | { kind: 'message'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'table'; columns: string[]; rows: (string | number | null)[][] }
  | { kind: 'audio'; contentType: string; base64: string }
  | { kind: 'secret'; label: string; value: string; warning: string };

export interface CreateResult {
  id: string;
  reveal?: { label: string; value: string; warning: string };
}

const parentQuery = (parentId?: string) => (parentId ? `parentId=${encode(parentId)}` : '');
const withParent = (parentId?: string) => (parentId ? { parentId } : {});

export const catalogApi = {
  meta: (signal?: AbortSignal) => request<{ services: ServiceMeta[] }>('/api/catalog', { signal }),
  options: (source: string, signal?: AbortSignal) =>
    request<{ options: FieldOption[] }>(`/api/catalog/options?source=${encode(source)}`, { signal }),
  list: (service: string, type: string, parentId?: string, signal?: AbortSignal) =>
    request<{ rows: ResourceRow[] }>(`/api/catalog/${service}/${type}?${parentQuery(parentId)}`, { signal }),
  detail: (service: string, type: string, id: string, parentId?: string, signal?: AbortSignal) =>
    request<{ row: ResourceRow; details: unknown }>(`/api/catalog/${service}/${type}/detail?id=${encode(id)}&${parentQuery(parentId)}`, { signal }),
  create: (service: string, type: string, input: Input, parentId?: string) =>
    request<CreateResult>(`/api/catalog/${service}/${type}`, { method: 'POST', body: json({ input, ...withParent(parentId) }) }),
  remove: (service: string, type: string, id: string, parentId?: string) =>
    request(`/api/catalog/${service}/${type}/delete`, { method: 'POST', body: json({ id, ...withParent(parentId) }) }),
  action: (service: string, type: string, action: string, id: string, input: Input, parentId?: string) =>
    request<{ result: ActionResult }>(`/api/catalog/${service}/${type}/actions/${action}`, {
      method: 'POST',
      body: json({ id, input, ...withParent(parentId) }),
    }),
  tool: (service: string, tool: string, input: Input) =>
    request<{ result: ActionResult }>(`/api/catalog/${service}/tools/${tool}`, { method: 'POST', body: json({ input }) }),
};
