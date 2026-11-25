import { CreateRepositoryCommand, DeleteRepositoryCommand, DescribeImagesCommand, DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr';
import {
  CreateClusterCommand,
  CreateServiceCommand,
  DeleteClusterCommand,
  DeleteServiceCommand,
  DeregisterTaskDefinitionCommand,
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  ListTaskDefinitionFamiliesCommand,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import { CreateClusterCommand as CreateEksClusterCommand, DeleteClusterCommand as DeleteEksClusterCommand, DescribeClusterCommand, EKSClient, ListClustersCommand as ListEksClustersCommand } from '@aws-sdk/client-eks';
import { EC2Client, DescribeSubnetsCommand } from '@aws-sdk/client-ec2';
import { ensureDefaultRole } from '../../iam/iamService.js';
import type { CatalogContext } from '../context.js';
import { compact, iso, list, message, num, optStr, paginate, status, str } from '../helpers.js';
import type { CatalogService } from '../types.js';

/** Duas sub-redes padrão de zonas diferentes, usadas quando o formulário não pede rede. */
export async function defaultSubnets(ctx: CatalogContext): Promise<string[]> {
  const { Subnets = [] } = await ctx.client(EC2Client).send(new DescribeSubnetsCommand({ Filters: [{ Name: 'default-for-az', Values: ['true'] }] }));
  return Subnets.slice(0, 2).flatMap((s) => (s.SubnetId ? [s.SubnetId] : []));
}

export function ecsService(ctx: CatalogContext): CatalogService {
  const ecs = () => ctx.client(ECSClient);

  const clusters = async () => {
    const arns = await paginate(async (nextToken) => {
      const page = await ecs().send(new ListClustersCommand({ nextToken }));
      return { items: page.clusterArns, next: page.nextToken };
    });
    if (!arns.length) return [];
    return (await ecs().send(new DescribeClustersCommand({ clusters: arns }))).clusters ?? [];
  };

  const latestTaskDefinition = async (family: string) =>
    (await ecs().send(new DescribeTaskDefinitionCommand({ taskDefinition: family }))).taskDefinition;

  return {
    id: 'ecs',
    name: 'Elastic Container Service',
    description: 'Orquestração de contêineres',
    category: 'Contêineres',
    notes: 'Clusters, definições de tarefa e serviços são registrados, mas o emulador não executa contêineres (as tarefas ficam com 0 em execução).',
    types: [
      {
        key: 'cluster',
        label: 'Clusters',
        singular: 'cluster',
        columns: [
          { key: 'services', label: 'Serviços' },
          { key: 'running', label: 'Tarefas em execução' },
          { key: 'pending', label: 'Tarefas pendentes' },
        ],
        async list() {
          return (await clusters()).map((c) => ({
            id: c.clusterName!,
            name: c.clusterName!,
            status: status(c.status),
            attrs: { services: c.activeServicesCount ?? 0, running: c.runningTasksCount ?? 0, pending: c.pendingTasksCount ?? 0, arn: c.clusterArn ?? null },
          }));
        },
        create: {
          label: 'Criar cluster',
          fields: [{ name: 'name', label: 'Nome do cluster', type: 'text', required: true, pattern: '^[a-zA-Z0-9_-]{1,255}$' }],
          async run(input) {
            await ecs().send(new CreateClusterCommand({ clusterName: str(input, 'name') }));
            return { id: str(input, 'name') };
          },
        },
        remove: {
          warning: 'O cluster precisa estar sem serviços.',
          async run(id) {
            await ecs().send(new DeleteClusterCommand({ cluster: id }));
          },
        },
        async persist(row) {
          return { name: row.id };
        },
      },
      {
        key: 'task-definition',
        label: 'Definições de tarefa',
        singular: 'definição de tarefa',
        columns: [
          { key: 'revision', label: 'Última revisão' },
          { key: 'image', label: 'Imagem' },
          { key: 'cpu', label: 'CPU' },
          { key: 'memory', label: 'Memória (MiB)' },
        ],
        async list() {
          const families = await paginate(async (nextToken) => {
            const page = await ecs().send(new ListTaskDefinitionFamiliesCommand({ status: 'ACTIVE', nextToken }));
            return { items: page.families, next: page.nextToken };
          });
          const rows = [];
          for (const family of families) {
            const def = await latestTaskDefinition(family);
            const container = def?.containerDefinitions?.[0];
            rows.push({
              id: family,
              name: family,
              status: status(def?.status),
              attrs: {
                revision: def?.revision ?? null,
                image: container?.image ?? null,
                cpu: def?.cpu ?? null,
                memory: def?.memory ?? container?.memory ?? null,
                containerName: container?.name ?? null,
                containerPort: container?.portMappings?.[0]?.containerPort ?? null,
              },
            });
          }
          return rows;
        },
        async describe(id) {
          return latestTaskDefinition(id);
        },
        create: {
          label: 'Criar definição de tarefa',
          fields: [
            { name: 'family', label: 'Família', type: 'text', required: true, pattern: '^[a-zA-Z0-9_-]{1,255}$' },
            { name: 'containerName', label: 'Nome do contêiner', type: 'text', required: true, default: 'app' },
            { name: 'image', label: 'Imagem', type: 'text', required: true, placeholder: 'nginx:latest' },
            { name: 'containerPort', label: 'Porta do contêiner', type: 'number', min: 1, max: 65535 },
            { name: 'cpu', label: 'CPU (unidades)', type: 'select', default: '256', options: ['256', '512', '1024', '2048'].map((v) => ({ value: v, label: v })) },
            { name: 'memory', label: 'Memória (MiB)', type: 'select', default: '512', options: ['512', '1024', '2048', '4096'].map((v) => ({ value: v, label: v })) },
          ],
          async run(input) {
            const port = num(input, 'containerPort');
            const { taskDefinition } = await ecs().send(
              new RegisterTaskDefinitionCommand({
                family: str(input, 'family'),
                requiresCompatibilities: ['FARGATE'],
                networkMode: 'awsvpc',
                cpu: str(input, 'cpu') || '256',
                memory: str(input, 'memory') || '512',
                containerDefinitions: [
                  { name: str(input, 'containerName'), image: str(input, 'image'), essential: true, portMappings: port ? [{ containerPort: port }] : undefined },
                ],
              }),
            );
            return { id: taskDefinition?.family ?? str(input, 'family') };
          },
        },
        remove: {
          label: 'Cancelar registro',
          warning: 'Todas as revisões ativas da família terão o registro cancelado.',
          async run(id) {
            const arns = await paginate(async (nextToken) => {
              const page = await ecs().send(new ListTaskDefinitionsCommand({ familyPrefix: id, status: 'ACTIVE', nextToken }));
              return { items: page.taskDefinitionArns, next: page.nextToken };
            });
            for (const arn of arns) await ecs().send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
          },
        },
        async persist(row) {
          return compact({
            family: row.id,
            containerName: String(row.attrs.containerName ?? 'app'),
            image: String(row.attrs.image ?? ''),
            containerPort: typeof row.attrs.containerPort === 'number' ? row.attrs.containerPort : undefined,
            cpu: row.attrs.cpu ? String(row.attrs.cpu) : undefined,
            memory: row.attrs.memory ? String(row.attrs.memory) : undefined,
          });
        },
      },
      {
        key: 'service',
        label: 'Serviços',
        singular: 'serviço',
        parent: 'cluster',
        columns: [
          { key: 'taskDefinition', label: 'Definição de tarefa' },
          { key: 'desired', label: 'Desejadas' },
          { key: 'running', label: 'Em execução' },
          { key: 'launchType', label: 'Tipo de execução' },
        ],
        async list(cluster) {
          const arns = await paginate(async (nextToken) => {
            const page = await ecs().send(new ListServicesCommand({ cluster, nextToken }));
            return { items: page.serviceArns, next: page.nextToken };
          });
          if (!arns.length) return [];
          const { services = [] } = await ecs().send(new DescribeServicesCommand({ cluster, services: arns }));
          return services.map((s) => ({
            id: s.serviceName!,
            name: s.serviceName!,
            status: status(s.status),
            attrs: {
              taskDefinition: s.taskDefinition?.split('/').pop()?.split(':')[0] ?? null,
              desired: s.desiredCount ?? 0,
              running: s.runningCount ?? 0,
              launchType: s.launchType ?? null,
            },
          }));
        },
        create: {
          label: 'Criar serviço',
          fields: [
            { name: 'name', label: 'Nome do serviço', type: 'text', required: true },
            { name: 'taskDefinition', label: 'Definição de tarefa', type: 'select', source: 'ecs/task-definition', required: true },
            { name: 'desired', label: 'Tarefas desejadas', type: 'number', min: 0, default: 1, required: true },
          ],
          async run(input, cluster) {
            // As definições criadas pelo painel usam awsvpc, que exige sub-redes.
            await ecs().send(
              new CreateServiceCommand({
                cluster,
                serviceName: str(input, 'name'),
                taskDefinition: str(input, 'taskDefinition'),
                desiredCount: num(input, 'desired'),
                launchType: 'FARGATE',
                networkConfiguration: { awsvpcConfiguration: { subnets: await defaultSubnets(ctx) } },
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id, cluster) {
            await ecs().send(new UpdateServiceCommand({ cluster, service: id, desiredCount: 0 }));
            await ecs().send(new DeleteServiceCommand({ cluster, service: id, force: true }));
          },
        },
        actions: [
          {
            key: 'UpdateService',
            label: 'Atualizar tarefas desejadas',
            fields: [{ name: 'desired', label: 'Tarefas desejadas', type: 'number', min: 0, required: true }],
            mutates: true,
            async run(id, input, cluster) {
              await ecs().send(new UpdateServiceCommand({ cluster, service: id, desiredCount: num(input, 'desired') }));
              return message('Serviço atualizado.');
            },
          },
        ],
        async persist(row) {
          return compact({ name: row.id, taskDefinition: String(row.attrs.taskDefinition ?? ''), desired: Number(row.attrs.desired ?? 0) });
        },
      },
    ],
  };
}

export function ecrService(ctx: CatalogContext): CatalogService {
  const ecr = () => ctx.client(ECRClient);
  const repositories = async () => (await ecr().send(new DescribeRepositoriesCommand({}))).repositories ?? [];

  return {
    id: 'ecr',
    name: 'Elastic Container Registry',
    description: 'Registro de imagens de contêiner',
    category: 'Contêineres',
    types: [
      {
        key: 'repository',
        label: 'Repositórios privados',
        singular: 'repositório',
        columns: [
          { key: 'uri', label: 'URI' },
          { key: 'mutability', label: 'Mutabilidade de tags' },
          { key: 'scanOnPush', label: 'Verificar ao enviar' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          return (await repositories()).map((r) => ({
            id: r.repositoryName!,
            name: r.repositoryName!,
            attrs: {
              uri: r.repositoryUri ?? null,
              mutability: r.imageTagMutability ?? null,
              scanOnPush: r.imageScanningConfiguration?.scanOnPush ? 'Sim' : 'Não',
              createdAt: iso(r.createdAt),
            },
          }));
        },
        async describe(id) {
          const repository = (await repositories()).find((r) => r.repositoryName === id);
          const images = (await ecr().send(new DescribeImagesCommand({ repositoryName: id }))).imageDetails ?? [];
          return { repository, images };
        },
        create: {
          label: 'Criar repositório',
          fields: [
            { name: 'name', label: 'Nome do repositório', type: 'text', required: true, pattern: '^[a-z0-9._/-]{2,256}$', patternHint: 'Letras minúsculas, números e ._/-' },
            { name: 'mutability', label: 'Mutabilidade de tags', type: 'select', default: 'MUTABLE', options: [{ value: 'MUTABLE', label: 'Mutável' }, { value: 'IMMUTABLE', label: 'Imutável' }] },
            { name: 'scanOnPush', label: 'Verificar imagens ao enviar', type: 'boolean' },
          ],
          async run(input) {
            await ecr().send(
              new CreateRepositoryCommand({
                repositoryName: str(input, 'name'),
                imageTagMutability: (str(input, 'mutability') || 'MUTABLE') as never,
                imageScanningConfiguration: { scanOnPush: input.scanOnPush === true },
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          warning: 'O repositório e todas as imagens serão excluídos.',
          async run(id) {
            await ecr().send(new DeleteRepositoryCommand({ repositoryName: id, force: true }));
          },
        },
        async persist(row) {
          return { name: row.id, mutability: String(row.attrs.mutability ?? 'MUTABLE'), scanOnPush: row.attrs.scanOnPush === 'Sim' };
        },
      },
    ],
  };
}

export function eksService(ctx: CatalogContext): CatalogService {
  const eks = () => ctx.client(EKSClient);

  return {
    id: 'eks',
    name: 'Elastic Kubernetes Service',
    description: 'Kubernetes gerenciado',
    category: 'Contêineres',
    notes: 'O cluster é registrado com endpoint, mas o emulador não sobe um plano de controle do Kubernetes.',
    types: [
      {
        key: 'cluster',
        label: 'Clusters',
        singular: 'cluster',
        columns: [
          { key: 'version', label: 'Versão do Kubernetes' },
          { key: 'endpoint', label: 'Endpoint da API' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const names = await paginate(async (nextToken) => {
            const page = await eks().send(new ListEksClustersCommand({ nextToken }));
            return { items: page.clusters, next: page.nextToken };
          });
          const rows = [];
          for (const name of names) {
            const { cluster } = await eks().send(new DescribeClusterCommand({ name }));
            rows.push({
              id: name,
              name,
              status: status(cluster?.status),
              attrs: {
                version: cluster?.version ?? null,
                endpoint: cluster?.endpoint ?? null,
                createdAt: iso(cluster?.createdAt),
                role: cluster?.roleArn ?? null,
                subnets: cluster?.resourcesVpcConfig?.subnetIds?.join(',') ?? null,
              },
            });
          }
          return rows;
        },
        async describe(id) {
          return (await eks().send(new DescribeClusterCommand({ name: id }))).cluster ?? null;
        },
        create: {
          label: 'Criar cluster',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[0-9A-Za-z][A-Za-z0-9_-]{0,99}$' },
            { name: 'version', label: 'Versão do Kubernetes', type: 'select', default: '1.31', options: ['1.32', '1.31', '1.30', '1.29'].map((v) => ({ value: v, label: v })) },
            { name: 'subnetIds', label: 'Sub-redes', type: 'multiselect', source: 'ec2/subnet', description: 'Em branco: duas sub-redes padrão de zonas diferentes.' },
            { name: 'roleArn', label: 'Função do IAM do cluster', type: 'select', source: 'iam-roles', description: 'Em branco: o painel cria aws-console-local-eks.' },
          ],
          async run(input) {
            const subnets = list(input, 'subnetIds');
            await eks().send(
              new CreateEksClusterCommand({
                name: str(input, 'name'),
                version: optStr(input, 'version'),
                roleArn: optStr(input, 'roleArn') ?? (await ensureDefaultRole(ctx.iam, 'eks')),
                // O EKS exige sub-redes em pelo menos duas zonas.
                resourcesVpcConfig: { subnetIds: subnets.length ? subnets : await defaultSubnets(ctx) },
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await eks().send(new DeleteEksClusterCommand({ name: id }));
          },
        },
        async persist(row) {
          return compact({
            name: row.id,
            version: row.attrs.version ? String(row.attrs.version) : undefined,
            roleArn: row.attrs.role ? String(row.attrs.role) : undefined,
            subnetIds: String(row.attrs.subnets ?? '').split(',').filter(Boolean),
          });
        },
      },
    ],
  };
}
