import type { ServiceName } from '../activity/activityLog.js';
import type { Queryable } from './pool.js';

/** Recurso salvo de um serviço: configuração em JSON e, se houver, conteúdo binário. */
export interface StoredResource<T = unknown> {
  type: string;
  name: string;
  data: T;
  blob?: Buffer | null;
}

/**
 * Espelho genérico usado pelos serviços que não precisam de consultas próprias no banco.
 * A ordem de gravação é preservada e reaproveitada na restauração, para que um recurso
 * seja recriado depois daqueles de que depende (ex.: assinatura depois do tópico).
 */
export class ResourceStore {
  /** Substitui tudo o que está salvo do serviço pelo estado atual do emulador. */
  async replace(tx: Queryable, service: ServiceName, resources: readonly StoredResource[]): Promise<void> {
    await tx.query('DELETE FROM stored_resources WHERE service = $1', [service]);
    for (const resource of resources) {
      await tx.query(
        'INSERT INTO stored_resources (service, type, name, data, blob) VALUES ($1, $2, $3, $4, $5)',
        [service, resource.type, resource.name, JSON.stringify(resource.data), resource.blob ?? null],
      );
    }
  }

  async list<T>(db: Queryable, service: ServiceName, type?: string): Promise<StoredResource<T>[]> {
    const { rows } = await db.query<{ type: string; name: string; data: T; blob: Buffer | null }>(
      `SELECT type, name, data, blob FROM stored_resources
        WHERE service = $1 AND ($2::text IS NULL OR type = $2) ORDER BY id`,
      [service, type ?? null],
    );
    return rows;
  }
}
