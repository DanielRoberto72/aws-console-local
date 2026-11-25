import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import { DEFAULT_GROUP, type ScheduleDefinition, type SchedulerService } from './schedulerService.js';

export class SchedulerSync implements SyncAdapter {
  readonly service = 'scheduler' as const;

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const resources: StoredResource[] = [];
    for (const group of await this.scheduler.listGroups()) {
      if (group !== DEFAULT_GROUP) resources.push({ type: 'group', name: group, data: {} });
    }
    for (const summary of await this.scheduler.listSchedules()) {
      const { arn: _arn, createdAt: _createdAt, ...definition } = await this.scheduler.getSchedule(summary.group, summary.name);
      resources.push({ type: 'schedule', name: `${summary.group}|${summary.name}`, data: definition });
    }
    await this.store.replace(tx, 'scheduler', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { name } of await this.store.list(db, 'scheduler', 'group')) await createIfMissing(() => this.scheduler.createGroup(name));
    for (const { data } of await this.store.list<ScheduleDefinition>(db, 'scheduler', 'schedule')) {
      await createIfMissing(() => this.scheduler.createSchedule(data));
    }
  }
}
