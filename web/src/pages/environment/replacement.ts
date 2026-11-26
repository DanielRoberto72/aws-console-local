import type { SyncStatus } from '../../api/overview';

/** Troca de ambiente em andamento: o emulador reinicia e depois recebe o estado do banco. */
export interface Replacement {
  /** lastRestoreAt antes da troca; muda quando o emulador novo termina de ser restaurado. */
  previousRestoreAt: string | null;
  done: string;
}

export type ReplacementProgress = 'restarting' | 'restoring' | 'done';

export function replacementProgress(replacement: Replacement, sync: SyncStatus): ReplacementProgress {
  if (sync.phase === 'awaiting-restart' || sync.emulator !== 'online') return 'restarting';
  if (sync.phase === 'restoring') return 'restoring';
  return sync.lastRestoreAt !== replacement.previousRestoreAt ? 'done' : 'restarting';
}
