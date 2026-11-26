import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { EmulatorProbe } from '../aws/emulatorProbe.js';
import { inTransaction, type Db } from '../db/pool.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { SyncMonitor } from '../sync/syncMonitor.js';
import type { EmulatorControl } from './emulatorControl.js';
import {
  compressEnvironment,
  parseEnvironmentFile,
  readEnvironment,
  replaceEnvironment,
  summarizeEnvironment,
  type EnvironmentFile,
} from './environmentFile.js';

export interface LabTemplate {
  id: string;
  title: string;
  description: string;
  /** Quantidade de recursos por serviço. */
  resources: Record<string, number>;
}

const TEMPLATE_ID = /^[a-z0-9-]+$/;

/**
 * Exporta, importa e reinicia o ambiente. Substituir o ambiente troca o banco e reinicia o
 * emulador; a instância nova recebe o estado do banco pela restauração de sempre.
 */
export class EnvironmentService {
  constructor(
    private readonly db: Db,
    private readonly sync: SyncMonitor,
    private readonly probe: () => Promise<EmulatorProbe>,
    private readonly control: EmulatorControl,
    private readonly templatesDir: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  async status(): Promise<{ canReplace: boolean; reason: string | null }> {
    if (await this.control.canRestart()) return { canReplace: true, reason: null };
    return {
      canReplace: false,
      reason:
        'O console não consegue reiniciar o emulador: rode a stack pelo Docker Compose e, se a imagem do emulador é anterior a esta versão do console, reconstrua-a com docker compose up -d --build.',
    };
  }

  /** Sincroniza antes, para incluir alterações feitas fora do console (CLI, SDKs). */
  async export(): Promise<{ file: Buffer; filename: string }> {
    await this.sync.syncNow();
    const version = (await this.control.installedVersion())?.version ?? null;
    const environment = await this.sync.exclusive(() => readEnvironment(this.db, version));
    const stamp = environment.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    return { file: compressEnvironment(environment), filename: `ambiente-${stamp}.json.gz` };
  }

  async import(content: Buffer): Promise<void> {
    await this.replace(parseEnvironmentFile(content), 'importado');
  }

  async reset(): Promise<void> {
    await this.replace(null, 'reiniciado do zero');
  }

  async templates(): Promise<LabTemplate[]> {
    const files = (await readdir(this.templatesDir).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
    const templates: LabTemplate[] = [];
    for (const file of files) {
      const id = file.replace(/\.json$/, '');
      const template = await this.template(id);
      templates.push({ id, title: template.title ?? id, description: template.description ?? '', resources: summarizeEnvironment(template) });
    }
    return templates;
  }

  async loadTemplate(id: string): Promise<void> {
    await this.replace(await this.template(id), `carregado do modelo ${id}`);
  }

  private async template(id: string): Promise<EnvironmentFile> {
    if (!TEMPLATE_ID.test(id)) throw new NotFoundError(`Modelo ${id} não encontrado.`);
    const content = await readFile(join(this.templatesDir, `${id}.json`)).catch(() => null);
    if (!content) throw new NotFoundError(`Modelo ${id} não encontrado.`);
    return parseEnvironmentFile(content);
  }

  private async replace(file: EnvironmentFile | null, description: string): Promise<void> {
    const status = await this.status();
    if (!status.canReplace) throw new ConflictError(status.reason!, 'EmulatorRestartUnavailable');

    await this.sync.exclusive(async () => {
      const probe = await this.probe();
      if (!probe.online) throw new ConflictError(`O emulador está fora do ar (${probe.reason}).`, 'EmulatorUnavailable');
      // A instância atual é descartada na mesma transação: nenhum snapshot dela pode
      // sobrescrever o banco novo, e o próximo emulador é restaurado a partir dele.
      await inTransaction(this.db, async (tx) => {
        await replaceEnvironment(tx, file);
        await tx.query('UPDATE sync_state SET discarded_boot_id = $1, restart_requested_at = now(), last_error = NULL WHERE id = 1', [
          probe.bootId,
        ]);
      });
      await this.control.requestRestart();
    });
    this.log.info(`ambiente ${description}; aguardando o emulador reiniciar`);
  }
}
