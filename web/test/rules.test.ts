import { describe, expect, it } from 'vitest';
import { formatBytes } from '../src/components/format';
import { displayValue, itemColumns, itemKey, parseItemText } from '../src/pages/dynamodb/itemDisplay';
import { validateBucketName } from '../src/pages/s3/bucketName';
import { parseSeconds, QUEUE_LIMITS, validateQueueName } from '../src/pages/sqs/queueForm';

describe('validateBucketName', () => {
  it.each(['meu-bucket', 'logs.2026', 'abc'])('aceita %s', (name) => expect(validateBucketName(name)).toBeNull());

  it.each([
    ['ab', /entre 3 e 63/],
    ['Meu-Bucket', /minúsculas/],
    ['-bucket', /começar e terminar/],
    ['a..b', /dois pontos/],
    ['192.168.0.1', /endereço IP/],
    ['xn--bucket', /xn--/],
  ])('rejeita %s', (name, message) => expect(validateBucketName(name)).toMatch(message));
});

describe('fila SQS', () => {
  it('exige o sufixo .fifo só em filas FIFO', () => {
    expect(validateQueueName('pedidos.fifo', true)).toBeNull();
    expect(validateQueueName('pedidos', true)).toMatch(/terminar com ".fifo"/);
    expect(validateQueueName('pedidos.fifo', false)).toMatch(/Só filas FIFO/);
    expect(validateQueueName('pedidos novos', false)).toMatch(/apenas letras/);
  });

  it('valida segundos dentro dos limites', () => {
    expect(parseSeconds('30', QUEUE_LIMITS.visibilityTimeout)).toBe(30);
    expect(parseSeconds('30s', QUEUE_LIMITS.visibilityTimeout)).toMatch(/inteiro/);
    expect(parseSeconds('59', QUEUE_LIMITS.messageRetentionPeriod)).toMatch(/entre 60/);
  });
});

describe('itens do DynamoDB', () => {
  const item = { pk: { S: 'p1' }, sk: { N: '2' }, ativo: { BOOL: false }, tags: { SS: ['a'] }, foto: { B: 'aGk=' } };

  it('mostra valores compactos', () => {
    expect(displayValue(item.pk)).toBe('p1');
    expect(displayValue(item.ativo)).toBe('false');
    expect(displayValue(item.tags)).toBe('["a"]');
    expect(displayValue(item.foto)).toBe('(binário)');
    expect(displayValue(undefined)).toBe('');
  });

  it('ordena colunas com as chaves primeiro e extrai a chave do item', () => {
    expect(itemColumns([item, { pk: { S: 'p2' }, zeta: { S: 'z' } }], ['pk', 'sk'])).toEqual(['pk', 'sk', 'ativo', 'foto', 'tags', 'zeta']);
    expect(itemKey(item, ['pk', 'sk'])).toEqual({ pk: { S: 'p1' }, sk: { N: '2' } });
  });

  it('valida o texto do editor', () => {
    expect(parseItemText('{"pk": {"S": "1"}}', ['pk'])).toEqual({ ok: true, item: { pk: { S: '1' } } });
    expect(parseItemText('{"pk": ', ['pk'])).toMatchObject({ ok: false, error: expect.stringMatching(/JSON inválido/) });
    expect(parseItemText('[]', ['pk'])).toMatchObject({ ok: false, error: expect.stringMatching(/objeto/) });
    expect(parseItemText('{"x": {"S": "1"}}', ['pk'])).toMatchObject({ ok: false, error: 'Atributo de chave ausente: pk' });
  });
});

describe('formatBytes', () => {
  it('usa a maior unidade adequada', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
  });
});
