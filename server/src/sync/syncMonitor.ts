import type { FastifyBaseLogger } from 'fastify';
import type { EmulatorProbe } from '../aws/emulatorProbe.js';
import { inTransaction, type Db } from '../db/pool.js';
import { describeError } from '../http/errors.js';
import type { SyncAdapter } from './syncAdapter.js';

export type SyncAction = 'restore' | 'snapshot';

/**
 * Regra central da persistência: só se pode espelhar o emulador no banco depois que
 * a instância atual (identificada pelo bootId) recebeu o estado salvo. Caso contrário,
 * um emulador recém-iniciado e vazio apagaria os dados guardados.
 */
export function decideSyncAction(currentBootId: string, restoredBootId: string | null): SyncAction {
  return currentBootId === restoredBootId ? 'snapshot' : 'restore';
}

export interface SyncStatus {
  emulator: 'unknown' | 'online' | 'offline';
  emulatorReason: string | null;
  phase: 'idle' | 'restoring' | 'snapshotting';
  lastRestoreAt: string | null;
  lastSnapshotAt: string | null;
  lastError: string | null;
}

interface SyncStateRow {
  restored_boot_id: string | null;
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

  async status(): Promise<SyncStatus> {
    const state = await this.loadState();
    return {
      ...this.emulator,
      phase: this.phase,
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
        await this.tick();
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
    const action = decideSyncAction(probe.bootId, state.restored_boot_id);
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
      'UPDATE sync_state SET restored_boot_id = $1, last_restore_at = now(), last_error = NULL WHERE id = 1',
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
      'SELECT restored_boot_id, last_restore_at, last_snapshot_at, last_error FROM sync_state WHERE id = 1',
    );
    const row = rows[0];
    if (!row) throw new Error('sync_state não inicializado');
    return row;
  }
}
