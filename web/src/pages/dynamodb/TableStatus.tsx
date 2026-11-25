import StatusIndicator from '@cloudscape-design/components/status-indicator';

const LABELS: Record<string, { type: 'success' | 'in-progress' | 'error' | 'pending'; text: string }> = {
  ACTIVE: { type: 'success', text: 'Ativa' },
  CREATING: { type: 'in-progress', text: 'Criando' },
  UPDATING: { type: 'in-progress', text: 'Atualizando' },
  DELETING: { type: 'in-progress', text: 'Excluindo' },
};

export function TableStatus({ status }: { status: string }) {
  const label = LABELS[status] ?? { type: 'pending' as const, text: status };
  return <StatusIndicator type={label.type}>{label.text}</StatusIndicator>;
}

export const billingLabel = (mode: string) => (mode === 'PAY_PER_REQUEST' ? 'Sob demanda' : 'Provisionado');
