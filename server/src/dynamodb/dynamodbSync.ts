import { createHash } from 'node:crypto';
import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import type pg from 'pg';
import type { Queryable } from '../db/pool.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import { itemFromWire, itemToWire } from './attributeJson.js';
import { toCreateTableInput } from './createTableInput.js';
import type { DynamoDbService } from './dynamodbService.js';

export class DynamoDbSync implements SyncAdapter {
  readonly service = 'dynamodb' as const;

  constructor(private readonly dynamodb: DynamoDbService) {}

  async snapshot(tx: pg.PoolClient): Promise<void> {
    const names = await this.dynamodb.listTableNames();
    await tx.query('DELETE FROM dynamodb_tables WHERE NOT (name = ANY($1::text[]))', [names]);

    for (const name of names) {
      const table = await this.dynamodb.describe(name);
      // Tabela ainda sendo criada ou excluída: fica para o próximo ciclo.
      if (table.TableStatus !== 'ACTIVE') continue;

      const items = (await this.dynamodb.scanAll(name)).map(itemToWire);
      const itemsJson = JSON.stringify(items);
      const hash = createHash('sha256').update(itemsJson).digest('hex');

      const { rows } = await tx.query<{ items_hash: string }>('SELECT items_hash FROM dynamodb_tables WHERE name = $1', [name]);
      await tx.query(
        `INSERT INTO dynamodb_tables (name, create_input) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET create_input = EXCLUDED.create_input`,
        [name, JSON.stringify(toCreateTableInput(table))],
      );
      // Itens só são regravados quando mudaram, para não reescrever a tabela a cada ciclo.
      if (rows[0]?.items_hash === hash) continue;
      await tx.query('DELETE FROM dynamodb_items WHERE table_name = $1', [name]);
      await tx.query(
        `INSERT INTO dynamodb_items (table_name, item)
         SELECT $1, value FROM jsonb_array_elements($2::jsonb)`,
        [name, itemsJson],
      );
      await tx.query('UPDATE dynamodb_tables SET items_hash = $2 WHERE name = $1', [name, hash]);
    }
  }

  async restore(db: Queryable): Promise<void> {
    const { rows: tables } = await db.query<{ name: string; create_input: CreateTableCommandInput }>(
      'SELECT name, create_input FROM dynamodb_tables ORDER BY name',
    );
    for (const { name, create_input } of tables) {
      try {
        await this.dynamodb.createTableFrom(create_input);
      } catch (err) {
        if ((err as Error).name !== 'ResourceInUseException') throw err;
      }
      // A criação é assíncrona: o emulador devolve CREATING antes de ACTIVE.
      await this.dynamodb.waitUntilActive(name);

      const { rows } = await db.query<{ item: unknown }>('SELECT item FROM dynamodb_items WHERE table_name = $1 ORDER BY id', [name]);
      await this.dynamodb.putItems(name, rows.map((r) => itemFromWire(r.item)));
    }
  }
}
