import type { Tally } from '../../api/emulator';

export type FidelityTone = 'green' | 'blue' | 'red';

/**
 * Faixas escolhidas para o console, não definidas pela AWS: a partir de 90% o serviço
 * costuma se comportar como na AWS; abaixo de 75% vale conferir a lista do que falha.
 */
export const FIDELITY_BANDS = { high: 0.9, medium: 0.75 } as const;

export function fidelityTone(score: number): FidelityTone {
  if (score >= FIDELITY_BANDS.high) return 'green';
  if (score >= FIDELITY_BANDS.medium) return 'blue';
  return 'red';
}

export const formatPercent = (score: number | null) => (score === null ? '-' : `${Math.floor(score * 100)}%`);

export const tallyScore = ({ passed, failed }: Tally) => (passed + failed ? passed / (passed + failed) : null);

/**
 * Os comportamentos verificados têm ids como "apigateway__sns__sqs.xsvc-apigateway-2-sns-publish":
 * antes do ponto, os serviços envolvidos; depois, o nome do teste.
 */
export function behaviorLabel(id: string): { title: string; services: string[] } {
  const dot = id.indexOf('.');
  if (dot < 0) return { title: id, services: [] };
  const services = id.slice(0, dot).split('__').filter((s) => s && !s.startsWith('_'));
  return { title: id.slice(dot + 1), services };
}
