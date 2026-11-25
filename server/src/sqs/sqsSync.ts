import type pg from 'pg';
import type { Queryable } from '../db/pool.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import { queueNameFromUrl, type QueueAttributes, type SqsService } from './sqsService.js';

/** Atributos aceitos por CreateQueue; os demais (contadores, ARN, datas) são só leitura. */
const SETTABLE_ATTRIBUTES = [
  'DelaySeconds',
  'MaximumMessageSize',
  'MessageRetentionPeriod',
  'Policy',
  'ReceiveMessageWaitTimeSeconds',
  'VisibilityTimeout',
  'KmsMasterKeyId',
  'KmsDataKeyReusePeriodSeconds',
  'SqsManagedSseEnabled',
  'FifoQueue',
  'ContentBasedDeduplication',
  'DeduplicationScope',
  'FifoThroughputLimit',
] as const;

/** Referenciam outras filas (DLQ), então só são aplicados depois que todas existem. */
const DEPENDENT_ATTRIBUTES = ['RedrivePolicy', 'RedriveAllowPolicy'] as const;

function pick(attributes: QueueAttributes, names: readonly string[]): QueueAttributes {
  return Object.fromEntries(names.filter((n) => attributes[n] !== undefined).map((n) => [n, attributes[n]!]));
}

/**
 * Persiste a configuração das filas. Mensagens não são salvas: são transitórias
 * por natureza e reentregá-las depois de um reinício causaria efeitos inesperados.
 */
export class SqsSync implements SyncAdapter {
  readonly service = 'sqs' as const;

  constructor(private readonly sqs: SqsService) {}

  async snapshot(tx: pg.PoolClient): Promise<void> {
    const urls = await this.sqs.listQueueUrls();
    const names = urls.map(queueNameFromUrl);
    await tx.query('DELETE FROM sqs_queues WHERE NOT (name = ANY($1::text[]))', [names]);
    for (const url of urls) {
      await tx.query(
        `INSERT INTO sqs_queues (name, attributes) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET attributes = EXCLUDED.attributes`,
        [queueNameFromUrl(url), JSON.stringify(await this.sqs.attributes(url))],
      );
    }
  }

  async restore(db: Queryable): Promise<void> {
    const { rows } = await db.query<{ name: string; attributes: QueueAttributes }>('SELECT name, attributes FROM sqs_queues ORDER BY name');
    // CreateQueue é idempotente quando os atributos são iguais; com atributos diferentes, a
    // fila já foi recriada por outro caminho (ex.: stack do CloudFormation) e é mantida.
    for (const { name, attributes } of rows) await createIfMissing(() => this.sqs.createQueueWith(name, pick(attributes, SETTABLE_ATTRIBUTES)));
    for (const { name, attributes } of rows) {
      const dependent = pick(attributes, DEPENDENT_ATTRIBUTES);
      if (Object.keys(dependent).length > 0) await this.sqs.setAttributes(name, dependent);
    }
  }
}
