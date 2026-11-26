import { describe, expect, it } from 'vitest';
import { behaviorLabel, changeText, fidelityTone, formatPercent, tallyScore } from '../src/pages/emulator/fidelityFormat';

describe('formato da fidelidade', () => {
  it('usa as faixas do console e não arredonda para cima de uma faixa', () => {
    expect(fidelityTone(0.95)).toBe('green');
    expect(fidelityTone(0.9)).toBe('green');
    expect(fidelityTone(0.898)).toBe('blue');
    expect(fidelityTone(0.75)).toBe('blue');
    expect(fidelityTone(0.3)).toBe('red');
    expect(formatPercent(0.898)).toBe('89%');
    expect(formatPercent(null)).toBe('-');
  });

  it('descreve a diferença de nota entre versões em pontos', () => {
    expect(changeText(0.74, 0.772)).toBe('+3,2 pontos');
    expect(changeText(0.95, 0.9)).toBe('−5,0 pontos');
    expect(changeText(null, 0.8)).toBe('Passa a ter testes');
    expect(changeText(0.8, null)).toBe('Deixa de ter testes');
  });

  it('calcula a nota sem testes como indefinida', () => {
    expect(tallyScore({ passed: 3, failed: 1 })).toBe(0.75);
    expect(tallyScore({ passed: 0, failed: 0 })).toBeNull();
  });

  it('separa serviços envolvidos e nome do comportamento', () => {
    expect(behaviorLabel('apigateway__sns__sqs.xsvc-apigateway-2-sns-publish')).toEqual({
      title: 'xsvc-apigateway-2-sns-publish',
      services: ['apigateway', 'sns', 'sqs'],
    });
    expect(behaviorLabel('_smoke.sigv4-presigned')).toEqual({ title: 'sigv4-presigned', services: [] });
    expect(behaviorLabel('sem-ponto')).toEqual({ title: 'sem-ponto', services: [] });
  });
});
