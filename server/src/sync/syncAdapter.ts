import type pg from 'pg';
import type { ServiceName } from '../activity/activityLog.js';
import type { Queryable } from '../db/pool.js';

/** Persistência de um serviço: espelha o emulador no banco e o recria a partir dele. */
export interface SyncAdapter {
  readonly service: ServiceName;
  /** Lê o estado atual do emulador e o grava no banco, dentro da transação recebida. */
  snapshot(tx: pg.PoolClient): Promise<void>;
  /** Recria no emulador o que está salvo no banco. Precisa ser idempotente. */
  restore(db: Queryable): Promise<void>;
}
