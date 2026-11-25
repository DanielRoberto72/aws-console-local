import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { ListTopicsCommand } from '@aws-sdk/client-sns';
import { ListQueuesCommand } from '@aws-sdk/client-sqs';
import { NotFoundError } from '../http/errors.js';
import type { CatalogContext } from './context.js';
import { availabilityZones } from './services/compute.js';
import { paginate } from './helpers.js';
import type { CatalogService, FieldOption, FieldSpec, ResourceType } from './types.js';

const ACCOUNT = '000000000000';
const REGION = 'us-east-1';

/** Consultas a serviços fora do catálogo, usadas como opções de formulário. */
function lookups(ctx: CatalogContext): Record<string, () => Promise<FieldOption[]>> {
  const { clients } = ctx;
  return {
    'lambda-functions': async () =>
      (
        await paginate(async (Marker) => {
          const page = await clients.lambda.send(new ListFunctionsCommand({ Marker }));
          return { items: page.Functions, next: page.NextMarker };
        })
      ).flatMap((f) => (f.FunctionArn ? [{ value: f.FunctionArn, label: f.FunctionName ?? f.FunctionArn }] : [])),
    's3-buckets': async () =>
      ((await clients.s3.send(new ListBucketsCommand({}))).Buckets ?? []).flatMap((b) => (b.Name ? [{ value: b.Name, label: b.Name }] : [])),
    'sns-topics': async () =>
      (
        await paginate(async (NextToken) => {
          const page = await clients.sns.send(new ListTopicsCommand({ NextToken }));
          return { items: page.Topics, next: page.NextToken };
        })
      ).flatMap((t) => (t.TopicArn ? [{ value: t.TopicArn, label: t.TopicArn.split(':').pop()! }] : [])),
    'sqs-queues': async () =>
      ((await clients.sqs.send(new ListQueuesCommand({}))).QueueUrls ?? []).map((url) => {
        const name = url.split('/').pop()!;
        return { value: `arn:aws:sqs:${REGION}:${ACCOUNT}:${name}`, label: name };
      }),
    'availability-zones': () => availabilityZones(ctx),
    'iam-roles': async () => (await ctx.iam.listRoles()).map((r) => ({ value: r.arn, label: r.name })),
  };
}

export interface TypeRef {
  service: CatalogService;
  type: ResourceType;
}

/** Índice do catálogo: serviços, tipos e fontes de opções. */
export class CatalogRegistry {
  private readonly lookups: Record<string, () => Promise<FieldOption[]>>;

  constructor(
    readonly services: readonly CatalogService[],
    ctx: CatalogContext,
  ) {
    this.lookups = lookups(ctx);
  }

  service(id: string): CatalogService {
    const service = this.services.find((s) => s.id === id);
    if (!service) throw new NotFoundError(`Serviço desconhecido: ${id}`);
    return service;
  }

  type(serviceId: string, typeKey: string): TypeRef {
    const service = this.service(serviceId);
    const type = service.types.find((t) => t.key === typeKey);
    if (!type) throw new NotFoundError(`Tipo de recurso desconhecido: ${serviceId}/${typeKey}`);
    return { service, type };
  }

  /** "serviço/tipo" quando a fonte é um tipo do catálogo; undefined para consultas. */
  catalogSource(field: FieldSpec): TypeRef | undefined {
    if (!field.source?.includes('/')) return undefined;
    const [serviceId, typeKey] = field.source.split('/') as [string, string];
    return this.type(serviceId, typeKey);
  }

  async options(source: string): Promise<FieldOption[]> {
    const lookup = this.lookups[source];
    if (lookup) return lookup();
    const ref = source.includes('/') ? this.type(...(source.split('/') as [string, string])) : undefined;
    if (!ref || ref.type.parent) throw new NotFoundError(`Fonte de opções desconhecida: ${source}`);
    return (await ref.type.list()).map((row) => ({ value: row.id, label: row.name === row.id ? row.id : `${row.name} (${row.id})` }));
  }
}
