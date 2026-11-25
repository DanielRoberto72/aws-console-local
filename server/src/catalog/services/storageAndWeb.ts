import {
  AppSyncClient,
  CreateApiKeyCommand,
  CreateGraphqlApiCommand,
  DeleteApiKeyCommand,
  DeleteGraphqlApiCommand,
  GetIntrospectionSchemaCommand,
  GetSchemaCreationStatusCommand,
  ListApiKeysCommand,
  ListGraphqlApisCommand,
  StartSchemaCreationCommand,
} from '@aws-sdk/client-appsync';
import { CreateFileSystemCommand, DeleteFileSystemCommand, DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
import { BadRequestError } from '../../http/errors.js';
import type { CatalogContext } from '../context.js';
import { bool, compact, iso, message, num, optStr, paginate, status, str, tagValue } from '../helpers.js';
import type { CatalogService } from '../types.js';
import { httpResult } from './analytics.js';

export function efsService(ctx: CatalogContext): CatalogService {
  const efs = () => ctx.client(EFSClient);
  const fileSystems = async () =>
    paginate(async (Marker) => {
      const page = await efs().send(new DescribeFileSystemsCommand({ Marker }));
      return { items: page.FileSystems, next: page.NextMarker };
    });

  return {
    id: 'efs',
    name: 'EFS',
    description: 'Sistema de arquivos elástico (NFS)',
    category: 'Armazenamento',
    notes: 'Os sistemas de arquivos são registrados, mas o emulador não monta volumes NFS.',
    types: [
      {
        key: 'file-system',
        label: 'Sistemas de arquivos',
        singular: 'sistema de arquivos',
        columns: [
          { key: 'performance', label: 'Modo de desempenho' },
          { key: 'throughput', label: 'Modo de throughput' },
          { key: 'encrypted', label: 'Criptografado' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          return (await fileSystems()).map((fs) => ({
            id: fs.FileSystemId!,
            name: tagValue(fs.Tags) ?? fs.Name ?? fs.FileSystemId!,
            status: status(fs.LifeCycleState),
            attrs: { performance: fs.PerformanceMode ?? null, throughput: fs.ThroughputMode ?? null, encrypted: fs.Encrypted ? 'Sim' : 'Não', createdAt: iso(fs.CreationTime) },
          }));
        },
        async describe(id) {
          return (await efs().send(new DescribeFileSystemsCommand({ FileSystemId: id }))).FileSystems?.[0] ?? null;
        },
        create: {
          label: 'Criar sistema de arquivos',
          fields: [
            { name: 'name', label: 'Nome', type: 'text' },
            {
              name: 'performance',
              label: 'Modo de desempenho',
              type: 'select',
              default: 'generalPurpose',
              options: [
                { value: 'generalPurpose', label: 'Uso geral' },
                { value: 'maxIO', label: 'E/S máxima' },
              ],
            },
            {
              name: 'throughput',
              label: 'Modo de throughput',
              type: 'select',
              default: 'elastic',
              options: [
                { value: 'elastic', label: 'Elástico' },
                { value: 'bursting', label: 'Intermitente' },
              ],
            },
            { name: 'encrypted', label: 'Criptografar dados em repouso', type: 'boolean', default: true },
          ],
          async run(input) {
            const name = optStr(input, 'name');
            const { FileSystemId } = await efs().send(
              new CreateFileSystemCommand({
                CreationToken: `console-local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                PerformanceMode: (str(input, 'performance') || 'generalPurpose') as never,
                ThroughputMode: (str(input, 'throughput') || 'elastic') as never,
                Encrypted: bool(input, 'encrypted'),
                Tags: name ? [{ Key: 'Name', Value: name }] : undefined,
              }),
            );
            return { id: FileSystemId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await efs().send(new DeleteFileSystemCommand({ FileSystemId: id }));
          },
        },
        async persist(row) {
          return compact({
            name: row.name === row.id ? undefined : row.name,
            performance: String(row.attrs.performance ?? 'generalPurpose'),
            throughput: String(row.attrs.throughput ?? 'elastic'),
            encrypted: row.attrs.encrypted === 'Sim',
          });
        },
      },
    ],
  };
}

const SCHEMA_TIMEOUT_MS = 15_000;
const DEFAULT_SCHEMA = 'type Query {\n  ola: String\n}\n\nschema {\n  query: Query\n}\n';

export function appSyncService(ctx: CatalogContext): CatalogService {
  const appsync = () => ctx.client(AppSyncClient);
  const apis = async () =>
    paginate(async (nextToken) => {
      const page = await appsync().send(new ListGraphqlApisCommand({ nextToken }));
      return { items: page.graphqlApis, next: page.nextToken };
    });

  async function setSchema(apiId: string, schema: string): Promise<void> {
    await appsync().send(new StartSchemaCreationCommand({ apiId, definition: Buffer.from(schema) }));
    const deadline = Date.now() + SCHEMA_TIMEOUT_MS;
    for (;;) {
      const { status: state, details } = await appsync().send(new GetSchemaCreationStatusCommand({ apiId }));
      if (state === 'SUCCESS' || state === 'ACTIVE') return;
      if (state === 'FAILED') throw new BadRequestError(`O schema foi recusado: ${details ?? ''}`);
      if (Date.now() > deadline) throw new BadRequestError('O schema não foi processado a tempo.');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const schemaOf = async (apiId: string) => {
    try {
      const { schema } = await appsync().send(new GetIntrospectionSchemaCommand({ apiId, format: 'SDL' }));
      return schema ? Buffer.from(schema).toString('utf8') : undefined;
    } catch {
      return undefined; // API sem schema
    }
  };

  return {
    id: 'appsync',
    name: 'AppSync',
    description: 'APIs GraphQL gerenciadas',
    category: 'Front-end web e mobile',
    notes: 'A API abre um endpoint GraphQL no emulador. Fora do compose, use o "Endpoint local", que fica fixo. Resolvers não são configurados por este painel.',
    types: [
      {
        key: 'graphql-api',
        label: 'APIs GraphQL',
        singular: 'API GraphQL',
        forward: 'endpoint',
        columns: [
          { key: 'auth', label: 'Autorização' },
          { key: 'endpoint', label: 'Endpoint GraphQL (rede do compose)' },
        ],
        async list() {
          return (await apis()).map((api) => ({
            id: api.apiId!,
            name: api.name ?? api.apiId!,
            attrs: { auth: api.authenticationType ?? null, endpoint: api.uris?.GRAPHQL?.replace(/127\.0\.0\.1|0\.0\.0\.0/, 'emulator') ?? null },
          }));
        },
        async describe(id) {
          return { api: (await apis()).find((a) => a.apiId === id) ?? null, schema: await schemaOf(id) };
        },
        create: {
          label: 'Criar API',
          fields: [
            { name: 'name', label: 'Nome da API', type: 'text', required: true, pattern: '^[_A-Za-z][_0-9A-Za-z -]{0,64}$' },
            {
              name: 'auth',
              label: 'Modo de autorização',
              type: 'select',
              default: 'API_KEY',
              options: [
                { value: 'API_KEY', label: 'Chave de API' },
                { value: 'AWS_IAM', label: 'IAM' },
              ],
            },
            { name: 'schema', label: 'Schema (SDL)', type: 'code', rows: 10, default: DEFAULT_SCHEMA },
          ],
          async run(input) {
            const { graphqlApi } = await appsync().send(new CreateGraphqlApiCommand({ name: str(input, 'name'), authenticationType: (str(input, 'auth') || 'API_KEY') as never }));
            const schema = optStr(input, 'schema');
            if (graphqlApi?.apiId && schema) await setSchema(graphqlApi.apiId, schema);
            return { id: graphqlApi?.apiId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await appsync().send(new DeleteGraphqlApiCommand({ apiId: id }));
          },
        },
        actions: [
          {
            key: 'StartSchemaCreation',
            label: 'Editar schema',
            fields: [{ name: 'schema', label: 'Schema (SDL)', type: 'code', required: true, rows: 14 }],
            mutates: true,
            async run(id, input) {
              await setSchema(id, str(input, 'schema'));
              return message('Schema atualizado.');
            },
          },
          {
            key: 'Query',
            label: 'Executar consulta',
            submitLabel: 'Executar',
            fields: [
              { name: 'query', label: 'Consulta GraphQL', type: 'code', required: true, rows: 8, default: '{ __typename }' },
              { name: 'variables', label: 'Variáveis (JSON) - opcional', type: 'code', rows: 4 },
            ],
            async run(id, input) {
              const api = (await apis()).find((a) => a.apiId === id);
              const endpoint = api?.uris?.GRAPHQL;
              if (!endpoint) throw new BadRequestError('A API não tem endpoint GraphQL.');
              const keys = (await appsync().send(new ListApiKeysCommand({ apiId: id }))).apiKeys ?? [];
              const variables = optStr(input, 'variables');
              const response = await ctx.fetch(endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(keys[0]?.id ? { 'x-api-key': keys[0].id } : {}) },
                body: JSON.stringify({ query: str(input, 'query'), variables: variables ? JSON.parse(variables) : undefined }),
              });
              return httpResult(response.status, response.contentType, response.body);
            },
          },
        ],
        async persist(row) {
          return compact({ name: row.name, auth: String(row.attrs.auth ?? 'API_KEY'), schema: await schemaOf(row.id) });
        },
      },
      {
        key: 'api-key',
        label: 'Chaves de API',
        singular: 'chave de API',
        parent: 'graphql-api',
        notes: 'Na restauração a chave é recriada com outro valor.',
        columns: [
          { key: 'description', label: 'Descrição' },
          { key: 'expires', label: 'Expira em' },
        ],
        async list(apiId) {
          const keys = (await appsync().send(new ListApiKeysCommand({ apiId }))).apiKeys ?? [];
          return keys.map((k) => ({
            id: k.id!,
            name: k.id!,
            attrs: { description: k.description ?? null, expires: k.expires ? new Date(k.expires * 1000).toISOString() : null },
          }));
        },
        create: {
          label: 'Criar chave de API',
          fields: [
            { name: 'description', label: 'Descrição', type: 'text' },
            { name: 'days', label: 'Validade (dias)', type: 'number', min: 1, max: 365, default: 7 },
          ],
          async run(input, apiId) {
            const days = num(input, 'days') ?? 7;
            const { apiKey } = await appsync().send(
              new CreateApiKeyCommand({ apiId, description: optStr(input, 'description'), expires: Math.floor(Date.now() / 1000) + days * 86_400 }),
            );
            return { id: apiKey?.id ?? '' };
          },
        },
        remove: {
          async run(id, apiId) {
            await appsync().send(new DeleteApiKeyCommand({ apiId, id }));
          },
        },
        async persist(row) {
          return compact({ description: row.attrs.description ? String(row.attrs.description) : undefined, days: 7 });
        },
      },
    ],
  };
}
