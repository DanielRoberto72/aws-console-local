import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../src/db/pool.js';
import type { SyncAdapter } from '../src/sync/syncAdapter.js';
import { decideSyncAction, SyncMonitor } from '../src/sync/syncMonitor.js';

describe('decideSyncAction', () => {
  it('restaura quando a instância do emulador ainda não recebeu o estado salvo', () => {
    expect(decideSyncAction('boot-2', 'boot-1')).toBe('restore');
    expect(decideSyncAction('boot-1', null)).toBe('restore');
  });

  it('espelha o emulador quando a instância atual já foi restaurada', () => {
    expect(decideSyncAction('boot-1', 'boot-1')).toBe('snapshot');
  });

  it('espera o reinício quando a instância atual foi descartada (banco substituído)', () => {
    expect(decideSyncAction('boot-1', 'boot-1', 'boot-1')).toBe('wait');
    expect(decideSyncAction('boot-2', 'boot-1', 'boot-1')).toBe('restore');
  });
});

/** Banco em memória que entende só as consultas de sync_state usadas pelo monitor. */
function fakeDb() {
  const state = { restored_boot_id: null as string | null, discarded_boot_id: null as string | null, restart_requested_at: null, last_restore_at: null, last_snapshot_at: null, last_error: null as string | null };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT restored_boot_id')) return { rows: [state] };
    if (sql.includes('restored_boot_id = $1')) state.restored_boot_id = params[0] as string;
    if (sql.includes('last_error = $1')) state.last_error = params[0] as string;
    return { rows: [] };
  });
  const tx = { query, release: vi.fn() };
  const db = { query, connect: vi.fn(async () => tx) } as unknown as Db;
  return { db, state };
}

const silentLog = { info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;

function adapter(): SyncAdapter & { restore: ReturnType<typeof vi.fn>; snapshot: ReturnType<typeof vi.fn> } {
  return { service: 's3', restore: vi.fn(async () => undefined), snapshot: vi.fn(async () => undefined) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SyncMonitor', () => {
  it('restaura uma vez por instância e depois passa a espelhar', async () => {
    const { db, state } = fakeDb();
    const s3 = adapter();
    const monitor = new SyncMonitor(db, async () => ({ online: true, bootId: 'boot-1' }), [s3], 60_000, silentLog);

    monitor.trigger();
    await flush();
    expect(s3.restore).toHaveBeenCalledTimes(1);
    expect(state.restored_boot_id).toBe('boot-1');

    monitor.trigger();
    await flush();
    expect(s3.restore).toHaveBeenCalledTimes(1);
    expect(s3.snapshot).toHaveBeenCalledTimes(1);
  });

  it('não espelha depois de uma restauração com falha, para não apagar os dados salvos', async () => {
    const { db, state } = fakeDb();
    const s3 = adapter();
    s3.restore.mockRejectedValue(new Error('emulador recusou'));
    const monitor = new SyncMonitor(db, async () => ({ online: true, bootId: 'boot-1' }), [s3], 60_000, silentLog);

    monitor.trigger();
    await flush();
    monitor.trigger();
    await flush();

    expect(s3.snapshot).not.toHaveBeenCalled();
    expect(s3.restore).toHaveBeenCalledTimes(2);
    expect(state.restored_boot_id).toBeNull();
    expect(state.last_error).toMatch(/Restauração falhou: Error: emulador recusou/);
  });

  it('não sincroniza enquanto um trabalho exclusivo roda e nada faz com a instância descartada', async () => {
    const { db, state } = fakeDb();
    const s3 = adapter();
    state.restored_boot_id = 'boot-1';
    const monitor = new SyncMonitor(db, async () => ({ online: true, bootId: 'boot-1' }), [s3], 60_000, silentLog);

    let release!: () => void;
    const work = monitor.exclusive(() => new Promise<void>((resolve) => (release = resolve)));
    monitor.trigger();
    await flush();
    expect(s3.snapshot).not.toHaveBeenCalled();

    state.discarded_boot_id = 'boot-1';
    release();
    await work;
    await flush();
    expect(s3.snapshot).not.toHaveBeenCalled();
    expect(s3.restore).not.toHaveBeenCalled();
    expect((await monitor.status()).phase).toBe('awaiting-restart');
  });

  it('não toca no banco nem nos serviços com o emulador fora do ar', async () => {
    const { db } = fakeDb();
    const s3 = adapter();
    const monitor = new SyncMonitor(db, async () => ({ online: false, reason: 'ECONNREFUSED' }), [s3], 60_000, silentLog);

    monitor.trigger();
    await flush();

    expect(s3.restore).not.toHaveBeenCalled();
    expect(s3.snapshot).not.toHaveBeenCalled();
    expect((await monitor.status()).emulator).toBe('offline');
  });
});
