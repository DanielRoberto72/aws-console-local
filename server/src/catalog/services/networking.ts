import { CreateRestApiCommand, DeleteRestApiCommand, GetRestApisCommand, APIGatewayClient } from '@aws-sdk/client-api-gateway';
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  DeleteApiCommand,
  DeleteRouteCommand,
  GetApiCommand,
  GetApisCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
} from '@aws-sdk/client-apigatewayv2';
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  DeleteHostedZoneCommand,
  GetHostedZoneCommand,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
  type ResourceRecordSet,
} from '@aws-sdk/client-route-53';
import { BadRequestError, NotFoundError } from '../../http/errors.js';
import type { CatalogContext } from '../context.js';
import { compact, iso, list, num, optStr, paginate, str } from '../helpers.js';
import type { CatalogService } from '../types.js';
import { httpResult } from './analytics.js';

const REGION = 'us-east-1';
const ACCOUNT = '000000000000';

export function apiGatewayService(ctx: CatalogContext): CatalogService {
  const v2 = () => ctx.client(ApiGatewayV2Client);
  const v1 = () => ctx.client(APIGatewayClient);

  const apis = async () =>
    paginate(async (NextToken) => {
      const page = await v2().send(new GetApisCommand({ NextToken }));
      return { items: page.Items, next: page.NextToken };
    });

  /** Integração com a Lambda e a permissão de invocar, como o console faz ao escolher a função. */
  async function addLambdaRoute(apiId: string, routeKey: string, functionArn: string): Promise<string> {
    const { IntegrationId } = await v2().send(
      new CreateIntegrationCommand({ ApiId: apiId, IntegrationType: 'AWS_PROXY', IntegrationUri: functionArn, PayloadFormatVersion: '2.0' }),
    );
    const { RouteId } = await v2().send(new CreateRouteCommand({ ApiId: apiId, RouteKey: routeKey, Target: `integrations/${IntegrationId}` }));
    await ctx.permissions.allow(functionArn, 'apigateway.amazonaws.com', `arn:aws:execute-api:${REGION}:${ACCOUNT}:${apiId}/*`);
    return RouteId ?? '';
  }

  return {
    id: 'apigateway',
    name: 'API Gateway',
    description: 'APIs HTTP e REST',
    category: 'Redes e entrega de conteúdo',
    notes: 'As APIs HTTP com rotas para funções Lambda funcionam de verdade. As APIs REST são só registradas.',
    types: [
      {
        key: 'http-api',
        label: 'APIs HTTP',
        singular: 'API HTTP',
        columns: [
          { key: 'endpoint', label: 'URL de invocação' },
          { key: 'protocol', label: 'Protocolo' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          return (await apis()).map((api) => ({
            id: api.ApiId!,
            name: api.Name ?? api.ApiId!,
            attrs: { endpoint: api.ApiEndpoint?.replace('127.0.0.1', 'localhost') ?? null, protocol: api.ProtocolType ?? null, createdAt: iso(api.CreatedDate) },
          }));
        },
        async describe(id) {
          return v2().send(new GetApiCommand({ ApiId: id }));
        },
        create: {
          label: 'Criar API HTTP',
          fields: [
            { name: 'name', label: 'Nome da API', type: 'text', required: true },
            { name: 'functionArn', label: 'Função Lambda da rota padrão - opcional', type: 'select', source: 'lambda-functions', description: 'Cria a rota $default apontando para a função.' },
          ],
          async run(input) {
            const { ApiId } = await v2().send(new CreateApiCommand({ Name: str(input, 'name'), ProtocolType: 'HTTP' }));
            await v2().send(new CreateStageCommand({ ApiId, StageName: '$default', AutoDeploy: true }));
            const functionArn = optStr(input, 'functionArn');
            if (functionArn) await addLambdaRoute(ApiId!, '$default', functionArn);
            return { id: ApiId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await v2().send(new DeleteApiCommand({ ApiId: id }));
          },
        },
        actions: [
          {
            key: 'Invoke',
            label: 'Testar',
            submitLabel: 'Enviar',
            description: 'Chama a API pelo endpoint do emulador.',
            fields: [
              { name: 'method', label: 'Método', type: 'select', required: true, default: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((v) => ({ value: v, label: v })) },
              { name: 'path', label: 'Caminho', type: 'text', required: true, default: '/', pattern: '^/.*' },
              { name: 'body', label: 'Corpo - opcional', type: 'code', rows: 6 },
            ],
            async run(id, input) {
              const { ApiEndpoint } = await v2().send(new GetApiCommand({ ApiId: id }));
              if (!ApiEndpoint) throw new NotFoundError('A API não tem endpoint.');
              const response = await ctx.fetch(`${ApiEndpoint}${str(input, 'path')}`, {
                method: str(input, 'method'),
                headers: { 'content-type': 'application/json' },
                body: optStr(input, 'body'),
              });
              return httpResult(response.status, response.contentType, response.body);
            },
          },
        ],
        async persist(row) {
          return { name: row.name };
        },
      },
      {
        key: 'route',
        label: 'Rotas',
        singular: 'rota',
        parent: 'http-api',
        columns: [{ key: 'target', label: 'Integração' }],
        async list(apiId) {
          const { Items: routes = [] } = await v2().send(new GetRoutesCommand({ ApiId: apiId }));
          const { Items: integrations = [] } = await v2().send(new GetIntegrationsCommand({ ApiId: apiId }));
          return routes.map((r) => {
            const integration = integrations.find((i) => r.Target === `integrations/${i.IntegrationId}`);
            return { id: r.RouteId!, name: r.RouteKey ?? r.RouteId!, attrs: { target: integration?.IntegrationUri ?? r.Target ?? null } };
          });
        },
        create: {
          label: 'Criar rota',
          fields: [
            { name: 'routeKey', label: 'Rota', type: 'text', required: true, placeholder: 'GET /pedidos', pattern: '^(\\$default|(ANY|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.*)$', patternHint: '"MÉTODO /caminho" ou $default.' },
            { name: 'functionArn', label: 'Função Lambda', type: 'select', source: 'lambda-functions', required: true },
          ],
          async run(input, apiId) {
            return { id: await addLambdaRoute(apiId!, str(input, 'routeKey'), str(input, 'functionArn')) };
          },
        },
        remove: {
          async run(id, apiId) {
            await v2().send(new DeleteRouteCommand({ ApiId: apiId, RouteId: id }));
          },
        },
        async persist(row) {
          const target = String(row.attrs.target ?? '');
          return target.startsWith('arn:aws:lambda:') ? { routeKey: row.name, functionArn: target } : null;
        },
      },
      {
        key: 'rest-api',
        label: 'APIs REST',
        singular: 'API REST',
        columns: [
          { key: 'description', label: 'Descrição' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const items = await paginate(async (position) => {
            const page = await v1().send(new GetRestApisCommand({ position }));
            return { items: page.items, next: page.position };
          });
          return items.map((api) => ({ id: api.id!, name: api.name ?? api.id!, attrs: { description: api.description ?? null, createdAt: iso(api.createdDate) } }));
        },
        create: {
          label: 'Criar API REST',
          fields: [
            { name: 'name', label: 'Nome da API', type: 'text', required: true },
            { name: 'description', label: 'Descrição', type: 'text' },
          ],
          async run(input) {
            const { id } = await v1().send(new CreateRestApiCommand({ name: str(input, 'name'), description: optStr(input, 'description') }));
            return { id: id ?? '' };
          },
        },
        remove: {
          async run(id) {
            await v1().send(new DeleteRestApiCommand({ restApiId: id }));
          },
        },
        async persist(row) {
          return compact({ name: row.name, description: row.attrs.description ? String(row.attrs.description) : undefined });
        },
      },
    ],
  };
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'CAA'].map((v) => ({ value: v, label: v }));
const zoneId = (id: string) => id.replace('/hostedzone/', '');
const withDot = (name: string) => (name.endsWith('.') ? name : `${name}.`);
/** ID de registro: nome e tipo, que identificam um conjunto de registros na zona. */
const recordId = (r: ResourceRecordSet) => `${r.Name}|${r.Type}`;

export function route53Service(ctx: CatalogContext): CatalogService {
  const r53 = () => ctx.client(Route53Client);
  const records = async (zone: string) =>
    (await r53().send(new ListResourceRecordSetsCommand({ HostedZoneId: zone }))).ResourceRecordSets ?? [];

  /** Os registros SOA e NS do topo da zona são criados pela própria zona. */
  const isZoneDefault = (r: ResourceRecordSet, zoneName: string) => (r.Type === 'SOA' || r.Type === 'NS') && r.Name === withDot(zoneName);

  return {
    id: 'route53',
    name: 'Route 53',
    description: 'DNS e registro de domínios',
    category: 'Redes e entrega de conteúdo',
    notes: 'Zonas e registros são registrados, mas o emulador não responde a consultas DNS.',
    types: [
      {
        key: 'hosted-zone',
        label: 'Zonas hospedadas',
        singular: 'zona hospedada',
        columns: [
          { key: 'type', label: 'Tipo' },
          { key: 'records', label: 'Registros' },
          { key: 'comment', label: 'Descrição' },
        ],
        async list() {
          const zones = await paginate(async (Marker) => {
            const page = await r53().send(new ListHostedZonesCommand({ Marker }));
            return { items: page.HostedZones, next: page.IsTruncated ? page.NextMarker : undefined };
          });
          return zones.map((z) => ({
            id: zoneId(z.Id!),
            name: z.Name ?? z.Id!,
            attrs: { type: z.Config?.PrivateZone ? 'Privada' : 'Pública', records: z.ResourceRecordSetCount ?? 0, comment: z.Config?.Comment ?? null },
          }));
        },
        async describe(id) {
          return r53().send(new GetHostedZoneCommand({ Id: id }));
        },
        create: {
          label: 'Criar zona hospedada',
          fields: [
            { name: 'name', label: 'Nome de domínio', type: 'text', required: true, placeholder: 'exemplo.com', pattern: '^[a-zA-Z0-9.-]+\\.?$' },
            { name: 'comment', label: 'Descrição', type: 'text' },
          ],
          async run(input) {
            const { HostedZone } = await r53().send(
              new CreateHostedZoneCommand({ Name: str(input, 'name'), CallerReference: `console-local-${Date.now()}`, HostedZoneConfig: { Comment: optStr(input, 'comment') } }),
            );
            return { id: zoneId(HostedZone?.Id ?? '') };
          },
        },
        remove: {
          warning: 'Os registros da zona também serão excluídos.',
          async run(id) {
            const { HostedZone } = await r53().send(new GetHostedZoneCommand({ Id: id }));
            const changes = (await records(id)).filter((r) => !isZoneDefault(r, HostedZone?.Name ?? '')).map((r) => ({ Action: 'DELETE' as const, ResourceRecordSet: r }));
            if (changes.length) await r53().send(new ChangeResourceRecordSetsCommand({ HostedZoneId: id, ChangeBatch: { Changes: changes } }));
            await r53().send(new DeleteHostedZoneCommand({ Id: id }));
          },
        },
        async persist(row) {
          return compact({ name: row.name, comment: row.attrs.comment ? String(row.attrs.comment) : undefined });
        },
      },
      {
        key: 'record',
        label: 'Registros',
        singular: 'registro',
        parent: 'hosted-zone',
        columns: [
          { key: 'type', label: 'Tipo' },
          { key: 'ttl', label: 'TTL' },
          { key: 'values', label: 'Valor' },
        ],
        async list(zone) {
          return (await records(zone!)).map((r) => ({
            id: recordId(r),
            name: r.Name ?? '',
            attrs: { type: r.Type ?? null, ttl: r.TTL ?? null, values: (r.ResourceRecords ?? []).map((v) => v.Value).join('\n') || null },
          }));
        },
        create: {
          label: 'Criar registro',
          fields: [
            { name: 'name', label: 'Nome do registro (completo)', type: 'text', required: true, placeholder: 'www.exemplo.com' },
            { name: 'type', label: 'Tipo', type: 'select', options: RECORD_TYPES, default: 'A', required: true },
            { name: 'ttl', label: 'TTL (segundos)', type: 'number', min: 0, default: 300, required: true },
            { name: 'values', label: 'Valores', type: 'list', required: true, description: 'Um por linha.' },
          ],
          async run(input, zone) {
            const values = list(input, 'values');
            if (!values.length) throw new BadRequestError('Informe ao menos um valor.');
            const record: ResourceRecordSet = {
              Name: withDot(str(input, 'name')),
              Type: str(input, 'type') as never,
              TTL: num(input, 'ttl') ?? 300,
              ResourceRecords: values.map((Value) => ({ Value })),
            };
            await r53().send(new ChangeResourceRecordSetsCommand({ HostedZoneId: zone, ChangeBatch: { Changes: [{ Action: 'CREATE', ResourceRecordSet: record }] } }));
            return { id: recordId(record) };
          },
        },
        remove: {
          async run(id, zone) {
            const record = (await records(zone!)).find((r) => recordId(r) === id);
            if (!record) throw new NotFoundError(`Registro ${id} não encontrado.`);
            await r53().send(new ChangeResourceRecordSetsCommand({ HostedZoneId: zone, ChangeBatch: { Changes: [{ Action: 'DELETE', ResourceRecordSet: record }] } }));
          },
        },
        async persist(row, zone) {
          const { HostedZone } = await r53().send(new GetHostedZoneCommand({ Id: zone }));
          if ((row.attrs.type === 'SOA' || row.attrs.type === 'NS') && row.name === HostedZone?.Name) return null;
          return { name: row.name, type: String(row.attrs.type), ttl: Number(row.attrs.ttl ?? 300), values: String(row.attrs.values ?? '').split('\n').filter(Boolean) };
        },
      },
    ],
  };
}
