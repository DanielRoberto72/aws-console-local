import type { Queryable } from '../db/pool.js';
import type { ResourceStore } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { LogsService } from './logsService.js';

/**
 * Persiste os grupos de log e a retenção. Os eventos não são salvos: são histórico,
 * podem ser volumosos e voltam a ser gerados pelas próprias aplicações.
 */
export class LogsSync implements SyncAdapter {
  readonly service = 'logs' as const;

  constructor(
    private readonly logs: LogsService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const groups = await this.logs.listGroups();
    await this.store.replace(
      tx,
      'logs',
      groups.map((g) => ({ type: 'log-group', name: g.name, data: { retentionDays: g.retentionDays } })),
    );
  }

  async restore(db: Queryable): Promise<void> {
    for (const { name, data } of await this.store.list<{ retentionDays: number | null }>(db, 'logs')) {
      await createIfMissing(() => this.logs.createGroup(name, null));
      if (data.retentionDays) await this.logs.setRetention(name, data.retentionDays);
    }
  }
}
