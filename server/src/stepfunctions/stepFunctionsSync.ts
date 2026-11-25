import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { StateMachineDefinition, StepFunctionsService } from './stepFunctionsService.js';

/** Persiste as definições; o histórico de execuções não é recriado. */
export class StepFunctionsSync implements SyncAdapter {
  readonly service = 'stepfunctions' as const;

  constructor(
    private readonly sfn: StepFunctionsService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const resources: StoredResource<StateMachineDefinition>[] = [];
    for (const machine of await this.sfn.listStateMachines()) {
      const { name, type, definition, roleArn } = await this.sfn.describe(machine.name);
      resources.push({ type: 'state-machine', name, data: { name, type, definition, roleArn } });
    }
    await this.store.replace(tx, 'stepfunctions', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { data } of await this.store.list<StateMachineDefinition>(db, 'stepfunctions')) {
      await createIfMissing(() => this.sfn.create(data));
    }
  }
}
