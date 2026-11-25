import type { CreateTableCommandInput, TableDescription } from '@aws-sdk/client-dynamodb';

/** Monta o CreateTable que recria a tabela descrita, usado para persisti-la. */
export function toCreateTableInput(table: TableDescription): CreateTableCommandInput {
  if (!table.TableName || !table.KeySchema || !table.AttributeDefinitions) {
    throw new Error('Descrição de tabela incompleta');
  }
  const billingMode = table.BillingModeSummary?.BillingMode ?? 'PROVISIONED';
  const provisioned = billingMode === 'PROVISIONED';
  const throughput = (t?: { ReadCapacityUnits?: number; WriteCapacityUnits?: number }) => ({
    ReadCapacityUnits: t?.ReadCapacityUnits || 1,
    WriteCapacityUnits: t?.WriteCapacityUnits || 1,
  });

  const input: CreateTableCommandInput = {
    TableName: table.TableName,
    AttributeDefinitions: table.AttributeDefinitions,
    KeySchema: table.KeySchema,
    BillingMode: billingMode,
  };
  if (provisioned) input.ProvisionedThroughput = throughput(table.ProvisionedThroughput);

  if (table.GlobalSecondaryIndexes?.length) {
    input.GlobalSecondaryIndexes = table.GlobalSecondaryIndexes.map((index) => ({
      IndexName: index.IndexName,
      KeySchema: index.KeySchema,
      Projection: index.Projection,
      ...(provisioned ? { ProvisionedThroughput: throughput(index.ProvisionedThroughput) } : {}),
    }));
  }
  if (table.LocalSecondaryIndexes?.length) {
    input.LocalSecondaryIndexes = table.LocalSecondaryIndexes.map((index) => ({
      IndexName: index.IndexName,
      KeySchema: index.KeySchema,
      Projection: index.Projection,
    }));
  }
  if (table.StreamSpecification?.StreamEnabled) input.StreamSpecification = table.StreamSpecification;
  return input;
}
