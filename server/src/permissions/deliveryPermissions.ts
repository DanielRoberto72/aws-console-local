import { createHash } from 'node:crypto';
import { AddPermissionCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import { GetQueueAttributesCommand, GetQueueUrlCommand, SetQueueAttributesCommand, type SQSClient } from '@aws-sdk/client-sqs';

interface PolicyDocument {
  Version: string;
  Statement: Record<string, unknown>[];
}

/** Identificador estável por origem, para que conceder de novo não duplique a permissão. */
const statementId = (prefix: string, sourceArn: string) =>
  `${prefix}-${createHash('sha256').update(sourceArn).digest('hex').slice(0, 16)}`;

const resourceName = (arn: string) => arn.slice(arn.lastIndexOf(':') + 1);

/**
 * Permissões de recurso que o console da AWS adiciona sozinho ao ligar serviços:
 * a política da fila que aceita o SNS/EventBridge e a permissão de invocar a função.
 * Sem elas o emulador, como a AWS, descarta a entrega silenciosamente.
 */
export class DeliveryPermissions {
  constructor(
    private readonly sqs: SQSClient,
    private readonly lambda: LambdaClient,
  ) {}

  async allow(targetArn: string, servicePrincipal: string, sourceArn: string): Promise<void> {
    if (targetArn.startsWith('arn:aws:sqs:')) await this.allowQueue(targetArn, servicePrincipal, sourceArn);
    else if (targetArn.startsWith('arn:aws:lambda:')) await this.allowFunction(targetArn, servicePrincipal, sourceArn);
  }

  private async allowQueue(queueArn: string, servicePrincipal: string, sourceArn: string): Promise<void> {
    const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: resourceName(queueArn) }));
    const { Attributes = {} } = await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['Policy'] }));
    const policy: PolicyDocument = Attributes.Policy ? JSON.parse(Attributes.Policy) : { Version: '2012-10-17', Statement: [] };
    const sid = statementId('console-local', `${servicePrincipal}|${sourceArn}`);
    if (policy.Statement.some((s) => s.Sid === sid)) return;
    policy.Statement.push({
      Sid: sid,
      Effect: 'Allow',
      Principal: { Service: servicePrincipal },
      Action: 'sqs:SendMessage',
      Resource: queueArn,
      Condition: { ArnEquals: { 'aws:SourceArn': sourceArn } },
    });
    await this.sqs.send(new SetQueueAttributesCommand({ QueueUrl, Attributes: { Policy: JSON.stringify(policy) } }));
  }

  private async allowFunction(functionArn: string, servicePrincipal: string, sourceArn: string): Promise<void> {
    try {
      await this.lambda.send(
        new AddPermissionCommand({
          FunctionName: functionArn,
          StatementId: statementId('console-local', `${servicePrincipal}|${sourceArn}`),
          Action: 'lambda:InvokeFunction',
          Principal: servicePrincipal,
          SourceArn: sourceArn,
        }),
      );
    } catch (err) {
      if ((err as Error).name !== 'ResourceConflictException') throw err;
    }
  }
}
