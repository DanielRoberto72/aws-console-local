import type { Db } from '../db/pool.js';
import { describeError } from '../http/errors.js';

import type { CatalogServiceId } from '../catalog/ids.js';

export type ServiceName =
  | CatalogServiceId
  | 's3'
  | 'dynamodb'
  | 'sqs'
  | 'lambda'
  | 'logs'
  | 'sns'
  | 'secretsmanager'
  | 'ssm'
  | 'events'
  | 'scheduler'
  | 'stepfunctions'
  | 's3vectors'
  | 'bedrock'
  | 'iam';

export interface ActivityEntry {
  id: number;
  at: string;
  service: ServiceName;
  action: string;
  target: string;
  outcome: 'success' | 'failure';
  message: string | null;
}

/** Histórico das ações feitas pelo painel, exibido como "atividade recente". */
export class ActivityLog {
  constructor(private readonly db: Db) {}

  /** Executa a ação e registra o resultado; a falha é registrada e propagada. */
  async track<T>(service: ServiceName, action: string, target: string, run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      await this.insert(service, action, target, 'success', null);
      return result;
    } catch (err) {
      await this.insert(service, action, target, 'failure', describeError(err)).catch(() => undefined);
      throw err;
    }
  }

  async recent(limit: number): Promise<ActivityEntry[]> {
    const { rows } = await this.db.query(
      `SELECT id, at, service, action, target, outcome, message
         FROM activity ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({ ...row, id: Number(row.id), at: new Date(row.at).toISOString() }));
  }

  /** Registra um fato sem ação associada (ex.: falha ao restaurar um recurso). */
  async record(service: ServiceName, action: string, target: string, outcome: 'success' | 'failure', message: string | null): Promise<void> {
    await this.insert(service, action, target, outcome, message);
  }

  private async insert(
    service: ServiceName,
    action: string,
    target: string,
    outcome: 'success' | 'failure',
    message: string | null,
  ): Promise<void> {
    await this.db.query(
      'INSERT INTO activity (service, action, target, outcome, message) VALUES ($1, $2, $3, $4, $5)',
      [service, action, target, outcome, message],
    );
  }
}
