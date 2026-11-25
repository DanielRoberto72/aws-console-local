import Badge from '@cloudscape-design/components/badge';
import type { FidelitySummary } from '../../api/emulator';
import { fidelityTone, formatPercent } from './fidelityFormat';

/** Selo com a fração de testes do emulador aprovados para o serviço. */
export function FidelityBadge({ summary }: { summary: FidelitySummary | undefined }) {
  if (!summary || summary.score === null) return null;
  return (
    <span title={`Fidelidade no emulador: ${formatPercent(summary.score)} de ${summary.total.passed + summary.total.failed} testes`}>
      <Badge color={fidelityTone(summary.score)}>{formatPercent(summary.score)}</Badge>
    </span>
  );
}
