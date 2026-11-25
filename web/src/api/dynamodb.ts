import { encode, json, request } from './http';

export type KeyType = 'S' | 'N' | 'B';

/** Item em "DynamoDB JSON", como na AWS CLI: {"id": {"S": "1"}}. */
export type WireItem = Record<string, Record<string, unknown>>;

export interface TableSummary {
  name: string;
  status: string;
  partitionKey: string | null;
  sortKey: string | null;
  billingMode: string;
  indexes: number;
  itemCount: number;
  createdAt: string | null;
}

export interface TableDetail {
  summary: TableSummary;
  arn: string | null;
  attributeDefinitions: { AttributeName: string; AttributeType: KeyType }[];
  globalSecondaryIndexes: string[];
  localSecondaryIndexes: string[];
}

export interface NewTable {
  name: string;
  partitionKey: { name: string; type: KeyType };
  sortKey?: { name: string; type: KeyType };
}

const tablePath = (table: string) => `/api/dynamodb/tables/${encode(table)}`;

export const dynamodbApi = {
  listTables: (signal?: AbortSignal) => request<{ tables: TableSummary[] }>('/api/dynamodb/tables', { signal }),
  createTable: (table: NewTable) => request('/api/dynamodb/tables', { method: 'POST', body: json(table) }),
  getTable: (table: string, signal?: AbortSignal) => request<TableDetail>(tablePath(table), { signal }),
  deleteTable: (table: string) => request(tablePath(table), { method: 'DELETE' }),
  scan: (table: string, cursor: string | null, signal?: AbortSignal) =>
    request<{ items: WireItem[]; nextCursor: string | null }>(
      `${tablePath(table)}/items?limit=50${cursor ? `&cursor=${encode(cursor)}` : ''}`,
      { signal },
    ),
  putItem: (table: string, item: WireItem) => request(`${tablePath(table)}/items`, { method: 'PUT', body: json({ item }) }),
  deleteItems: (table: string, keys: WireItem[]) =>
    request<{ deleted: number }>(`${tablePath(table)}/delete-items`, { method: 'POST', body: json({ keys }) }),
};
