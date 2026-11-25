import { describe, expect, it, vi } from 'vitest';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { DeliveryPermissions } from '../src/permissions/deliveryPermissions.js';

const QUEUE_ARN = 'arn:aws:sqs:us-east-1:000000000000:pedidos';
const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:eventos';

/** Fila em memória que guarda a política aplicada. */
function fakeSqs() {
  let policy: string | undefined;
  const send = vi.fn(async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    switch (command.constructor.name) {
      case 'GetQueueUrlCommand':
        return { QueueUrl: 'https://emulador/000000000000/pedidos' };
      case 'GetQueueAttributesCommand':
        return { Attributes: policy ? { Policy: policy } : {} };
      case 'SetQueueAttributesCommand':
        policy = command.input.Attributes.Policy;
        return {};
      default:
        throw new Error(`comando inesperado ${command.constructor.name}`);
    }
  });
  return { client: { send } as unknown as SQSClient, policy: () => (policy ? JSON.parse(policy) : null), send };
}

describe('DeliveryPermissions', () => {
  it('libera a fila para a origem uma única vez, mesmo concedendo de novo', async () => {
    const sqs = fakeSqs();
    const permissions = new DeliveryPermissions(sqs.client, { send: vi.fn() } as unknown as LambdaClient);

    await permissions.allow(QUEUE_ARN, 'sns.amazonaws.com', TOPIC_ARN);
    await permissions.allow(QUEUE_ARN, 'sns.amazonaws.com', TOPIC_ARN);

    const statements = sqs.policy().Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      Effect: 'Allow',
      Principal: { Service: 'sns.amazonaws.com' },
      Action: 'sqs:SendMessage',
      Resource: QUEUE_ARN,
      Condition: { ArnEquals: { 'aws:SourceArn': TOPIC_ARN } },
    });
  });

  it('concede invocação à função e aceita permissão já existente', async () => {
    const send = vi.fn().mockRejectedValueOnce(Object.assign(new Error('existe'), { name: 'ResourceConflictException' }));
    const permissions = new DeliveryPermissions({ send: vi.fn() } as unknown as SQSClient, { send } as unknown as LambdaClient);

    await expect(permissions.allow('arn:aws:lambda:us-east-1:000000000000:function:ola', 'events.amazonaws.com', TOPIC_ARN)).resolves.toBeUndefined();
    expect(send.mock.calls[0]![0].input).toMatchObject({ Action: 'lambda:InvokeFunction', Principal: 'events.amazonaws.com', SourceArn: TOPIC_ARN });
  });

  it('não faz nada para destinos que não precisam de permissão de recurso', async () => {
    const sqs = fakeSqs();
    const lambdaSend = vi.fn();
    const permissions = new DeliveryPermissions(sqs.client, { send: lambdaSend } as unknown as LambdaClient);
    await permissions.allow('arn:aws:sns:us-east-1:000000000000:outro', 'events.amazonaws.com', TOPIC_ARN);
    expect(sqs.send).not.toHaveBeenCalled();
    expect(lambdaSend).not.toHaveBeenCalled();
  });
});
