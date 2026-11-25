import type { FastifyBaseLogger } from 'fastify';
import type { ActivityLog } from '../activity/activityLog.js';
import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import { describeError } from '../http/errors.js';
import { isAlreadyExists } from '../sync/conflicts.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { CatalogRegistry } from './registry.js';
import type { CatalogService, Input, ResourceType } from './types.js';

interface SavedResource {
  id: string;
  parentId?: string;
  input: Input;
}

/**
 * IDs gerados pelo emulador (instâncias, VPCs, pools do Cognito) mudam a cada
 * restauração. O mapa liga o ID salvo ao novo, para que referências de outros
 * recursos, inclusive de outros serviços, apontem para o recurso recriado.
 */
export class IdMap {
  private readonly ids = new Map<string, Map<string, string>>();

  set(typeRef: string, oldId: string, newId: string): void {
    if (!this.ids.has(typeRef)) this.ids.set(typeRef, new Map());
    this.ids.get(typeRef)!.set(oldId, newId);
  }

  resolve(typeRef: string, id: string): string {
    return this.ids.get(typeRef)?.get(id) ?? id;
  }
}

/**
 * Ordena os tipos do serviço para que cada um venha depois do pai e dos tipos que seus
 * campos referenciam (ex.: instância depois de sub-rede, grupo de segurança e par de chaves).
 */
export function persistedTypes(service: CatalogService): ResourceType[] {
  const ordered: ResourceType[] = [];
  const visiting = new Set<ResourceType>();
  const byKey = (key: string | undefined) => service.types.find((t) => t.key === key);
  const dependencies = (type: ResourceType) => [
    byKey(type.parent),
    ...(type.create?.fields ?? []).map((f) => (f.source?.startsWith(`${service.id}/`) ? byKey(f.source.split('/')[1]) : undefined)),
  ];
  const visit = (type: ResourceType) => {
    if (ordered.includes(type) || visiting.has(type)) return;
    visiting.add(type);
    for (const dependency of dependencies(type)) if (dependency && dependency !== type) visit(dependency);
    ordered.push(type);
  };
  service.types.forEach(visit);
  return ordered.filter((t) => t.persist && t.create);
}

/** Persistência genérica de um serviço do catálogo. */
export class CatalogSync implements SyncAdapter {
  readonly service: CatalogService['id'];

  constructor(
    private readonly definition: CatalogService,
    private readonly registry: CatalogRegistry,
    private readonly store: ResourceStore,
    private readonly ids: IdMap,
    private readonly activity: ActivityLog,
    private readonly log: FastifyBaseLogger,
  ) {
    this.service = definition.id;
  }

  /** Entradas de criação recentes, para os campos preservados (ver ResourceType.preserve). */
  private readonly remembered = new Map<string, Input>();

  remember(typeKey: string, id: string, input: Input, parentId?: string): void {
    const key = `${typeKey}|${parentId ?? ''}|${id}`;
    this.remembered.set(key, { ...this.remembered.get(key), ...input });
  }

  async snapshot(tx: Queryable): Promise<void> {
    const saved = await this.store.list<SavedResource>(tx, this.definition.id);
    const previous = new Map<string, Input>(saved.map((s) => [`${s.type}|${s.data.parentId ?? ''}|${s.data.id}`, s.data.input]));
    const resources: StoredResource<SavedResource>[] = [];
    for (const type of persistedTypes(this.definition)) {
      try {
        resources.push(...(await this.snapshotType(type, previous)));
      } catch (err) {
        // Uma leitura que falha não pode apagar o que já estava salvo, nem travar os outros serviços.
        this.log.warn({ err, service: this.definition.id, type: type.key }, 'snapshot do tipo falhou; mantendo o que estava salvo');
        resources.push(...saved.filter((s) => s.type === type.key));
      }
    }
    await this.store.replace(tx, this.definition.id, resources);
  }

  private async snapshotType(type: ResourceType, previous: Map<string, Input>): Promise<StoredResource<SavedResource>[]> {
    const resources: StoredResource<SavedResource>[] = [];
    for (const parentId of await this.parentIds(type)) {
      for (const row of await type.list(parentId)) {
        if (row.managedBy) continue;
        const input = await type.persist!(row, parentId);
        if (!input) continue;
        const key = `${type.key}|${parentId ?? ''}|${row.id}`;
        for (const field of type.preserve ?? []) {
          input[field] ??= this.remembered.get(key)?.[field] ?? previous.get(key)?.[field];
        }
        // Filhos de pais diferentes podem ter o mesmo ID (ex.: tabela "vendas" em dois bancos).
        resources.push({ type: type.key, name: parentId ? `${parentId}/${row.id}` : row.id, data: { id: row.id, parentId, input } });
      }
    }
    return resources;
  }

  /**
   * Falhas de um recurso não interrompem a restauração: recursos identificados por ID
   * seriam duplicados se tudo fosse refeito no ciclo seguinte. A falha fica no histórico.
   */
  async restore(db: Queryable): Promise<void> {
    const saved = await this.store.list<SavedResource>(db, this.definition.id);
    for (const type of persistedTypes(this.definition)) {
      for (const { data } of saved.filter((s) => s.type === type.key)) {
        const parentId = data.parentId && type.parent ? this.ids.resolve(`${this.definition.id}/${type.parent}`, data.parentId) : data.parentId;
        try {
          const { id } = await type.create!.run(this.remap(type, data.input), parentId);
          this.ids.set(`${this.definition.id}/${type.key}`, data.id, id);
        } catch (err) {
          if (isAlreadyExists(err)) continue;
          this.log.warn({ err, service: this.definition.id, type: type.key, id: data.id }, 'falha ao restaurar recurso');
          await this.activity.record(this.definition.id, `Restore:${type.key}`, data.id, 'failure', describeError(err));
        }
      }
    }
  }

  private async parentIds(type: ResourceType): Promise<(string | undefined)[]> {
    if (!type.parent) return [undefined];
    const parent = this.definition.types.find((t) => t.key === type.parent)!;
    const rows = [];
    for (const grandParentId of await this.parentIds(parent)) rows.push(...(await parent.list(grandParentId)));
    return rows.filter((r) => !r.managedBy).map((r) => r.id);
  }

  private remap(type: ResourceType, input: Input): Input {
    const result: Input = { ...input };
    for (const field of type.create!.fields) {
      const source = this.registry.catalogSource(field);
      const value = result[field.name];
      if (!source || value === undefined) continue;
      const ref = `${source.service.id}/${source.type.key}`;
      result[field.name] = Array.isArray(value) ? value.map((v) => this.ids.resolve(ref, v)) : this.ids.resolve(ref, String(value));
    }
    return result;
  }
}
