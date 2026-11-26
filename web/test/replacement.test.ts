import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../src/api/overview';
import { replacementProgress } from '../src/pages/environment/replacement';

const sync = (overrides: Partial<SyncStatus>): SyncStatus => ({
  emulator: 'online',
  emulatorReason: null,
  phase: 'idle',
  restartRequestedAt: null,
  lastRestoreAt: '2026-11-25T10:00:00.000Z',
  lastSnapshotAt: null,
  lastError: null,
  ...overrides,
});

describe('progresso da troca de ambiente', () => {
  const replacement = { previousRestoreAt: '2026-11-25T10:00:00.000Z', done: 'ok' };

  it('acompanha o reinício e a restauração até o emulador novo receber o estado', () => {
    expect(replacementProgress(replacement, sync({ phase: 'awaiting-restart' }))).toBe('restarting');
    expect(replacementProgress(replacement, sync({ emulator: 'offline' }))).toBe('restarting');
    expect(replacementProgress(replacement, sync({ phase: 'restoring' }))).toBe('restoring');
    expect(replacementProgress(replacement, sync({}))).toBe('restarting');
    expect(replacementProgress(replacement, sync({ lastRestoreAt: '2026-11-25T10:01:00.000Z' }))).toBe('done');
  });
});
