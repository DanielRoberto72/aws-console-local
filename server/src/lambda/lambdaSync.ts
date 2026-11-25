import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { createIfMissing } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { FunctionSettings, InvokePermission, LambdaService } from './lambdaService.js';

interface SavedFunction extends FunctionSettings {
  codeSha256: string;
  permissions: InvokePermission[];
}

/** Persiste configuração e pacote de código; o zip só é baixado quando o hash muda. */
export class LambdaSync implements SyncAdapter {
  readonly service = 'lambda' as const;

  constructor(
    private readonly lambda: LambdaService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const saved = new Map(
      (await this.store.list<SavedFunction>(tx, 'lambda', 'function')).map((r) => [r.name, r]),
    );
    const resources: StoredResource<SavedFunction>[] = [];

    for (const config of await this.lambda.listConfigurations()) {
      const name = config.FunctionName;
      // Só funções empacotadas em zip podem ser recriadas a partir do banco.
      if (!name || config.PackageType === 'Image') continue;
      const data: SavedFunction = {
        runtime: config.Runtime ?? '',
        handler: config.Handler ?? '',
        role: config.Role ?? '',
        memorySize: config.MemorySize ?? 128,
        timeout: config.Timeout ?? 3,
        description: config.Description ?? '',
        environment: config.Environment?.Variables ?? {},
        codeSha256: config.CodeSha256 ?? '',
        permissions: await this.lambda.invokePermissions(name),
      };
      const previous = saved.get(name);
      let blob = previous?.data.codeSha256 === data.codeSha256 ? previous.blob : null;
      if (!blob) {
        const { location } = await this.lambda.getConfigurationAndCodeLocation(name);
        if (!location) continue;
        blob = await this.lambda.downloadCode(location);
      }
      resources.push({ type: 'function', name, data, blob });
    }
    await this.store.replace(tx, 'lambda', resources);
  }

  async restore(db: Queryable): Promise<void> {
    for (const { name, data, blob } of await this.store.list<SavedFunction>(db, 'lambda', 'function')) {
      if (!blob) continue;
      await createIfMissing(() => this.lambda.createFromZip(name, data, blob));
      for (const permission of data.permissions ?? []) await this.lambda.addInvokePermission(name, permission);
    }
  }
}
