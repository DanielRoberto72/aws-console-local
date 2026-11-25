import { describe, expect, it } from 'vitest';
import { itemFromWire, itemToWire } from '../src/dynamodb/attributeJson.js';

describe('DynamoDB JSON', () => {
  it('preserva todos os tipos na ida e volta, com binários em base64', () => {
    const wire = {
      id: { S: 'pedido-1' },
      total: { N: '10.50' },
      foto: { B: 'aGk=' },
      ativo: { BOOL: true },
      nada: { NULL: true },
      tags: { SS: ['a', 'b'] },
      notas: { NS: ['1', '2'] },
      blobs: { BS: ['aGk=', 'b2k='] },
      itens: { L: [{ S: 'x' }, { M: { qtd: { N: '2' } } }] },
    } as const;

    const item = itemFromWire(wire);
    expect(item.foto?.B).toEqual(new Uint8Array([104, 105]));
    expect(itemToWire(item)).toEqual(wire);
  });

  it('rejeita valores sem tipo ou com mais de um tipo', () => {
    expect(() => itemFromWire({ id: 'texto' })).toThrow(/item.id/);
    expect(() => itemFromWire({ id: { S: 'a', N: '1' } })).toThrow(/exatamente um tipo/);
  });

  it('rejeita tipos desconhecidos e conteúdo incompatível, apontando o caminho', () => {
    expect(() => itemFromWire({ id: { X: 'a' } })).toThrow(/tipo desconhecido "X"/);
    expect(() => itemFromWire({ n: { N: 1 } })).toThrow(/item.n.N: esperado uma string/);
    expect(() => itemFromWire({ l: { L: [{ BOOL: 'sim' }] } })).toThrow(/item.l\[0\].BOOL/);
    expect(() => itemFromWire({ s: { SS: [] } })).toThrow(/lista não vazia/);
  });

  it('rejeita item que não é objeto', () => {
    expect(() => itemFromWire([])).toThrow(/esperado um objeto/);
  });
});
