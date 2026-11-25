import { describe, expect, it } from 'vitest';
import { jsonError, prettyJson } from '../src/components/CodeArea';
import { parseIntInRange } from '../src/pages/lambda/validation';
import { scheduleExpressionError } from '../src/pages/scheduler/expression';
import { formatVector, parseMetadata, parseVector } from '../src/pages/s3vectors/vectorInput';
import { validateTopicName } from '../src/pages/sns/TopicsPage';

describe('vetores', () => {
  it('aceita lista com ou sem colchetes e confere a dimensão', () => {
    expect(parseVector('[0.1, -2, 3e-2]', 3)).toEqual({ ok: true, values: [0.1, -2, 0.03] });
    expect(parseVector('1 2 3', 3)).toEqual({ ok: true, values: [1, 2, 3] });
    expect(parseVector('1, 2', 3)).toEqual({ ok: false, error: 'O índice tem dimensão 3; foram informados 2 valores.' });
    expect(parseVector('1, x, 3', 3)).toEqual({ ok: false, error: 'Valor inválido: "x".' });
    expect(parseVector('  ', 3)).toMatchObject({ ok: false });
  });

  it('valida metadados como objeto JSON opcional', () => {
    expect(parseMetadata('')).toEqual({ ok: true, metadata: null });
    expect(parseMetadata('{"fonte":"a.pdf"}')).toEqual({ ok: true, metadata: { fonte: 'a.pdf' } });
    expect(parseMetadata('[1]')).toMatchObject({ ok: false });
    expect(parseMetadata('{')).toMatchObject({ ok: false });
  });

  it('resume vetores longos', () => {
    expect(formatVector([0.123456, 1, 2], 2)).toBe('[0.1235, 1, …]');
  });
});

describe('validações de formulário', () => {
  it('expressão de agendamento conforme o tipo', () => {
    expect(scheduleExpressionError('rate(5 minutes)', 'recurring')).toBeNull();
    expect(scheduleExpressionError('cron(0 12 * * ? *)', 'recurring')).toBeNull();
    expect(scheduleExpressionError('at(2026-12-01T09:00:00)', 'recurring')).toMatch(/rate/);
    expect(scheduleExpressionError('at(2026-12-01T09:00:00)', 'once')).toBeNull();
  });

  it('nome de tópico SNS e sufixo FIFO', () => {
    expect(validateTopicName('pedidos', false)).toBeNull();
    expect(validateTopicName('pedidos.fifo', true)).toBeNull();
    expect(validateTopicName('pedidos', true)).toMatch(/\.fifo/);
    expect(validateTopicName('meu tópico', false)).toMatch(/letras/);
  });

  it('inteiros dentro de limites', () => {
    expect(parseIntInRange('256', 128, 10240, 'MB')).toBe(256);
    expect(parseIntInRange('64', 128, 10240, 'MB')).toMatch(/entre 128/);
    expect(parseIntInRange('1.5', 1, 900, 'segundos')).toMatch(/inteiro/);
  });

  it('JSON opcional e obrigatório', () => {
    expect(jsonError('')).toBeNull();
    expect(jsonError('', true)).toBe('Informe um JSON.');
    expect(jsonError('{"a":')).toMatch(/JSON inválido/);
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson('texto')).toBe('texto');
  });
});
