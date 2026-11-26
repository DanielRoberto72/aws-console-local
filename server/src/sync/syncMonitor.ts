import type { FastifyBaseLogger } from 'fastify';
import type { EmulatorProbe } from '../aws/emulatorProbe.js';
import { inTransaction, type Db } from '../db/pool.js';
import { describeError } from '../http/errors.js';
import type { SyncAdapter } from './syncAdapter.js';

export type SyncAction = 'restore' | 'snapshot' | 'wait';

/**
 * Regra central da persistência: só se pode espelhar o emulador no banco depois que
 * a instância atual (identificada pelo bootId) recebeu o estado salvo. Caso contrário,
 * um emulador recém-iniciado e vazio apagaria os dados guardados.
 *
 * Depois que o banco é substituído (importação, modelo ou reinício do ambiente), a
 * instância antiga é descartada: nada é lido dela nem gravado nela até o emulador reiniciar.
 */
export function decideSyncAction(currentBootId: string, restoredBootId: string | null, discardedBootId: string | null = null): SyncAction {
  if (currentBootId === discardedBootId) return 'wait';
  return currentBootId === restoredBootId ? 'snapshot' : 'restore';
}

export interface SyncStatus {
  emulator: 'unknown' | 'online' | 'offline';
  emulatorReason: string | null;
  phase: 'idle' | 'restoring' | 'snapshotting' | 'awaiting-restart';
  /** Quando o console pediu o reinício do emulador que ainda não aconteceu. */
  restartRequestedAt: string | null;
  lastRestoreAt: string | null;
  lastSnapshotAt: string | null;
  lastError: string | null;
}

interface SyncStateRow {
  restored_boot_id: string | null;
  discarded_boot_id: string | null;
  restart_requested_at: Date | null;
  last_restore_at: Date | null;
  last_snapshot_at: Date | null;
  last_error: string | null;
}

export class SyncMonitor {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private rerunRequested = false;
  private emulator: Pick<SyncStatus, 'emulator' | 'emulatorReason'> = { emulator: 'unknown', emulatorReason: null };
  private phase: SyncStatus['phase'] = 'idle';
  /** Serializa as sincronizações e as substituições do banco (ver exclusive). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: Db,
    private readonly probe: () => Promise<EmulatorProbe>,
    private readonly adapters: readonly SyncAdapter[],
    private readonly intervalMs: number,
    private readonly log: FastifyBaseLogger,
  ) {}

  start(): void {
    this.trigger();
    this.timer = setInterval(() => this.trigger(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  /** Pede uma sincronização agora (ex.: logo após uma alteração feita pelo painel). */
  trigger(): void {
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    void this.run();
  }

  /**
   * Executa o trabalho sem nenhuma sincronização em andamento, esperando a atual terminar.
   * Usado para substituir o banco sem que um snapshot concorrente o sobrescreva.
   */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Sincroniza agora e espera terminar. */
  syncNow(): Promise<void> {
    return this.exclusive(async () => {
      try {
        await this.tick();
      } finally {
        this.phase = 'idle';
      }
    });
  }

  async status(): Promise<SyncStatus> {
    const state = await this.loadState();
    const awaiting = Boolean(state.discarded_boot_id);
    return {
      ...this.emulator,
      phase: awaiting ? 'awaiting-restart' : this.phase,
      restartRequestedAt: awaiting ? (state.restart_requested_at?.toISOString() ?? null) : null,
      lastRestoreAt: state.last_restore_at?.toISOString() ?? null,
      lastSnapshotAt: state.last_snapshot_at?.toISOString() ?? null,
      lastError: state.last_error,
    };
  }

  private async run(): Promise<void> {
    this.running = true;
    try {
      do {
        this.rerunRequested = false;
        await this.exclusive(() => this.tick());
      } while (this.rerunRequested);
    } finally {
      this.running = false;
      this.phase = 'idle';
    }
  }

  private async tick(): Promise<void> {
    const probe = await this.probe();
    if (!probe.online) {
      this.emulator = { emulator: 'offline', emulatorReason: probe.reason };
      return;
    }
    this.emulator = { emulator: 'online', emulatorReason: null };

    const state = await this.loadState();
    const action = decideSyncAction(probe.bootId, state.restored_boot_id, state.discarded_boot_id);
    if (action === 'wait') return;
    try {
      if (action === 'restore') await this.restore(probe.bootId);
      else await this.snapshot();
    } catch (err) {
      const message = `${action === 'restore' ? 'Restauração' : 'Snapshot'} falhou: ${describeError(err)}`;
      this.log.error({ err }, message);
      await this.db.query('UPDATE sync_state SET last_error = $1 WHERE id = 1', [message]);
    }
  }

  private async restore(bootId: string): Promise<void> {
    this.phase = 'restoring';
    this.log.info('nova instância do emulador detectada; restaurando estado salvo');
    for (const adapter of this.adapters) await adapter.restore(this.db);
    await this.db.query(
      'UPDATE sync_state SET restored_boot_id = $1, discarded_boot_id = NULL, restart_requested_at = NULL, last_restore_at = now(), last_error = NULL WHERE id = 1',
      [bootId],
    );
    this.log.info('estado restaurado no emulador');
  }

  private async snapshot(): Promise<void> {
    this.phase = 'snapshotting';
    await inTransaction(this.db, async (tx) => {
      for (const adapter of this.adapters) await adapter.snapshot(tx);
      await tx.query('UPDATE sync_state SET last_snapshot_at = now(), last_error = NULL WHERE id = 1');
    });
  }

  private async loadState(): Promise<SyncStateRow> {
    const { rows } = await this.db.query<SyncStateRow>(
      'SELECT restored_boot_id, discarded_boot_id, restart_requested_at, last_restore_at, last_snapshot_at, last_error FROM sync_state WHERE id = 1',
    );
    const row = rows[0];
    if (!row) throw new Error('sync_state não inicializado');
    return row;
  }
}
