import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  PutItemCommand,
  ScanCommand,
  waitUntilTableExists,
  type CreateTableCommandInput,
  type DynamoDBClient,
  type TableDescription,
  type WriteRequest,
} from '@aws-sdk/client-dynamodb';
import type { Item } from './attributeJson.js';

export type KeyType = 'S' | 'N' | 'B';

export interface NewTable {
  name: string;
  partitionKey: { name: string; type: KeyType };
  sortKey?: { name: string; type: KeyType };
}

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

export interface ScanPage {
  items: Item[];
  lastEvaluatedKey: Item | undefined;
}

/** BatchWriteItem aceita no máximo 25 itens por chamada. */
const BATCH_WRITE_SIZE = 25;
const MAX_BATCH_RETRIES = 5;

export class DynamoDbService {
  constructor(private readonly dynamodb: DynamoDBClient) {}

  async listTableNames(): Promise<string[]> {
    const names: string[] = [];
    let start: string | undefined;
    do {
      const page = await this.dynamodb.send(new ListTablesCommand({ ExclusiveStartTableName: start }));
      names.push(...(page.TableNames ?? []));
      start = page.LastEvaluatedTableName;
    } while (start);
    return names;
  }

  async describe(name: string): Promise<TableDescription> {
    const { Table } = await this.dynamodb.send(new DescribeTableCommand({ TableName: name }));
    if (!Table) throw new Error(`Tabela ${name} sem descrição`);
    return Table;
  }

  async listTables(): Promise<TableSummary[]> {
    const names = await this.listTableNames();
    return Promise.all(names.map((name) => this.summary(name)));
  }

  async summary(name: string): Promise<TableSummary> {
    const table = await this.describe(name);
    const key = (type: 'HASH' | 'RANGE') => table.KeySchema?.find((k) => k.KeyType === type)?.AttributeName ?? null;
    return {
      name,
      status: table.TableStatus ?? 'UNKNOWN',
      partitionKey: key('HASH'),
      sortKey: key('RANGE'),
      billingMode: table.BillingModeSummary?.BillingMode ?? 'PROVISIONED',
      indexes: (table.GlobalSecondaryIndexes?.length ?? 0) + (table.LocalSecondaryIndexes?.length ?? 0),
      // ItemCount da AWS é atualizado só periodicamente; a contagem real vem de um scan.
      itemCount: table.TableStatus === 'ACTIVE' ? await this.countItems(name) : 0,
      createdAt: table.CreationDateTime?.toISOString() ?? null,
    };
  }

  async createTable(table: NewTable): Promise<void> {
    const attributes = [table.partitionKey, ...(table.sortKey ? [table.sortKey] : [])];
    await this.createTableFrom({
      TableName: table.name,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: attributes.map((a) => ({ AttributeName: a.name, AttributeType: a.type })),
      KeySchema: [
        { AttributeName: table.partitionKey.name, KeyType: 'HASH' },
        ...(table.sortKey ? [{ AttributeName: table.sortKey.name, KeyType: 'RANGE' as const }] : []),
      ],
    });
  }

  async createTableFrom(input: CreateTableCommandInput): Promise<void> {
    await this.dynamodb.send(new CreateTableCommand(input));
  }

  async waitUntilActive(name: string): Promise<void> {
    await waitUntilTableExists({ client: this.dynamodb, maxWaitTime: 120, minDelay: 1, maxDelay: 3 }, { TableName: name });
  }

  async deleteTable(name: string): Promise<void> {
    await this.dynamodb.send(new DeleteTableCommand({ TableName: name }));
  }

  async countItems(name: string): Promise<number> {
    let count = 0;
    let start: Item | undefined;
    do {
      const page = await this.dynamodb.send(new ScanCommand({ TableName: name, Select: 'COUNT', ExclusiveStartKey: start }));
      count += page.Count ?? 0;
      start = page.LastEvaluatedKey;
    } while (start);
    return count;
  }

  async scanPage(name: string, limit: number, startKey: Item | undefined): Promise<ScanPage> {
    const page = await this.dynamodb.send(new ScanCommand({ TableName: name, Limit: limit, ExclusiveStartKey: startKey }));
    return { items: page.Items ?? [], lastEvaluatedKey: page.LastEvaluatedKey };
  }

  async scanAll(name: string): Promise<Item[]> {
    const items: Item[] = [];
    let start: Item | undefined;
    do {
      const page = await this.dynamodb.send(new ScanCommand({ TableName: name, ExclusiveStartKey: start }));
      items.push(...(page.Items ?? []));
      start = page.LastEvaluatedKey;
    } while (start);
    return items;
  }

  async putItem(name: string, item: Item): Promise<void> {
    await this.dynamodb.send(new PutItemCommand({ TableName: name, Item: item }));
  }

  async deleteItem(name: string, key: Item): Promise<void> {
    await this.dynamodb.send(new DeleteItemCommand({ TableName: name, Key: key }));
  }

  async putItems(name: string, items: readonly Item[]): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_WRITE_SIZE) {
      let pending: WriteRequest[] = items.slice(i, i + BATCH_WRITE_SIZE).map((Item) => ({ PutRequest: { Item } }));
      for (let attempt = 0; pending.length > 0; attempt += 1) {
        if (attempt > MAX_BATCH_RETRIES) throw new Error(`Itens não gravados na tabela ${name} após várias tentativas`);
        const result = await this.dynamodb.send(new BatchWriteItemCommand({ RequestItems: { [name]: pending } }));
        pending = result.UnprocessedItems?.[name] ?? [];
      }
    }
  }
}
