import { describe, expect, it } from 'vitest';
import { toCreateTableInput } from '../src/dynamodb/createTableInput.js';

const base = {
  TableName: 'pedidos',
  AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' as const }],
  KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' as const }],
};

describe('toCreateTableInput', () => {
  it('recria tabela sob demanda sem capacidade provisionada', () => {
    const input = toCreateTableInput({
      ...base,
      BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
      ProvisionedThroughput: { ReadCapacityUnits: 0, WriteCapacityUnits: 0 },
      GlobalSecondaryIndexes: [
        { IndexName: 'por-status', KeySchema: base.KeySchema, Projection: { ProjectionType: 'ALL' }, ItemCount: 3 },
      ],
    });
    expect(input).toEqual({
      ...base,
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [{ IndexName: 'por-status', KeySchema: base.KeySchema, Projection: { ProjectionType: 'ALL' } }],
    });
  });

  it('mantém a capacidade de tabelas provisionadas e dos seus índices', () => {
    const input = toCreateTableInput({
      ...base,
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 2 },
      GlobalSecondaryIndexes: [{ IndexName: 'gsi', KeySchema: base.KeySchema, Projection: { ProjectionType: 'KEYS_ONLY' } }],
    });
    expect(input.BillingMode).toBe('PROVISIONED');
    expect(input.ProvisionedThroughput).toEqual({ ReadCapacityUnits: 5, WriteCapacityUnits: 2 });
    expect(input.GlobalSecondaryIndexes?.[0]?.ProvisionedThroughput).toEqual({ ReadCapacityUnits: 1, WriteCapacityUnits: 1 });
  });

  it('falha com descrição incompleta', () => {
    expect(() => toCreateTableInput({ TableName: 'x' })).toThrow(/incompleta/);
  });
});
