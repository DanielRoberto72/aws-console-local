import type { FastifyInstance } from 'fastify';
import type { ActivityLog } from '../activity/activityLog.js';
import { BadRequestError } from '../http/errors.js';
import { itemFromWire, itemToWire, type Item } from './attributeJson.js';
import type { DynamoDbService, NewTable } from './dynamodbService.js';

interface Deps {
  dynamodb: DynamoDbService;
  activity: ActivityLog;
  onChange: () => void;
}

const tableParams = {
  type: 'object',
  required: ['table'],
  properties: { table: { type: 'string', minLength: 3, maxLength: 255 } },
} as const;

const keyDefinition = {
  type: 'object',
  required: ['name', 'type'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 255 }, type: { enum: ['S', 'N', 'B'] } },
} as const;

/** Converte entrada do usuário em item, devolvendo 400 com a mensagem de validação. */
function parseItem(input: unknown, path: string): Item {
  try {
    return itemFromWire(input, path);
  } catch (err) {
    throw new BadRequestError((err as Error).message, 'InvalidItem');
  }
}

/** O cursor de paginação é a LastEvaluatedKey em DynamoDB JSON, codificada em base64url. */
function decodeCursor(cursor: string | undefined): Item | undefined {
  if (!cursor) return undefined;
  try {
    return itemFromWire(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')), 'cursor');
  } catch {
    throw new BadRequestError('Cursor de paginação inválido.');
  }
}

const encodeCursor = (key: Item | undefined) =>
  key ? Buffer.from(JSON.stringify(itemToWire(key))).toString('base64url') : null;

export function dynamodbRoutes(app: FastifyInstance, { dynamodb, activity, onChange }: Deps): void {
  const track = async <T>(action: string, target: string, run: () => Promise<T>): Promise<T> => {
    const result = await activity.track('dynamodb', action, target, run);
    onChange();
    return result;
  };

  app.get('/api/dynamodb/tables', async () => ({ tables: await dynamodb.listTables() }));

  app.post<{ Body: NewTable }>(
    '/api/dynamodb/tables',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'partitionKey'],
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 255, pattern: '^[a-zA-Z0-9_.-]+$' },
            partitionKey: keyDefinition,
            sortKey: keyDefinition,
          },
        },
      },
    },
    async (request, reply) => {
      const table = request.body;
      if (table.sortKey && table.sortKey.name === table.partitionKey.name) {
        throw new BadRequestError('A chave de classificação precisa ter um nome diferente da chave de partição.');
      }
      await track('CreateTable', table.name, () => dynamodb.createTable(table));
      return reply.status(201).send({ name: table.name });
    },
  );

  app.get<{ Params: { table: string } }>('/api/dynamodb/tables/:table', { schema: { params: tableParams } }, async (request) => {
    const { table } = request.params;
    const [summary, description] = await Promise.all([dynamodb.summary(table), dynamodb.describe(table)]);
    return {
      summary,
      arn: description.TableArn ?? null,
      attributeDefinitions: description.AttributeDefinitions ?? [],
      globalSecondaryIndexes: (description.GlobalSecondaryIndexes ?? []).map((i) => i.IndexName),
      localSecondaryIndexes: (description.LocalSecondaryIndexes ?? []).map((i) => i.IndexName),
    };
  });

  app.delete<{ Params: { table: string } }>('/api/dynamodb/tables/:table', { schema: { params: tableParams } }, async (request, reply) => {
    const { table } = request.params;
    await track('DeleteTable', table, () => dynamodb.deleteTable(table));
    return reply.status(204).send();
  });

  app.get<{ Params: { table: string }; Querystring: { limit?: number; cursor?: string } }>(
    '/api/dynamodb/tables/:table/items',
    {
      schema: {
        params: tableParams,
        querystring: {
          type: 'object',
          properties: { limit: { type: 'integer', minimum: 1, maximum: 300 }, cursor: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const page = await dynamodb.scanPage(
        request.params.table,
        request.query.limit ?? 50,
        decodeCursor(request.query.cursor),
      );
      return { items: page.items.map(itemToWire), nextCursor: encodeCursor(page.lastEvaluatedKey) };
    },
  );

  app.put<{ Params: { table: string }; Body: { item: unknown } }>(
    '/api/dynamodb/tables/:table/items',
    { schema: { params: tableParams, body: { type: 'object', required: ['item'], properties: { item: { type: 'object' } } } } },
    async (request) => {
      const { table } = request.params;
      const item = parseItem(request.body.item, 'item');
      await track('PutItem', table, () => dynamodb.putItem(table, item));
      return { ok: true };
    },
  );

  app.post<{ Params: { table: string }; Body: { keys: unknown[] } }>(
    '/api/dynamodb/tables/:table/delete-items',
    {
      schema: {
        params: tableParams,
        body: { type: 'object', required: ['keys'], properties: { keys: { type: 'array', minItems: 1, items: { type: 'object' } } } },
      },
    },
    async (request) => {
      const { table } = request.params;
      const keys = request.body.keys.map((key, i) => parseItem(key, `keys[${i}]`));
      await track('DeleteItem', `${table} (${keys.length})`, async () => {
        for (const key of keys) await dynamodb.deleteItem(table, key);
      });
      return { deleted: keys.length };
    },
  );
}
