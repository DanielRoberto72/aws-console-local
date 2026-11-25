import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import { DEFAULT_BUS, type EventsService, type RuleDefinition, type RuleTarget } from './eventsService.js';

interface SavedRule {
  rule: RuleDefinition;
  targets: RuleTarget[];
}

/** Barramentos personalizados primeiro; depois as regras com seus destinos. */
export class EventsSync implements SyncAdapter {
  readonly service = 'events' as const;

  constructor(
    private readonly events: EventsService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const resources: StoredResource[] = [];
    const buses = await this.events.listBuses();
    for (const bus of buses) if (bus.name !== DEFAULT_BUS) resources.push({ type: 'bus', name: bus.name, data: {} });
    for (const bus of buses) {
      for (const rule of await this.events.listRules(bus.name)) {
        const { arn: _arn, ...definition } = rule;
        const data: SavedRule = { rule: definition, targets: await this.events.listTargets(bus.name, rule.name) };
        resources.push({ type: 'rule', name: `${bus.name}|${rule.name}`, data });
      }
    }
    await this.store.replace(tx, 'events', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { name } of await this.store.list(db, 'events', 'bus')) await createIfMissing(() => this.events.createBus(name));
    for (const { data } of await this.store.list<SavedRule>(db, 'events', 'rule')) {
      await this.events.putRule(data.rule);
      await this.events.putTargets(data.rule.bus, data.rule.name, data.targets);
    }
  }
}
