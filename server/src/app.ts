import { existsSync } from 'node:fs';
import type { Agent } from 'node:https';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ActivityLog } from './activity/activityLog.js';
import { activityRoutes } from './activity/routes.js';
import { clientConfig, type AwsClients } from './aws/clients.js';
import type { EmulatorProbe } from './aws/emulatorProbe.js';
import { BedrockService } from './bedrock/bedrockService.js';
import { CatalogSync, IdMap } from './catalog/catalogSync.js';
import { createCatalogContext } from './catalog/context.js';
import { catalogServices } from './catalog/index.js';
import { CatalogRegistry } from './catalog/registry.js';
import { catalogRoutes } from './catalog/routes.js';
import { bedrockRoutes } from './bedrock/routes.js';
import type { Db } from './db/pool.js';
import { ResourceStore } from './db/resourceStore.js';
import { DynamoDbService } from './dynamodb/dynamodbService.js';
import { DynamoDbSync } from './dynamodb/dynamodbSync.js';
import { dynamodbRoutes } from './dynamodb/routes.js';
import { EventsService } from './events/eventsService.js';
import { EventsSync } from './events/eventsSync.js';
import { eventsRoutes } from './events/routes.js';
import { registerErrorHandler } from './http/errors.js';
import { ensureDefaultRole, IamService } from './iam/iamService.js';
import { IamSync } from './iam/iamSync.js';
import { PolicyService } from './iam/policyService.js';
import { iamRoutes } from './iam/routes.js';
import { DeliveryPermissions } from './permissions/deliveryPermissions.js';
import { LambdaService } from './lambda/lambdaService.js';
import { LambdaSync } from './lambda/lambdaSync.js';
import { lambdaRoutes } from './lambda/routes.js';
import { LogsService } from './logs/logsService.js';
import { LogsSync } from './logs/logsSync.js';
import { logsRoutes } from './logs/routes.js';
import { overviewRoutes } from './overview/routes.js';
import { s3Routes } from './s3/routes.js';
import { S3Service } from './s3/s3Service.js';
import { S3Sync } from './s3/s3Sync.js';
import { vectorsRoutes } from './s3vectors/routes.js';
import { VectorsService } from './s3vectors/vectorsService.js';
import { VectorsSync } from './s3vectors/vectorsSync.js';
import { schedulerRoutes } from './scheduler/routes.js';
import { SchedulerService } from './scheduler/schedulerService.js';
import { SchedulerSync } from './scheduler/schedulerSync.js';
import { secretsRoutes } from './secrets/routes.js';
import { SecretsService } from './secrets/secretsService.js';
import { SecretsSync } from './secrets/secretsSync.js';
import { snsRoutes } from './sns/routes.js';
import { SnsService } from './sns/snsService.js';
import { SnsSync } from './sns/snsSync.js';
import { sqsRoutes } from './sqs/routes.js';
import { SqsService } from './sqs/sqsService.js';
import { SqsSync } from './sqs/sqsSync.js';
import { ssmRoutes } from './ssm/routes.js';
import { SsmService } from './ssm/ssmService.js';
import { SsmSync } from './ssm/ssmSync.js';
import { stepFunctionsRoutes } from './stepfunctions/routes.js';
import { StepFunctionsService } from './stepfunctions/stepFunctionsService.js';
import { StepFunctionsSync } from './stepfunctions/stepFunctionsSync.js';
import { SyncMonitor } from './sync/syncMonitor.js';
import { CatalogForwarding } from './forwarding/catalogForwarding.js';
import type { PortRange } from './forwarding/endpoints.js';
import { PgAllocationStore, PortForwarder } from './forwarding/portForwarder.js';

/** Limite de upload pelo painel; o arquivo inteiro fica em memória e no banco. */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export interface AppDeps {
  db: Db;
  clients: AwsClients;
  emulatorEndpoint: string;
  region: string;
  emulatorAgent: Agent;
  probe: () => Promise<EmulatorProbe>;
  syncIntervalMs: number;
  webDistDir: string | undefined;
  /** Repasse de portas para o Mac; ausente fora do compose. */
  forwarding?: { ports: PortRange; listenHost: string };
}

/** Ponto de composição: conecta serviços, persistência e rotas. */
export async function buildApp(deps: AppDeps): Promise<{ app: FastifyInstance; sync: SyncMonitor; forwarding: CatalogForwarding | null }> {
  // O painel consulta o status a cada poucos segundos; logar cada requisição só gera ruído.
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, disableRequestLogging: true });
  registerErrorHandler(app);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 50 } });

  const { clients } = deps;
  const store = new ResourceStore();
  const s3 = new S3Service(clients.s3);
  const dynamodb = new DynamoDbService(clients.dynamodb);
  const sqs = new SqsService(clients.sqs);
  const iam = new IamService(clients.iam);
  const policies = new PolicyService(clients.iam);
  const permissions = new DeliveryPermissions(clients.sqs, clients.lambda);
  const lambda = new LambdaService(clients.lambda, deps.emulatorEndpoint, deps.emulatorAgent, () => ensureDefaultRole(iam, 'lambda'));
  const logs = new LogsService(clients.logs);
  const sns = new SnsService(clients.sns, permissions);
  const secrets = new SecretsService(clients.secrets);
  const ssm = new SsmService(clients.ssm);
  const events = new EventsService(clients.events, permissions);
  const scheduler = new SchedulerService(clients.scheduler, () => ensureDefaultRole(iam, 'scheduler'));
  const sfn = new StepFunctionsService(clients.sfn, () => ensureDefaultRole(iam, 'stepfunctions'));
  const vectors = new VectorsService(clients.s3vectors);
  const bedrock = new BedrockService(clients.bedrock, clients.bedrockRuntime);
  const activity = new ActivityLog(deps.db);
  const catalogContext = createCatalogContext({
    config: clientConfig(deps.emulatorEndpoint, deps.region, deps.emulatorAgent),
    clients,
    iam,
    permissions,
    emulatorEndpoint: deps.emulatorEndpoint,
    agent: deps.emulatorAgent,
  });
  const registry = new CatalogRegistry(catalogServices(catalogContext), catalogContext);
  const catalogIds = new IdMap();
  const catalogSyncs = new Map(
    registry.services.map((service) => [service.id, new CatalogSync(service, registry, store, catalogIds, activity, app.log)] as const),
  );
  // O CloudFormation recria os recursos das stacks; por isso vem logo depois do IAM.
  const { cloudformation: stackSync, ...otherCatalogSyncs } = Object.fromEntries(catalogSyncs);

  // A ordem é a da restauração: destinos (filas, funções, tópicos) antes de quem aponta para eles.
  const sync = new SyncMonitor(
    deps.db,
    deps.probe,
    [
      new IamSync(iam, policies, store),
      stackSync!,
      new S3Sync(s3),
      new DynamoDbSync(dynamodb),
      new SqsSync(sqs),
      new LambdaSync(lambda, store),
      new LogsSync(logs, store),
      new SnsSync(sns, store),
      new SecretsSync(secrets, store),
      new SsmSync(ssm, store),
      new StepFunctionsSync(sfn, store),
      new EventsSync(events, store),
      new SchedulerSync(scheduler, store),
      new VectorsSync(vectors, store),
      ...Object.values(otherCatalogSyncs),
    ],
    deps.syncIntervalMs,
    app.log,
  );
  const routeDeps = { activity, onChange: () => sync.trigger() };
  const forwarding = deps.forwarding
    ? new CatalogForwarding(
        registry,
        new PortForwarder(new PgAllocationStore(deps.db), deps.forwarding.ports, new URL(deps.emulatorEndpoint).hostname, deps.forwarding.listenHost, app.log),
        deps.syncIntervalMs,
        app.log,
      )
    : null;

  iamRoutes(app, { iam, policies, ...routeDeps });
  s3Routes(app, { s3, ...routeDeps });
  dynamodbRoutes(app, { dynamodb, ...routeDeps });
  sqsRoutes(app, { sqs, ...routeDeps });
  lambdaRoutes(app, { lambda, ...routeDeps });
  logsRoutes(app, { logs, ...routeDeps });
  snsRoutes(app, { sns, ...routeDeps });
  secretsRoutes(app, { secrets, ...routeDeps });
  ssmRoutes(app, { ssm, ...routeDeps });
  eventsRoutes(app, { events, ...routeDeps });
  schedulerRoutes(app, { scheduler, ...routeDeps });
  stepFunctionsRoutes(app, { sfn, ...routeDeps });
  vectorsRoutes(app, { vectors, ...routeDeps });
  bedrockRoutes(app, { bedrock, ...routeDeps });
  catalogRoutes(app, {
    registry,
    ...routeDeps,
    rememberInput: (service, type, id, input, parentId) => catalogSyncs.get(service as never)?.remember(type, id, input, parentId),
    decorate: async (service, type, rows) => (forwarding ? forwarding.decorate(service, type, rows) : rows),
  });
  activityRoutes(app, activity);
  overviewRoutes(app, deps.db, sync);

  if (deps.webDistDir && existsSync(deps.webDistDir)) {
    await app.register(fastifyStatic, { root: deps.webDistDir });
    // Rotas do React Router: qualquer caminho fora de /api devolve o index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.status(404).send({ code: 'NotFound', message: 'Rota não encontrada' });
      return reply.sendFile('index.html');
    });
  }

  return { app, sync, forwarding };
}
