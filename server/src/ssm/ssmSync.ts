import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { ParameterInput, SsmService } from './ssmService.js';

/** Persiste o valor atual de cada parâmetro; o histórico de versões não é recriado. */
export class SsmSync implements SyncAdapter {
  readonly service = 'ssm' as const;

  constructor(
    private readonly ssm: SsmService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const resources: StoredResource<ParameterInput>[] = [];
    for (const summary of await this.ssm.listParameters()) {
      const { value, type } = await this.ssm.getParameter(summary.name);
      resources.push({ type: 'parameter', name: summary.name, data: { name: summary.name, type, value, description: summary.description } });
    }
    await this.store.replace(tx, 'ssm', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { data } of await this.store.list<ParameterInput>(db, 'ssm')) await this.ssm.putParameter(data, true);
  }
}
