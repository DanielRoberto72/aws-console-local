import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { SecretsService, SecretValue } from './secretsService.js';

interface SavedSecret {
  description: string;
  value: SecretValue;
}

/** Persiste a versão atual de cada segredo (o histórico de versões não é recriado). */
export class SecretsSync implements SyncAdapter {
  readonly service = 'secretsmanager' as const;

  constructor(
    private readonly secrets: SecretsService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const resources: StoredResource<SavedSecret>[] = [];
    for (const secret of await this.secrets.listSecrets()) {
      resources.push({
        type: 'secret',
        name: secret.name,
        data: { description: secret.description, value: await this.secrets.getValue(secret.name) },
      });
    }
    await this.store.replace(tx, 'secretsmanager', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { name, data } of await this.store.list<SavedSecret>(db, 'secretsmanager')) {
      try {
        await this.secrets.create(name, data.description, data.value);
      } catch (err) {
        if ((err as Error).name !== 'ResourceExistsException') throw err;
        await this.secrets.putValue(name, data.value);
      }
    }
  }
}
