import StatusIndicator from '@cloudscape-design/components/status-indicator';

const STATUS: Record<string, { type: 'success' | 'error' | 'in-progress' | 'stopped' | 'warning'; text: string }> = {
  RUNNING: { type: 'in-progress', text: 'Em execução' },
  SUCCEEDED: { type: 'success', text: 'Com êxito' },
  FAILED: { type: 'error', text: 'Com falha' },
  TIMED_OUT: { type: 'error', text: 'Tempo esgotado' },
  ABORTED: { type: 'stopped', text: 'Interrompida' },
  PENDING_REDRIVE: { type: 'warning', text: 'Aguardando reenvio' },
};

export function ExecutionStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { type: 'warning' as const, text: status };
  return <StatusIndicator type={s.type}>{s.text}</StatusIndicator>;
}
