import { Agent } from 'node:https';
import { BedrockClient } from '@aws-sdk/client-bedrock';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { IAMClient } from '@aws-sdk/client-iam';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { S3VectorsClient } from '@aws-sdk/client-s3vectors';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SFNClient } from '@aws-sdk/client-sfn';
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export interface AwsClients {
  s3: S3Client;
  dynamodb: DynamoDBClient;
  sqs: SQSClient;
  lambda: LambdaClient;
  logs: CloudWatchLogsClient;
  sns: SNSClient;
  secrets: SecretsManagerClient;
  ssm: SSMClient;
  events: EventBridgeClient;
  scheduler: SchedulerClient;
  sfn: SFNClient;
  s3vectors: S3VectorsClient;
  bedrock: BedrockClient;
  bedrockRuntime: BedrockRuntimeClient;
  iam: IAMClient;
}

/**
 * O emulador gera um certificado autoassinado novo a cada início, válido só para
 * localhost/127.0.0.1. Dentro do compose ele é acessado como "emulator", então a
 * verificação TLS fica desligada apenas neste agente, usado só para o emulador local.
 */
export function createEmulatorAgent(): Agent {
  return new Agent({ rejectUnauthorized: false, keepAlive: true });
}

/**
 * Agente da sonda de saúde: sem keep-alive nem cache de sessão TLS, para que cada
 * consulta faça um handshake completo e receba o certificado atual do emulador.
 */
export function createProbeAgent(): Agent {
  return new Agent({ rejectUnauthorized: false, keepAlive: false, maxCachedSessions: 0 });
}

/** Configuração comum a todos os clientes do SDK apontados para o emulador. */
export function clientConfig(endpoint: string, region: string, agent: Agent) {
  return {
    endpoint,
    region,
    // Com o emulador rodando com "-a off" qualquer credencial é aceita.
    credentials: { accessKeyId: 'emulator', secretAccessKey: 'emulator' },
    requestHandler: new NodeHttpHandler({ httpsAgent: agent, connectionTimeout: 3_000, requestTimeout: 60_000 }),
    maxAttempts: 2,
  };
}

export function createAwsClients(endpoint: string, region: string, agent: Agent): AwsClients {
  const common = clientConfig(endpoint, region, agent);
  return {
    s3: new S3Client({
      ...common,
      // Sem DNS para buckets como subdomínio do emulador.
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
    dynamodb: new DynamoDBClient(common),
    sqs: new SQSClient(common),
    lambda: new LambdaClient(common),
    logs: new CloudWatchLogsClient(common),
    sns: new SNSClient(common),
    secrets: new SecretsManagerClient(common),
    ssm: new SSMClient(common),
    events: new EventBridgeClient(common),
    scheduler: new SchedulerClient(common),
    sfn: new SFNClient(common),
    s3vectors: new S3VectorsClient(common),
    bedrock: new BedrockClient(common),
    bedrockRuntime: new BedrockRuntimeClient(common),
    iam: new IAMClient(common),
  };
}
