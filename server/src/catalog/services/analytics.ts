import {
  AthenaClient,
  CreateWorkGroupCommand,
  DeleteWorkGroupCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  GetWorkGroupCommand,
  ListWorkGroupsCommand,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import {
  CreateDeliveryStreamCommand,
  DeleteDeliveryStreamCommand,
  DescribeDeliveryStreamCommand,
  FirehoseClient,
  ListDeliveryStreamsCommand,
  PutRecordCommand as FirehosePutRecordCommand,
} from '@aws-sdk/client-firehose';
import {
  CreateDatabaseCommand,
  CreateTableCommand,
  DeleteDatabaseCommand,
  DeleteTableCommand,
  GetDatabasesCommand,
  GetTableCommand,
  GetTablesCommand,
  GlueClient,
} from '@aws-sdk/client-glue';
import { CreateClusterCommand, DeleteClusterCommand, GetBootstrapBrokersCommand, KafkaClient, ListClustersCommand } from '@aws-sdk/client-kafka';
import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
  ListShardsCommand,
  ListStreamsCommand,
  PutRecordCommand,
} from '@aws-sdk/client-kinesis';
import { CreateBrokerCommand, DeleteBrokerCommand, DescribeBrokerCommand, ListBrokersCommand, MqClient } from '@aws-sdk/client-mq';
import { CreateDomainCommand, DeleteDomainCommand, DescribeDomainsCommand, ListDomainNamesCommand, OpenSearchClient } from '@aws-sdk/client-opensearch';
import { BadRequestError } from '../../http/errors.js';
import { ensureDefaultRole } from '../../iam/iamService.js';
import { defaultSubnets } from './containers.js';
import type { CatalogContext } from '../context.js';
import { compact, endpointText, iso, list, message, num, optStr, paginate, status, str } from '../helpers.js';
import type { ActionResult, CatalogService } from '../types.js';

const PORT_NOTE = 'Fora do compose, use o "Endpoint local", que fica fixo; o endpoint da rede do compose (host "emulator") muda de porta a cada reinício do emulador.';
const KAFKA_NOTE =
  'Os brokers só são acessíveis pela rede do docker compose (host "emulator") e a porta muda a cada reinício do emulador. Não há repasse para o host: o cliente Kafka recebe dos brokers o endereço interno e não conseguiria segui-lo.';

export function openSearchService(ctx: CatalogContext): CatalogService {
  const os = () => ctx.client(OpenSearchClient);
  const domains = async () => {
    const names = ((await os().send(new ListDomainNamesCommand({}))).DomainNames ?? []).flatMap((d) => (d.DomainName ? [d.DomainName] : []));
    const statuses = [];
    // DescribeDomains aceita até 5 domínios por chamada.
    for (let i = 0; i < names.length; i += 5) {
      statuses.push(...((await os().send(new DescribeDomainsCommand({ DomainNames: names.slice(i, i + 5) }))).DomainStatusList ?? []));
    }
    return statuses;
  };
  const endpointOf = async (name: string) => {
    const domain = (await domains()).find((d) => d.DomainName === name);
    const endpoint = domain?.Endpoint ?? Object.values(domain?.Endpoints ?? {})[0];
    if (!endpoint) throw new BadRequestError('O domínio ainda não tem endpoint. Aguarde a criação terminar.');
    return endpoint;
  };

  return {
    id: 'opensearch',
    name: 'OpenSearch Service',
    description: 'Busca e análise de logs e documentos',
    category: 'Análise',
    notes: `Cada domínio sobe um endpoint compatível com a API do OpenSearch. ${PORT_NOTE} Os índices se perdem quando o emulador reinicia.`,
    types: [
      {
        key: 'domain',
        label: 'Domínios',
        singular: 'domínio',
        forward: 'endpoint',
        columns: [
          { key: 'version', label: 'Versão' },
          { key: 'instanceType', label: 'Tipo de instância' },
          { key: 'endpoint', label: 'Endpoint (rede do compose)' },
        ],
        async list() {
          return (await domains()).map((d) => {
            const [host, port] = (d.Endpoint ?? '').split(':');
            return {
              id: d.DomainName!,
              name: d.DomainName!,
              status: status(d.Deleted ? 'deleting' : d.Processing ? 'creating' : 'active'),
              attrs: {
                version: d.EngineVersion ?? null,
                instanceType: d.ClusterConfig?.InstanceType ?? null,
                endpoint: port ? `https://${endpointText(host, port)}` : null,
              },
            };
          });
        },
        async describe(id) {
          return (await domains()).find((d) => d.DomainName === id) ?? null;
        },
        create: {
          label: 'Criar domínio',
          fields: [
            { name: 'name', label: 'Nome do domínio', type: 'text', required: true, pattern: '^[a-z][a-z0-9-]{2,27}$', patternHint: '3 a 28 caracteres: minúsculas, números e hifens.' },
            { name: 'version', label: 'Versão', type: 'select', default: 'OpenSearch_2.17', options: ['OpenSearch_2.17', 'OpenSearch_2.13', 'OpenSearch_1.3'].map((v) => ({ value: v, label: v })) },
          ],
          async run(input) {
            await os().send(new CreateDomainCommand({ DomainName: str(input, 'name'), EngineVersion: optStr(input, 'version') }));
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await os().send(new DeleteDomainCommand({ DomainName: id }));
          },
        },
        actions: [
          {
            key: 'Request',
            label: 'Executar requisição',
            description: 'Envia uma requisição à API REST do domínio, como no Dev Tools do OpenSearch Dashboards.',
            submitLabel: 'Enviar',
            fields: [
              { name: 'method', label: 'Método', type: 'select', required: true, default: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'].map((v) => ({ value: v, label: v })) },
              { name: 'path', label: 'Caminho', type: 'text', required: true, default: '/_cat/indices?v', pattern: '^/.*' },
              { name: 'body', label: 'Corpo (JSON) - opcional', type: 'code', rows: 8 },
            ],
            async run(id, input) {
              const response = await ctx.fetch(`https://${await endpointOf(id)}${str(input, 'path')}`, {
                method: str(input, 'method'),
                headers: { 'content-type': 'application/json' },
                body: optStr(input, 'body'),
              });
              return httpResult(response.status, response.contentType, response.body);
            },
          },
        ],
        async persist(row) {
          return compact({ name: row.id, version: row.attrs.version ? String(row.attrs.version) : undefined });
        },
      },
    ],
  };
}

/** Resposta HTTP de um endpoint do emulador, formatada como JSON quando possível. */
export function httpResult(statusCode: number, contentType: string, body: string): ActionResult {
  if (contentType.includes('json')) {
    try {
      return { kind: 'json', value: { status: statusCode, body: JSON.parse(body) } };
    } catch {
      // corpo não é JSON apesar do cabeçalho: mostra como texto
    }
  }
  return { kind: 'text', text: `HTTP ${statusCode}\n\n${body}` };
}

export function mqService(ctx: CatalogContext): CatalogService {
  const mq = () => ctx.client(MqClient);
  const brokers = async () => {
    const summaries = (await mq().send(new ListBrokersCommand({}))).BrokerSummaries ?? [];
    const details = [];
    for (const s of summaries) if (s.BrokerId) details.push(await mq().send(new DescribeBrokerCommand({ BrokerId: s.BrokerId })));
    return details;
  };

  return {
    id: 'mq',
    name: 'Amazon MQ',
    description: 'Brokers RabbitMQ e ActiveMQ gerenciados',
    category: 'Integração de aplicações',
    notes: `O broker abre um endpoint AMQP no emulador. ${PORT_NOTE}`,
    types: [
      {
        key: 'broker',
        label: 'Brokers',
        singular: 'broker',
        forward: 'endpoints',
        columns: [
          { key: 'engine', label: 'Mecanismo' },
          { key: 'version', label: 'Versão' },
          { key: 'instanceType', label: 'Tipo de instância' },
          { key: 'endpoints', label: 'Endpoints (rede do compose)' },
        ],
        async list() {
          return (await brokers()).map((b) => ({
            id: b.BrokerId!,
            name: b.BrokerName ?? b.BrokerId!,
            status: status(b.BrokerState),
            attrs: {
              engine: b.EngineType ?? null,
              version: b.EngineVersion ?? null,
              instanceType: b.HostInstanceType ?? null,
              endpoints: (b.BrokerInstances ?? []).flatMap((i) => i.Endpoints ?? []).map((e) => e.replace(/127\.0\.0\.1|0\.0\.0\.0/, 'emulator')).join(', ') || null,
              username: b.Users?.[0]?.Username ?? null,
              createdAt: iso(b.Created),
            },
          }));
        },
        async describe(id) {
          return mq().send(new DescribeBrokerCommand({ BrokerId: id }));
        },
        create: {
          label: 'Criar broker',
          fields: [
            { name: 'name', label: 'Nome do broker', type: 'text', required: true, pattern: '^[a-zA-Z0-9_-]{1,50}$' },
            {
              name: 'engine',
              label: 'Mecanismo',
              type: 'select',
              required: true,
              default: 'RABBITMQ',
              options: [
                { value: 'RABBITMQ', label: 'RabbitMQ' },
                { value: 'ACTIVEMQ', label: 'ActiveMQ' },
              ],
            },
            { name: 'version', label: 'Versão', type: 'text', required: true, default: '3.13', description: 'RabbitMQ: 3.13. ActiveMQ: 5.18.' },
            { name: 'instanceType', label: 'Tipo de instância', type: 'select', default: 'mq.t3.micro', options: ['mq.t3.micro', 'mq.m5.large'].map((v) => ({ value: v, label: v })) },
            { name: 'username', label: 'Usuário', type: 'text', required: true, default: 'admin1', pattern: '^[a-zA-Z0-9._~-]{2,100}$' },
            { name: 'password', label: 'Senha', type: 'password', required: true, pattern: '^[^,:=]{12,250}$', patternHint: 'Pelo menos 12 caracteres, sem , : ou =.' },
          ],
          async run(input) {
            const { BrokerId } = await mq().send(
              new CreateBrokerCommand({
                BrokerName: str(input, 'name'),
                EngineType: str(input, 'engine') as never,
                EngineVersion: str(input, 'version'),
                HostInstanceType: str(input, 'instanceType') || 'mq.t3.micro',
                DeploymentMode: 'SINGLE_INSTANCE',
                PubliclyAccessible: false,
                AutoMinorVersionUpgrade: true,
                Users: [{ Username: str(input, 'username'), Password: str(input, 'password') || 'ConsoleLocal1234' }],
              }),
            );
            return { id: BrokerId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await mq().send(new DeleteBrokerCommand({ BrokerId: id }));
          },
        },
        preserve: ['password'],
        async persist(row) {
          return compact({
            name: row.name,
            // A descrição devolve "RabbitMQ"; a criação exige "RABBITMQ".
            engine: String(row.attrs.engine).toUpperCase(),
            version: String(row.attrs.version ?? ''),
            instanceType: String(row.attrs.instanceType ?? ''),
            username: String(row.attrs.username ?? 'admin1'),
          });
        },
      },
    ],
  };
}

export function kafkaService(ctx: CatalogContext): CatalogService {
  const kafka = () => ctx.client(KafkaClient);

  return {
    id: 'kafka',
    name: 'MSK (Kafka)',
    description: 'Apache Kafka gerenciado',
    category: 'Análise',
    notes: `O cluster expõe brokers no emulador. ${KAFKA_NOTE} Tópicos e mensagens se perdem quando o emulador reinicia.`,
    types: [
      {
        key: 'cluster',
        label: 'Clusters',
        singular: 'cluster',
        columns: [
          { key: 'version', label: 'Versão do Kafka' },
          { key: 'brokers', label: 'Brokers' },
          { key: 'instanceType', label: 'Tipo de instância' },
          { key: 'bootstrap', label: 'Servidores de bootstrap (rede do compose)' },
        ],
        async list() {
          const clusters = await paginate(async (NextToken) => {
            const page = await kafka().send(new ListClustersCommand({ NextToken }));
            return { items: page.ClusterInfoList, next: page.NextToken };
          });
          const rows = [];
          for (const c of clusters) {
            const bootstrap =
              c.State === 'ACTIVE' ? (await kafka().send(new GetBootstrapBrokersCommand({ ClusterArn: c.ClusterArn }))).BootstrapBrokerString : undefined;
            rows.push({
              id: c.ClusterArn!,
              name: c.ClusterName ?? c.ClusterArn!,
              status: status(c.State),
              attrs: {
                version: c.CurrentBrokerSoftwareInfo?.KafkaVersion ?? null,
                brokers: c.NumberOfBrokerNodes ?? null,
                instanceType: c.BrokerNodeGroupInfo?.InstanceType ?? null,
                bootstrap: bootstrap?.replace(/127\.0\.0\.1|0\.0\.0\.0/g, 'emulator') ?? null,
                subnets: c.BrokerNodeGroupInfo?.ClientSubnets?.join(',') ?? null,
                createdAt: iso(c.CreationTime),
              },
            });
          }
          return rows;
        },
        create: {
          label: 'Criar cluster',
          fields: [
            { name: 'name', label: 'Nome do cluster', type: 'text', required: true, pattern: '^[a-zA-Z0-9-]{1,64}$' },
            { name: 'version', label: 'Versão do Kafka', type: 'select', default: '3.9.x', options: ['3.9.x', '3.8.x', '4.0.x.kraft'].map((v) => ({ value: v, label: v })) },
            { name: 'instanceType', label: 'Tipo de broker', type: 'select', default: 'kafka.m5.large', options: ['kafka.m5.large', 'kafka.m5.xlarge', 'kafka.m7g.large'].map((v) => ({ value: v, label: v })) },
            { name: 'brokers', label: 'Número de brokers', type: 'number', min: 1, max: 30, default: 2, description: 'Múltiplo do número de sub-redes.' },
            { name: 'subnetIds', label: 'Sub-redes', type: 'multiselect', source: 'ec2/subnet', description: 'Em branco: duas sub-redes padrão.' },
          ],
          async run(input) {
            const subnets = list(input, 'subnetIds');
            const { ClusterArn } = await kafka().send(
              new CreateClusterCommand({
                ClusterName: str(input, 'name'),
                KafkaVersion: str(input, 'version') || '3.9.x',
                NumberOfBrokerNodes: num(input, 'brokers') ?? 2,
                BrokerNodeGroupInfo: { InstanceType: str(input, 'instanceType') || 'kafka.m5.large', ClientSubnets: subnets.length ? subnets : await defaultSubnets(ctx) },
              }),
            );
            return { id: ClusterArn ?? '' };
          },
        },
        remove: {
          async run(id) {
            await kafka().send(new DeleteClusterCommand({ ClusterArn: id }));
          },
        },
        async persist(row) {
          return compact({
            name: row.name,
            version: row.attrs.version ? String(row.attrs.version) : undefined,
            instanceType: row.attrs.instanceType ? String(row.attrs.instanceType) : undefined,
            brokers: typeof row.attrs.brokers === 'number' ? row.attrs.brokers : undefined,
            subnetIds: String(row.attrs.subnets ?? '').split(',').filter(Boolean),
          });
        },
      },
    ],
  };
}

const QUERY_TIMEOUT_MS = 30_000;
const MAX_RESULT_ROWS = 200;

export function athenaService(ctx: CatalogContext): CatalogService {
  const athena = () => ctx.client(AthenaClient);

  async function runQuery(workGroup: string, sql: string, database: string | undefined, output: string | undefined): Promise<ActionResult> {
    const { QueryExecutionId } = await athena().send(
      new StartQueryExecutionCommand({
        QueryString: sql,
        WorkGroup: workGroup,
        QueryExecutionContext: database ? { Database: database } : undefined,
        ResultConfiguration: output ? { OutputLocation: output } : undefined,
      }),
    );
    const deadline = Date.now() + QUERY_TIMEOUT_MS;
    for (;;) {
      const { QueryExecution } = await athena().send(new GetQueryExecutionCommand({ QueryExecutionId }));
      const state = QueryExecution?.Status?.State;
      if (state === 'SUCCEEDED') break;
      if (state === 'FAILED' || state === 'CANCELLED') {
        throw new BadRequestError(`Consulta ${state === 'FAILED' ? 'falhou' : 'cancelada'}: ${QueryExecution?.Status?.StateChangeReason ?? ''}`);
      }
      if (Date.now() > deadline) throw new BadRequestError('A consulta não terminou em 30 segundos.');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const { ResultSet } = await athena().send(new GetQueryResultsCommand({ QueryExecutionId, MaxResults: MAX_RESULT_ROWS }));
    const [header, ...rows] = (ResultSet?.Rows ?? []).map((r) => (r.Data ?? []).map((d) => d.VarCharValue ?? null));
    return { kind: 'table', columns: (header ?? []).map((h) => h ?? ''), rows };
  }

  return {
    id: 'athena',
    name: 'Athena',
    description: 'Consultas SQL sobre dados no S3',
    category: 'Análise',
    notes: 'O emulador executa SQL de verdade, inclusive sobre tabelas do Glue Data Catalog que apontam para o S3.',
    types: [
      {
        key: 'workgroup',
        label: 'Grupos de trabalho',
        singular: 'grupo de trabalho',
        columns: [
          { key: 'description', label: 'Descrição' },
          { key: 'output', label: 'Local dos resultados' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const groups = await paginate(async (NextToken) => {
            const page = await athena().send(new ListWorkGroupsCommand({ NextToken }));
            return { items: page.WorkGroups, next: page.NextToken };
          });
          const rows = [];
          for (const g of groups) {
            // O emulador lista o grupo "primary" mas não o encontra no GetWorkGroup.
            const WorkGroup = await athena()
              .send(new GetWorkGroupCommand({ WorkGroup: g.Name }))
              .then((r) => r.WorkGroup)
              .catch(() => undefined);
            rows.push({
              id: g.Name!,
              name: g.Name!,
              status: status(g.State),
              attrs: {
                description: g.Description || null,
                output: WorkGroup?.Configuration?.ResultConfiguration?.OutputLocation ?? null,
                createdAt: iso(g.CreationTime),
              },
            });
          }
          return rows;
        },
        create: {
          label: 'Criar grupo de trabalho',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-zA-Z0-9._-]{1,128}$' },
            { name: 'description', label: 'Descrição', type: 'text' },
            { name: 'output', label: 'Local dos resultados', type: 'text', placeholder: 's3://meu-bucket/athena/', pattern: '^(s3://.+)?$' },
          ],
          async run(input) {
            const output = optStr(input, 'output');
            await athena().send(
              new CreateWorkGroupCommand({
                Name: str(input, 'name'),
                Description: optStr(input, 'description'),
                Configuration: output ? { ResultConfiguration: { OutputLocation: output } } : undefined,
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await athena().send(new DeleteWorkGroupCommand({ WorkGroup: id, RecursiveDeleteOption: true }));
          },
        },
        actions: [
          {
            key: 'RunQuery',
            label: 'Executar consulta',
            submitLabel: 'Executar',
            description: `Mostra até ${MAX_RESULT_ROWS} linhas.`,
            fields: [
              { name: 'database', label: 'Banco de dados (Glue)', type: 'select', source: 'glue/database' },
              { name: 'sql', label: 'Consulta', type: 'code', required: true, rows: 8, default: 'SELECT 1 AS ola' },
              {
                name: 'output',
                label: 'Local dos resultados',
                type: 'text',
                placeholder: 's3://meu-bucket/athena/',
                pattern: '^(s3://.+)?$',
                description: 'Obrigatório se o grupo de trabalho não tiver um local configurado.',
              },
            ],
            async run(id, input) {
              return runQuery(id, str(input, 'sql'), optStr(input, 'database'), optStr(input, 'output'));
            },
          },
        ],
        async persist(row) {
          if (row.id === 'primary') return null;
          return compact({
            name: row.id,
            description: row.attrs.description ? String(row.attrs.description) : undefined,
            output: row.attrs.output ? String(row.attrs.output) : undefined,
          });
        },
      },
    ],
  };
}

const TABLE_FORMATS = {
  csv: {
    input: 'org.apache.hadoop.mapred.TextInputFormat',
    output: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
    serde: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe',
    params: { 'field.delim': ',', 'skip.header.line.count': '1' },
  },
  json: {
    input: 'org.apache.hadoop.mapred.TextInputFormat',
    output: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
    serde: 'org.openx.data.jsonserde.JsonSerDe',
    params: {},
  },
  parquet: {
    input: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
    output: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
    serde: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
    params: {},
  },
} as const;

type TableFormat = keyof typeof TABLE_FORMATS;

/** Colunas no formato "nome:tipo", uma por linha (ex.: id:int). */
export function parseColumns(lines: string[]): { Name: string; Type: string }[] {
  return lines.map((line) => {
    const [name, type] = line.split(':').map((part) => part.trim());
    if (!name || !type) throw new BadRequestError(`Coluna inválida "${line}". Use nome:tipo (ex.: id:int).`);
    return { Name: name, Type: type };
  });
}

const formatOf = (serde: string | undefined): TableFormat =>
  serde?.includes('Parquet') ? 'parquet' : serde?.includes('Json') ? 'json' : 'csv';

export function glueService(ctx: CatalogContext): CatalogService {
  const glue = () => ctx.client(GlueClient);

  return {
    id: 'glue',
    name: 'Glue Data Catalog',
    description: 'Catálogo de bancos e tabelas para o Athena',
    category: 'Análise',
    types: [
      {
        key: 'database',
        label: 'Bancos de dados',
        singular: 'banco de dados',
        columns: [
          { key: 'description', label: 'Descrição' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const databases = await paginate(async (NextToken) => {
            const page = await glue().send(new GetDatabasesCommand({ NextToken }));
            return { items: page.DatabaseList, next: page.NextToken };
          });
          return databases.map((db) => ({ id: db.Name!, name: db.Name!, attrs: { description: db.Description ?? null, createdAt: iso(db.CreateTime) } }));
        },
        create: {
          label: 'Adicionar banco de dados',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-z0-9_]{1,255}$', patternHint: 'Minúsculas, números e sublinhados.' },
            { name: 'description', label: 'Descrição', type: 'text' },
          ],
          async run(input) {
            await glue().send(new CreateDatabaseCommand({ DatabaseInput: { Name: str(input, 'name'), Description: optStr(input, 'description') } }));
            return { id: str(input, 'name') };
          },
        },
        remove: {
          warning: 'As tabelas do banco também serão excluídas.',
          async run(id) {
            await glue().send(new DeleteDatabaseCommand({ Name: id }));
          },
        },
        async persist(row) {
          if (row.id === 'default') return null;
          return compact({ name: row.id, description: row.attrs.description ? String(row.attrs.description) : undefined });
        },
      },
      {
        key: 'table',
        label: 'Tabelas',
        singular: 'tabela',
        parent: 'database',
        columns: [
          { key: 'format', label: 'Formato' },
          { key: 'location', label: 'Local' },
          { key: 'columns', label: 'Colunas' },
        ],
        async list(database) {
          const tables = await paginate(async (NextToken) => {
            const page = await glue().send(new GetTablesCommand({ DatabaseName: database, NextToken }));
            return { items: page.TableList, next: page.NextToken };
          });
          return tables.map((t) => ({
            id: t.Name!,
            name: t.Name!,
            attrs: {
              format: formatOf(t.StorageDescriptor?.SerdeInfo?.SerializationLibrary),
              location: t.StorageDescriptor?.Location ?? null,
              columns: (t.StorageDescriptor?.Columns ?? []).map((c) => `${c.Name}:${c.Type}`).join(', ') || null,
            },
          }));
        },
        async describe(id, database) {
          return (await glue().send(new GetTableCommand({ DatabaseName: database, Name: id }))).Table ?? null;
        },
        create: {
          label: 'Adicionar tabela',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-z0-9_]{1,255}$' },
            { name: 'location', label: 'Local no S3', type: 'text', required: true, placeholder: 's3://meu-bucket/dados/', pattern: '^s3://.+' },
            {
              name: 'format',
              label: 'Formato',
              type: 'select',
              required: true,
              default: 'csv',
              options: [
                { value: 'csv', label: 'CSV (com cabeçalho)' },
                { value: 'json', label: 'JSON (um objeto por linha)' },
                { value: 'parquet', label: 'Parquet' },
              ],
            },
            { name: 'columns', label: 'Colunas', type: 'list', required: true, description: 'Uma por linha, no formato nome:tipo (ex.: id:int, nome:string).' },
          ],
          async run(input, database) {
            const format = TABLE_FORMATS[(str(input, 'format') || 'csv') as TableFormat];
            await glue().send(
              new CreateTableCommand({
                DatabaseName: database,
                TableInput: {
                  Name: str(input, 'name'),
                  TableType: 'EXTERNAL_TABLE',
                  StorageDescriptor: {
                    Columns: parseColumns(list(input, 'columns')),
                    Location: str(input, 'location'),
                    InputFormat: format.input,
                    OutputFormat: format.output,
                    SerdeInfo: { SerializationLibrary: format.serde, Parameters: { ...format.params } },
                  },
                },
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id, database) {
            await glue().send(new DeleteTableCommand({ DatabaseName: database, Name: id }));
          },
        },
        async persist(row) {
          return {
            name: row.id,
            location: String(row.attrs.location ?? ''),
            format: String(row.attrs.format ?? 'csv'),
            columns: String(row.attrs.columns ?? '').split(', ').filter(Boolean),
          };
        },
      },
    ],
  };
}

const MAX_READ_RECORDS = 50;

export function kinesisService(ctx: CatalogContext): CatalogService {
  const kinesis = () => ctx.client(KinesisClient);

  return {
    id: 'kinesis',
    name: 'Kinesis Data Streams',
    description: 'Streams de dados em tempo real',
    category: 'Análise',
    notes: 'Os registros enviados ficam na memória do emulador e se perdem quando ele reinicia; o painel recria só o stream.',
    types: [
      {
        key: 'stream',
        label: 'Streams de dados',
        singular: 'stream de dados',
        columns: [
          { key: 'mode', label: 'Modo de capacidade' },
          { key: 'shards', label: 'Fragmentos abertos' },
          { key: 'retention', label: 'Retenção (horas)' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const names = await paginate(async (NextToken) => {
            const page = await kinesis().send(new ListStreamsCommand({ NextToken }));
            return { items: page.StreamNames, next: page.HasMoreStreams ? page.NextToken : undefined };
          });
          const rows = [];
          for (const name of names) {
            const { StreamDescriptionSummary: s } = await kinesis().send(new DescribeStreamSummaryCommand({ StreamName: name }));
            rows.push({
              id: name,
              name,
              status: status(s?.StreamStatus),
              attrs: {
                mode: s?.StreamModeDetails?.StreamMode ?? null,
                shards: s?.OpenShardCount ?? null,
                retention: s?.RetentionPeriodHours ?? null,
                createdAt: iso(s?.StreamCreationTimestamp),
              },
            });
          }
          return rows;
        },
        async describe(id) {
          return (await kinesis().send(new DescribeStreamSummaryCommand({ StreamName: id }))).StreamDescriptionSummary ?? null;
        },
        create: {
          label: 'Criar stream de dados',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-zA-Z0-9_.-]{1,128}$' },
            {
              name: 'mode',
              label: 'Modo de capacidade',
              type: 'select',
              required: true,
              default: 'ON_DEMAND',
              options: [
                { value: 'ON_DEMAND', label: 'Sob demanda' },
                { value: 'PROVISIONED', label: 'Provisionado' },
              ],
            },
            { name: 'shards', label: 'Fragmentos (provisionado)', type: 'number', min: 1, max: 50, default: 1 },
          ],
          async run(input) {
            const provisioned = str(input, 'mode') === 'PROVISIONED';
            await kinesis().send(
              new CreateStreamCommand({
                StreamName: str(input, 'name'),
                StreamModeDetails: { StreamMode: provisioned ? 'PROVISIONED' : 'ON_DEMAND' },
                ShardCount: provisioned ? (num(input, 'shards') ?? 1) : undefined,
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await kinesis().send(new DeleteStreamCommand({ StreamName: id, EnforceConsumerDeletion: true }));
          },
        },
        actions: [
          {
            key: 'PutRecord',
            label: 'Enviar registro',
            submitLabel: 'Enviar',
            fields: [
              { name: 'partitionKey', label: 'Chave de partição', type: 'text', required: true, default: 'chave-1' },
              { name: 'data', label: 'Dados', type: 'code', required: true, rows: 6, default: '{"evento":"teste"}' },
            ],
            async run(id, input) {
              const { ShardId, SequenceNumber } = await kinesis().send(
                new PutRecordCommand({ StreamName: id, PartitionKey: str(input, 'partitionKey'), Data: Buffer.from(str(input, 'data')) }),
              );
              return message(`Registro gravado no fragmento ${ShardId} (sequência ${SequenceNumber}).`);
            },
          },
          {
            key: 'GetRecords',
            label: 'Ler registros',
            submitLabel: 'Ler',
            description: `Lê desde o início de cada fragmento (até ${MAX_READ_RECORDS} registros).`,
            fields: [],
            async run(id) {
              const { Shards = [] } = await kinesis().send(new ListShardsCommand({ StreamName: id }));
              const rows: (string | number | null)[][] = [];
              for (const shard of Shards) {
                const { ShardIterator } = await kinesis().send(
                  new GetShardIteratorCommand({ StreamName: id, ShardId: shard.ShardId, ShardIteratorType: 'TRIM_HORIZON' }),
                );
                const { Records = [] } = await kinesis().send(new GetRecordsCommand({ ShardIterator, Limit: MAX_READ_RECORDS }));
                for (const r of Records) {
                  rows.push([shard.ShardId ?? '', r.PartitionKey ?? '', Buffer.from(r.Data ?? new Uint8Array()).toString('utf8'), iso(r.ApproximateArrivalTimestamp)]);
                }
              }
              return { kind: 'table', columns: ['Fragmento', 'Chave de partição', 'Dados', 'Chegada'], rows: rows.slice(0, MAX_READ_RECORDS) };
            },
          },
        ],
        async persist(row) {
          return compact({ name: row.id, mode: String(row.attrs.mode ?? 'ON_DEMAND'), shards: typeof row.attrs.shards === 'number' ? row.attrs.shards : undefined });
        },
      },
    ],
  };
}

export function firehoseService(ctx: CatalogContext): CatalogService {
  const firehose = () => ctx.client(FirehoseClient);

  return {
    id: 'firehose',
    name: 'Data Firehose',
    description: 'Entrega de streams no S3',
    category: 'Análise',
    types: [
      {
        key: 'delivery-stream',
        label: 'Streams do Firehose',
        singular: 'stream do Firehose',
        columns: [
          { key: 'bucket', label: 'Bucket de destino' },
          { key: 'prefix', label: 'Prefixo' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const { DeliveryStreamNames = [] } = await firehose().send(new ListDeliveryStreamsCommand({}));
          const rows = [];
          for (const name of DeliveryStreamNames) {
            const { DeliveryStreamDescription: d } = await firehose().send(new DescribeDeliveryStreamCommand({ DeliveryStreamName: name }));
            const s3 = d?.Destinations?.[0]?.ExtendedS3DestinationDescription ?? d?.Destinations?.[0]?.S3DestinationDescription;
            rows.push({
              id: name,
              name,
              status: status(d?.DeliveryStreamStatus),
              attrs: { bucket: s3?.BucketARN?.replace('arn:aws:s3:::', '') ?? null, prefix: s3?.Prefix ?? null, createdAt: iso(d?.CreateTimestamp) },
            });
          }
          return rows;
        },
        async describe(id) {
          return (await firehose().send(new DescribeDeliveryStreamCommand({ DeliveryStreamName: id }))).DeliveryStreamDescription ?? null;
        },
        create: {
          label: 'Criar stream do Firehose',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-zA-Z0-9_.-]{1,64}$' },
            { name: 'bucket', label: 'Bucket do S3 de destino', type: 'select', source: 's3-buckets', required: true },
            { name: 'prefix', label: 'Prefixo', type: 'text', placeholder: 'firehose/' },
          ],
          async run(input) {
            await firehose().send(
              new CreateDeliveryStreamCommand({
                DeliveryStreamName: str(input, 'name'),
                DeliveryStreamType: 'DirectPut',
                ExtendedS3DestinationConfiguration: {
                  BucketARN: `arn:aws:s3:::${str(input, 'bucket')}`,
                  Prefix: optStr(input, 'prefix'),
                  RoleARN: await ensureDefaultRole(ctx.iam, 'firehose'),
                  BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 1 },
                },
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await firehose().send(new DeleteDeliveryStreamCommand({ DeliveryStreamName: id }));
          },
        },
        actions: [
          {
            key: 'PutRecord',
            label: 'Enviar registro',
            submitLabel: 'Enviar',
            fields: [{ name: 'data', label: 'Dados', type: 'code', required: true, rows: 6, default: '{"evento":"teste"}' }],
            async run(id, input) {
              const { RecordId } = await firehose().send(
                new FirehosePutRecordCommand({ DeliveryStreamName: id, Record: { Data: Buffer.from(`${str(input, 'data')}\n`) } }),
              );
              return message(`Registro aceito (${RecordId}). O Firehose agrupa os registros antes de gravar no S3.`);
            },
          },
        ],
        async persist(row) {
          return compact({ name: row.id, bucket: String(row.attrs.bucket ?? ''), prefix: row.attrs.prefix ? String(row.attrs.prefix) : undefined });
        },
      },
    ],
  };
}
