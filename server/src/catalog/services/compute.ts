import {
  CreateAutoScalingGroupCommand,
  DeleteAutoScalingGroupCommand,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand,
  AutoScalingClient,
} from '@aws-sdk/client-auto-scaling';
import {
  AuthorizeSecurityGroupIngressCommand,
  CreateKeyPairCommand,
  CreateLaunchTemplateCommand,
  CreateSecurityGroupCommand,
  CreateSubnetCommand,
  CreateVpcCommand,
  DeleteKeyPairCommand,
  DeleteLaunchTemplateCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeAvailabilityZonesCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeKeyPairsCommand,
  DescribeLaunchTemplatesCommand,
  DescribeLaunchTemplateVersionsCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  ImportKeyPairCommand,
  RebootInstancesCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  type IpPermission,
  type ResourceType as Ec2ResourceType,
  type TagSpecification,
} from '@aws-sdk/client-ec2';
import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  DeleteListenerCommand,
  DeleteLoadBalancerCommand,
  DeleteTargetGroupCommand,
  DescribeListenersCommand,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  ElasticLoadBalancingV2Client,
  type ProtocolEnum,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { BadRequestError } from '../../http/errors.js';
import type { CatalogContext } from '../context.js';
import { compact, iso, list, message, num, optStr, managedBy, status, str, tagValue } from '../helpers.js';
import type { CatalogService, FieldSpec, Input } from '../types.js';

const INSTANCE_TYPES = ['t3.micro', 't3.small', 't3.medium', 't3.large', 't4g.micro', 'm5.large', 'c5.large', 'r5.large'].map((v) => ({ value: v, label: v }));
const nameField: FieldSpec = { name: 'name', label: 'Nome (tag Name)', type: 'text' };

const tagsFor = (type: Ec2ResourceType, name: string | undefined): TagSpecification[] | undefined =>
  name ? [{ ResourceType: type, Tags: [{ Key: 'Name', Value: name }] }] : undefined;

/** Regra de entrada no formato "protocolo:porta:cidr" (ex.: tcp:22:0.0.0.0/0). */
export function parseIngressRule(rule: string): IpPermission {
  const match = /^(tcp|udp|icmp|-1|all):(\d+(?:-\d+)?|\*):([0-9./]+)$/i.exec(rule.trim());
  if (!match) throw new BadRequestError(`Regra inválida "${rule}". Use protocolo:porta:cidr, ex.: tcp:443:0.0.0.0/0`);
  const [, protocol, ports, cidr] = match as unknown as [string, string, string, string];
  const allProtocols = protocol === '-1' || protocol.toLowerCase() === 'all';
  const [from, to] = ports === '*' ? [-1, -1] : ports.split('-').map(Number);
  return {
    IpProtocol: allProtocols ? '-1' : protocol.toLowerCase(),
    FromPort: allProtocols ? undefined : from,
    ToPort: allProtocols ? undefined : (to ?? from),
    IpRanges: [{ CidrIp: cidr }],
  };
}

export function formatIngressRules(permissions: IpPermission[] | undefined): string[] {
  return (permissions ?? []).flatMap((p) => {
    const protocol = p.IpProtocol === '-1' ? 'all' : (p.IpProtocol ?? 'tcp');
    const ports = p.FromPort === undefined || p.FromPort === -1 ? '*' : p.FromPort === p.ToPort ? `${p.FromPort}` : `${p.FromPort}-${p.ToPort}`;
    return (p.IpRanges ?? []).map((r) => `${protocol}:${ports}:${r.CidrIp}`);
  });
}

export function ec2Service(ctx: CatalogContext): CatalogService {
  const ec2 = () => ctx.client(EC2Client);

  const instances = async () =>
    ((await ec2().send(new DescribeInstancesCommand({}))).Reservations ?? []).flatMap((r) => r.Instances ?? []);

  return {
    id: 'ec2',
    name: 'EC2',
    description: 'Servidores virtuais na nuvem',
    category: 'Computação',
    notes:
      'O emulador registra instâncias, VPCs e grupos de segurança, mas não executa máquinas: o estado "running" é só um registro. Serve para testar código e IaC que chamam a API do EC2.',
    types: [
      {
        key: 'instance',
        label: 'Instâncias',
        singular: 'instância',
        columns: [
          { key: 'type', label: 'Tipo' },
          { key: 'image', label: 'AMI' },
          { key: 'privateIp', label: 'IP privado' },
          { key: 'publicIp', label: 'IP público' },
          { key: 'launchedAt', label: 'Execução' },
        ],
        async list() {
          return (await instances())
            .filter((i) => i.State?.Name !== 'terminated')
            .map((i) => ({
              id: i.InstanceId!,
              name: tagValue(i.Tags) ?? i.InstanceId!,
              status: status(i.State?.Name),
              managedBy: managedBy(i.Tags),
              attrs: {
                type: i.InstanceType ?? null,
                image: i.ImageId ?? null,
                privateIp: i.PrivateIpAddress ?? null,
                publicIp: i.PublicIpAddress ?? null,
                launchedAt: iso(i.LaunchTime),
                subnet: i.SubnetId ?? null,
                vpc: i.VpcId ?? null,
                keyName: i.KeyName ?? null,
                securityGroups: (i.SecurityGroups ?? []).map((g) => g.GroupId).join(', ') || null,
              },
            }));
        },
        async describe(id) {
          return (await instances()).find((i) => i.InstanceId === id) ?? null;
        },
        create: {
          label: 'Executar instância',
          fields: [
            nameField,
            { name: 'imageId', label: 'Imagem de máquina (AMI)', type: 'select', source: 'ec2/image', required: true },
            { name: 'instanceType', label: 'Tipo de instância', type: 'select', options: INSTANCE_TYPES, default: 't3.micro', required: true },
            { name: 'keyName', label: 'Par de chaves', type: 'select', source: 'ec2/key-pair' },
            { name: 'subnetId', label: 'Sub-rede', type: 'select', source: 'ec2/subnet', description: 'Em branco: sub-rede padrão.' },
            { name: 'securityGroupIds', label: 'Grupos de segurança', type: 'multiselect', source: 'ec2/security-group' },
          ],
          async run(input) {
            const groups = list(input, 'securityGroupIds');
            const { Instances = [] } = await ec2().send(
              new RunInstancesCommand({
                ImageId: str(input, 'imageId'),
                InstanceType: str(input, 'instanceType') as never,
                MinCount: 1,
                MaxCount: 1,
                KeyName: optStr(input, 'keyName'),
                SubnetId: optStr(input, 'subnetId'),
                SecurityGroupIds: groups.length ? groups : undefined,
                TagSpecifications: tagsFor('instance', optStr(input, 'name')),
              }),
            );
            const id = Instances[0]?.InstanceId ?? '';
            // Estado salvo pela persistência: a instância volta parada se estava parada.
            if (input.stopped === true && id) await ec2().send(new StopInstancesCommand({ InstanceIds: [id] }));
            return { id };
          },
        },
        remove: {
          label: 'Encerrar instância',
          warning: 'A instância será encerrada (terminate).',
          async run(id) {
            await ec2().send(new TerminateInstancesCommand({ InstanceIds: [id] }));
          },
        },
        actions: [
          {
            key: 'StartInstances',
            label: 'Iniciar instância',
            fields: [],
            mutates: true,
            async run(id) {
              await ec2().send(new StartInstancesCommand({ InstanceIds: [id] }));
              return message('Instância iniciada.');
            },
          },
          {
            key: 'StopInstances',
            label: 'Interromper instância',
            fields: [],
            mutates: true,
            async run(id) {
              await ec2().send(new StopInstancesCommand({ InstanceIds: [id] }));
              return message('Instância interrompida.');
            },
          },
          {
            key: 'RebootInstances',
            label: 'Reinicializar instância',
            fields: [],
            mutates: true,
            async run(id) {
              await ec2().send(new RebootInstancesCommand({ InstanceIds: [id] }));
              return message('Reinicialização solicitada.');
            },
          },
        ],
        async persist(row) {
          const instance = (await instances()).find((i) => i.InstanceId === row.id);
          if (!instance) return null;
          return {
            ...compact({
              name: tagValue(instance.Tags),
              imageId: instance.ImageId,
              instanceType: instance.InstanceType,
              keyName: instance.KeyName,
              subnetId: instance.SubnetId,
              securityGroupIds: (instance.SecurityGroups ?? []).flatMap((g) => (g.GroupId ? [g.GroupId] : [])),
            }),
            stopped: instance.State?.Name === 'stopped',
          };
        },
      },
      {
        key: 'image',
        label: 'AMIs',
        singular: 'AMI',
        description: 'Imagens de máquina disponíveis no emulador.',
        columns: [
          { key: 'platform', label: 'Plataforma' },
          { key: 'architecture', label: 'Arquitetura' },
          { key: 'owner', label: 'Proprietário' },
        ],
        async list() {
          const { Images = [] } = await ec2().send(new DescribeImagesCommand({}));
          return Images.map((image) => ({
            id: image.ImageId!,
            name: image.Name ?? image.ImageId!,
            status: status(image.State),
            attrs: { platform: image.PlatformDetails ?? null, architecture: image.Architecture ?? null, owner: image.ImageOwnerAlias ?? image.OwnerId ?? null },
          }));
        },
        async describe(id) {
          return (await ec2().send(new DescribeImagesCommand({ ImageIds: [id] }))).Images?.[0] ?? null;
        },
      },
      {
        key: 'vpc',
        label: 'VPCs',
        singular: 'VPC',
        columns: [
          { key: 'cidr', label: 'CIDR IPv4' },
          { key: 'default', label: 'VPC padrão' },
        ],
        async list() {
          const { Vpcs = [] } = await ec2().send(new DescribeVpcsCommand({}));
          return Vpcs.map((vpc) => ({
            id: vpc.VpcId!,
            name: tagValue(vpc.Tags) ?? vpc.VpcId!,
            status: status(vpc.State),
            managedBy: managedBy(vpc.Tags),
            attrs: { cidr: vpc.CidrBlock ?? null, default: vpc.IsDefault ? 'Sim' : 'Não' },
          }));
        },
        async describe(id) {
          return (await ec2().send(new DescribeVpcsCommand({ VpcIds: [id] }))).Vpcs?.[0] ?? null;
        },
        create: {
          label: 'Criar VPC',
          fields: [nameField, { name: 'cidr', label: 'Bloco CIDR IPv4', type: 'text', required: true, default: '10.0.0.0/16', pattern: '^[0-9./]+$' }],
          async run(input) {
            const { Vpc } = await ec2().send(new CreateVpcCommand({ CidrBlock: str(input, 'cidr'), TagSpecifications: tagsFor('vpc', optStr(input, 'name')) }));
            return { id: Vpc?.VpcId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await ec2().send(new DeleteVpcCommand({ VpcId: id }));
          },
        },
        async persist(row) {
          if (row.attrs.default === 'Sim') return null;
          return compact({ name: row.name === row.id ? undefined : row.name, cidr: String(row.attrs.cidr ?? '') });
        },
      },
      {
        key: 'subnet',
        label: 'Sub-redes',
        singular: 'sub-rede',
        columns: [
          { key: 'vpc', label: 'VPC' },
          { key: 'cidr', label: 'CIDR IPv4' },
          { key: 'zone', label: 'Zona de disponibilidade' },
          { key: 'default', label: 'Padrão da zona' },
        ],
        async list() {
          const { Subnets = [] } = await ec2().send(new DescribeSubnetsCommand({}));
          return Subnets.map((subnet) => ({
            id: subnet.SubnetId!,
            name: tagValue(subnet.Tags) ?? subnet.SubnetId!,
            status: status(subnet.State),
            managedBy: managedBy(subnet.Tags),
            attrs: { vpc: subnet.VpcId ?? null, cidr: subnet.CidrBlock ?? null, zone: subnet.AvailabilityZone ?? null, default: subnet.DefaultForAz ? 'Sim' : 'Não' },
          }));
        },
        async describe(id) {
          return (await ec2().send(new DescribeSubnetsCommand({ SubnetIds: [id] }))).Subnets?.[0] ?? null;
        },
        create: {
          label: 'Criar sub-rede',
          fields: [
            nameField,
            { name: 'vpcId', label: 'VPC', type: 'select', source: 'ec2/vpc', required: true },
            { name: 'cidr', label: 'Bloco CIDR IPv4', type: 'text', required: true, placeholder: '10.0.1.0/24', pattern: '^[0-9./]+$' },
            { name: 'zone', label: 'Zona de disponibilidade', type: 'select', source: 'availability-zones' },
          ],
          async run(input) {
            const { Subnet } = await ec2().send(
              new CreateSubnetCommand({
                VpcId: str(input, 'vpcId'),
                CidrBlock: str(input, 'cidr'),
                AvailabilityZone: optStr(input, 'zone'),
                TagSpecifications: tagsFor('subnet', optStr(input, 'name')),
              }),
            );
            return { id: Subnet?.SubnetId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await ec2().send(new DeleteSubnetCommand({ SubnetId: id }));
          },
        },
        async persist(row) {
          if (row.attrs.default === 'Sim') return null;
          return compact({ name: row.name === row.id ? undefined : row.name, vpcId: String(row.attrs.vpc), cidr: String(row.attrs.cidr), zone: String(row.attrs.zone) });
        },
      },
      {
        key: 'security-group',
        label: 'Grupos de segurança',
        singular: 'grupo de segurança',
        columns: [
          { key: 'groupName', label: 'Nome do grupo' },
          { key: 'vpc', label: 'VPC' },
          { key: 'description', label: 'Descrição' },
          { key: 'ingress', label: 'Regras de entrada' },
        ],
        async list() {
          const { SecurityGroups = [] } = await ec2().send(new DescribeSecurityGroupsCommand({}));
          return SecurityGroups.map((group) => ({
            id: group.GroupId!,
            name: tagValue(group.Tags) ?? group.GroupName ?? group.GroupId!,
            managedBy: managedBy(group.Tags),
            attrs: {
              groupName: group.GroupName ?? null,
              vpc: group.VpcId ?? null,
              description: group.Description ?? null,
              ingress: formatIngressRules(group.IpPermissions).join(', ') || null,
            },
          }));
        },
        async describe(id) {
          return (await ec2().send(new DescribeSecurityGroupsCommand({ GroupIds: [id] }))).SecurityGroups?.[0] ?? null;
        },
        create: {
          label: 'Criar grupo de segurança',
          fields: [
            { name: 'groupName', label: 'Nome do grupo de segurança', type: 'text', required: true },
            { name: 'description', label: 'Descrição', type: 'text', required: true, default: 'Criado pelo Console AWS local' },
            { name: 'vpcId', label: 'VPC', type: 'select', source: 'ec2/vpc' },
            { name: 'ingress', label: 'Regras de entrada', type: 'list', description: 'Uma por linha: protocolo:porta:cidr (ex.: tcp:22:0.0.0.0/0).' },
          ],
          async run(input) {
            const { GroupId } = await ec2().send(
              new CreateSecurityGroupCommand({ GroupName: str(input, 'groupName'), Description: str(input, 'description'), VpcId: optStr(input, 'vpcId') }),
            );
            const rules = list(input, 'ingress').map(parseIngressRule);
            if (rules.length) await ec2().send(new AuthorizeSecurityGroupIngressCommand({ GroupId, IpPermissions: rules }));
            return { id: GroupId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await ec2().send(new DeleteSecurityGroupCommand({ GroupId: id }));
          },
        },
        actions: [
          {
            key: 'AuthorizeSecurityGroupIngress',
            label: 'Adicionar regra de entrada',
            fields: [{ name: 'rule', label: 'Regra', type: 'text', required: true, placeholder: 'tcp:443:0.0.0.0/0' }],
            mutates: true,
            async run(id, input) {
              await ec2().send(new AuthorizeSecurityGroupIngressCommand({ GroupId: id, IpPermissions: [parseIngressRule(str(input, 'rule'))] }));
              return message('Regra adicionada.');
            },
          },
        ],
        async persist(row) {
          if (row.attrs.groupName === 'default') return null;
          return compact({
            groupName: String(row.attrs.groupName),
            description: String(row.attrs.description ?? ''),
            vpcId: row.attrs.vpc ? String(row.attrs.vpc) : undefined,
            ingress: row.attrs.ingress ? String(row.attrs.ingress).split(', ') : undefined,
          });
        },
      },
      {
        key: 'key-pair',
        label: 'Pares de chaves',
        singular: 'par de chaves',
        columns: [
          { key: 'type', label: 'Tipo' },
          { key: 'fingerprint', label: 'Impressão digital' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const { KeyPairs = [] } = await ec2().send(new DescribeKeyPairsCommand({ IncludePublicKey: true }));
          return KeyPairs.map((key) => ({
            id: key.KeyName!,
            name: key.KeyName!,
            attrs: { type: key.KeyType ?? null, fingerprint: key.KeyFingerprint ?? null, createdAt: iso(key.CreateTime), publicKey: key.PublicKey ?? null },
          }));
        },
        create: {
          label: 'Criar par de chaves',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true },
            { name: 'publicKey', label: 'Chave pública para importar - opcional', type: 'textarea', description: 'Em branco: o emulador gera o par e mostra a chave privada uma única vez.' },
          ],
          async run(input) {
            const name = str(input, 'name');
            const publicKey = optStr(input, 'publicKey');
            if (publicKey) {
              await ec2().send(new ImportKeyPairCommand({ KeyName: name, PublicKeyMaterial: Buffer.from(publicKey) }));
              return { id: name };
            }
            const { KeyMaterial } = await ec2().send(new CreateKeyPairCommand({ KeyName: name }));
            return {
              id: name,
              reveal: KeyMaterial
                ? { label: 'Chave privada (.pem)', value: KeyMaterial, warning: 'Esta é a única vez em que a chave privada pode ser vista. Salve-a agora.' }
                : undefined,
            };
          },
        },
        remove: {
          async run(id) {
            await ec2().send(new DeleteKeyPairCommand({ KeyName: id }));
          },
        },
        // Volta pela chave pública: a privada que você salvou continua valendo.
        async persist(row) {
          return row.attrs.publicKey ? { name: row.id, publicKey: String(row.attrs.publicKey) } : null;
        },
      },
      {
        key: 'launch-template',
        label: 'Modelos de execução',
        singular: 'modelo de execução',
        columns: [
          { key: 'version', label: 'Versão padrão' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const { LaunchTemplates = [] } = await ec2().send(new DescribeLaunchTemplatesCommand({}));
          return LaunchTemplates.map((t) => ({
            id: t.LaunchTemplateId!,
            name: t.LaunchTemplateName ?? t.LaunchTemplateId!,
            managedBy: managedBy(t.Tags),
            attrs: { version: t.DefaultVersionNumber ?? null, createdAt: iso(t.CreateTime) },
          }));
        },
        async describe(id) {
          return (await ec2().send(new DescribeLaunchTemplateVersionsCommand({ LaunchTemplateId: id, Versions: ['$Default'] }))).LaunchTemplateVersions?.[0] ?? null;
        },
        create: {
          label: 'Criar modelo de execução',
          fields: [
            { name: 'name', label: 'Nome do modelo', type: 'text', required: true, pattern: '^[a-zA-Z0-9()./_-]{3,128}$', patternHint: '3 a 128 caracteres.' },
            { name: 'imageId', label: 'AMI', type: 'select', source: 'ec2/image', required: true },
            { name: 'instanceType', label: 'Tipo de instância', type: 'select', options: INSTANCE_TYPES, default: 't3.micro', required: true },
            { name: 'keyName', label: 'Par de chaves', type: 'select', source: 'ec2/key-pair' },
          ],
          async run(input) {
            const { LaunchTemplate } = await ec2().send(
              new CreateLaunchTemplateCommand({
                LaunchTemplateName: str(input, 'name'),
                LaunchTemplateData: { ImageId: str(input, 'imageId'), InstanceType: str(input, 'instanceType') as never, KeyName: optStr(input, 'keyName') },
              }),
            );
            return { id: LaunchTemplate?.LaunchTemplateId ?? '' };
          },
        },
        remove: {
          async run(id) {
            await ec2().send(new DeleteLaunchTemplateCommand({ LaunchTemplateId: id }));
          },
        },
        async persist(row) {
          const version = (await ec2().send(new DescribeLaunchTemplateVersionsCommand({ LaunchTemplateId: row.id, Versions: ['$Default'] }))).LaunchTemplateVersions?.[0];
          const data = version?.LaunchTemplateData;
          return compact({ name: row.name, imageId: data?.ImageId, instanceType: data?.InstanceType, keyName: data?.KeyName });
        },
      },
    ],
  };
}

export async function availabilityZones(ctx: CatalogContext) {
  const { AvailabilityZones = [] } = await ctx.client(EC2Client).send(new DescribeAvailabilityZonesCommand({}));
  return AvailabilityZones.flatMap((z) => (z.ZoneName ? [{ value: z.ZoneName, label: z.ZoneName }] : []));
}

export function autoScalingService(ctx: CatalogContext): CatalogService {
  const asg = () => ctx.client(AutoScalingClient);
  const groups = async () => (await asg().send(new DescribeAutoScalingGroupsCommand({}))).AutoScalingGroups ?? [];

  return {
    id: 'autoscaling',
    name: 'EC2 Auto Scaling',
    description: 'Grupos de instâncias com capacidade ajustável',
    category: 'Computação',
    notes: 'O grupo lança instâncias registradas no EC2 (sem máquinas reais). Essas instâncias são do grupo: o painel não as salva à parte.',
    types: [
      {
        key: 'group',
        label: 'Grupos do Auto Scaling',
        singular: 'grupo do Auto Scaling',
        columns: [
          { key: 'launchTemplate', label: 'Modelo de execução' },
          { key: 'desired', label: 'Desejada' },
          { key: 'min', label: 'Mínima' },
          { key: 'max', label: 'Máxima' },
          { key: 'instances', label: 'Instâncias' },
        ],
        async list() {
          return (await groups()).map((g) => ({
            id: g.AutoScalingGroupName!,
            name: g.AutoScalingGroupName!,
            status: status(g.Status ?? 'InService'),
            managedBy: managedBy(g.Tags),
            attrs: {
              launchTemplate: g.LaunchTemplate?.LaunchTemplateId ?? g.LaunchTemplate?.LaunchTemplateName ?? null,
              desired: g.DesiredCapacity ?? 0,
              min: g.MinSize ?? 0,
              max: g.MaxSize ?? 0,
              instances: g.Instances?.length ?? 0,
              subnets: g.VPCZoneIdentifier ?? null,
              createdAt: iso(g.CreatedTime),
            },
          }));
        },
        async describe(id) {
          return (await groups()).find((g) => g.AutoScalingGroupName === id) ?? null;
        },
        create: {
          label: 'Criar grupo do Auto Scaling',
          fields: [
            { name: 'name', label: 'Nome do grupo', type: 'text', required: true },
            { name: 'launchTemplateId', label: 'Modelo de execução', type: 'select', source: 'ec2/launch-template', required: true },
            { name: 'subnetIds', label: 'Sub-redes', type: 'multiselect', source: 'ec2/subnet', required: true },
            { name: 'min', label: 'Capacidade mínima', type: 'number', min: 0, default: 1, required: true },
            { name: 'max', label: 'Capacidade máxima', type: 'number', min: 0, default: 2, required: true },
            { name: 'desired', label: 'Capacidade desejada', type: 'number', min: 0, default: 1, required: true },
          ],
          async run(input) {
            const name = str(input, 'name');
            await asg().send(
              new CreateAutoScalingGroupCommand({
                AutoScalingGroupName: name,
                LaunchTemplate: { LaunchTemplateId: str(input, 'launchTemplateId'), Version: '$Default' },
                VPCZoneIdentifier: list(input, 'subnetIds').join(','),
                MinSize: num(input, 'min') ?? 0,
                MaxSize: num(input, 'max') ?? 1,
                DesiredCapacity: num(input, 'desired'),
              }),
            );
            return { id: name };
          },
        },
        remove: {
          async run(id) {
            await asg().send(new DeleteAutoScalingGroupCommand({ AutoScalingGroupName: id, ForceDelete: true }));
          },
        },
        actions: [
          {
            key: 'UpdateAutoScalingGroup',
            label: 'Editar capacidade',
            fields: [
              { name: 'min', label: 'Mínima', type: 'number', min: 0, required: true },
              { name: 'max', label: 'Máxima', type: 'number', min: 0, required: true },
              { name: 'desired', label: 'Desejada', type: 'number', min: 0, required: true },
            ],
            mutates: true,
            async run(id, input) {
              await asg().send(
                new UpdateAutoScalingGroupCommand({ AutoScalingGroupName: id, MinSize: num(input, 'min'), MaxSize: num(input, 'max'), DesiredCapacity: num(input, 'desired') }),
              );
              return message('Capacidade atualizada.');
            },
          },
        ],
        async persist(row) {
          return compact({
            name: row.id,
            launchTemplateId: String(row.attrs.launchTemplate ?? ''),
            subnetIds: String(row.attrs.subnets ?? '').split(',').filter(Boolean),
            min: Number(row.attrs.min),
            max: Number(row.attrs.max),
            desired: Number(row.attrs.desired),
          });
        },
      },
    ],
  };
}

const LB_PROTOCOLS = ['HTTP', 'HTTPS', 'TCP', 'UDP', 'TLS'].map((v) => ({ value: v, label: v }));

export function elbService(ctx: CatalogContext): CatalogService {
  const elb = () => ctx.client(ElasticLoadBalancingV2Client);

  return {
    id: 'elb',
    name: 'Elastic Load Balancing',
    description: 'Balanceadores de carga de aplicação e de rede',
    category: 'Redes e entrega de conteúdo',
    notes: 'Balanceadores, grupos de destino e listeners são registrados, mas o emulador não encaminha tráfego.',
    types: [
      {
        key: 'load-balancer',
        label: 'Balanceadores de carga',
        singular: 'balanceador de carga',
        columns: [
          { key: 'type', label: 'Tipo' },
          { key: 'scheme', label: 'Esquema' },
          { key: 'dns', label: 'Nome do DNS' },
          { key: 'vpc', label: 'VPC' },
        ],
        async list() {
          const { LoadBalancers = [] } = await elb().send(new DescribeLoadBalancersCommand({}));
          return LoadBalancers.map((lb) => ({
            id: lb.LoadBalancerArn!,
            name: lb.LoadBalancerName ?? lb.LoadBalancerArn!,
            status: status(lb.State?.Code),
            attrs: {
              type: lb.Type ?? null,
              scheme: lb.Scheme ?? null,
              dns: lb.DNSName ?? null,
              vpc: lb.VpcId ?? null,
              subnets: (lb.AvailabilityZones ?? []).map((z) => z.SubnetId).join(',') || null,
              securityGroups: (lb.SecurityGroups ?? []).join(',') || null,
              createdAt: iso(lb.CreatedTime),
            },
          }));
        },
        async describe(id) {
          return (await elb().send(new DescribeLoadBalancersCommand({ LoadBalancerArns: [id] }))).LoadBalancers?.[0] ?? null;
        },
        create: {
          label: 'Criar balanceador de carga',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-zA-Z0-9-]{1,32}$', patternHint: 'Até 32 caracteres: letras, números e hifens.' },
            { name: 'type', label: 'Tipo', type: 'select', required: true, default: 'application', options: [{ value: 'application', label: 'Application Load Balancer' }, { value: 'network', label: 'Network Load Balancer' }] },
            { name: 'scheme', label: 'Esquema', type: 'select', required: true, default: 'internet-facing', options: [{ value: 'internet-facing', label: 'Voltado para a internet' }, { value: 'internal', label: 'Interno' }] },
            { name: 'subnetIds', label: 'Sub-redes', type: 'multiselect', source: 'ec2/subnet', required: true, description: 'O Application Load Balancer exige duas zonas de disponibilidade.' },
            { name: 'securityGroupIds', label: 'Grupos de segurança', type: 'multiselect', source: 'ec2/security-group' },
          ],
          async run(input) {
            const groups = list(input, 'securityGroupIds');
            const { LoadBalancers = [] } = await elb().send(
              new CreateLoadBalancerCommand({
                Name: str(input, 'name'),
                Type: str(input, 'type') as never,
                Scheme: str(input, 'scheme') as never,
                Subnets: list(input, 'subnetIds'),
                SecurityGroups: groups.length ? groups : undefined,
              }),
            );
            return { id: LoadBalancers[0]?.LoadBalancerArn ?? '' };
          },
        },
        remove: {
          async run(id) {
            await elb().send(new DeleteLoadBalancerCommand({ LoadBalancerArn: id }));
          },
        },
        async persist(row) {
          return compact({
            name: row.name,
            type: String(row.attrs.type),
            scheme: String(row.attrs.scheme),
            subnetIds: String(row.attrs.subnets ?? '').split(',').filter(Boolean),
            securityGroupIds: String(row.attrs.securityGroups ?? '').split(',').filter(Boolean),
          });
        },
      },
      {
        key: 'target-group',
        label: 'Grupos de destino',
        singular: 'grupo de destino',
        columns: [
          { key: 'protocol', label: 'Protocolo' },
          { key: 'port', label: 'Porta' },
          { key: 'targetType', label: 'Tipo de destino' },
          { key: 'vpc', label: 'VPC' },
        ],
        async list() {
          const { TargetGroups = [] } = await elb().send(new DescribeTargetGroupsCommand({}));
          return TargetGroups.map((tg) => ({
            id: tg.TargetGroupArn!,
            name: tg.TargetGroupName ?? tg.TargetGroupArn!,
            attrs: { protocol: tg.Protocol ?? null, port: tg.Port ?? null, targetType: tg.TargetType ?? null, vpc: tg.VpcId ?? null },
          }));
        },
        async describe(id) {
          return (await elb().send(new DescribeTargetGroupsCommand({ TargetGroupArns: [id] }))).TargetGroups?.[0] ?? null;
        },
        create: {
          label: 'Criar grupo de destino',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[a-zA-Z0-9-]{1,32}$', patternHint: 'Até 32 caracteres: letras, números e hifens.' },
            { name: 'targetType', label: 'Tipo de destino', type: 'select', required: true, default: 'instance', options: [{ value: 'instance', label: 'Instâncias' }, { value: 'ip', label: 'Endereços IP' }, { value: 'lambda', label: 'Função Lambda' }] },
            { name: 'protocol', label: 'Protocolo', type: 'select', options: LB_PROTOCOLS, default: 'HTTP' },
            { name: 'port', label: 'Porta', type: 'number', min: 1, max: 65535, default: 80 },
            { name: 'vpcId', label: 'VPC', type: 'select', source: 'ec2/vpc' },
          ],
          async run(input) {
            const lambda = str(input, 'targetType') === 'lambda';
            const { TargetGroups = [] } = await elb().send(
              new CreateTargetGroupCommand({
                Name: str(input, 'name'),
                TargetType: str(input, 'targetType') as never,
                Protocol: lambda ? undefined : (str(input, 'protocol') as ProtocolEnum),
                Port: lambda ? undefined : num(input, 'port'),
                VpcId: lambda ? undefined : optStr(input, 'vpcId'),
              }),
            );
            return { id: TargetGroups[0]?.TargetGroupArn ?? '' };
          },
        },
        remove: {
          async run(id) {
            await elb().send(new DeleteTargetGroupCommand({ TargetGroupArn: id }));
          },
        },
        async persist(row) {
          return compact({
            name: row.name,
            targetType: String(row.attrs.targetType ?? 'instance'),
            protocol: row.attrs.protocol ? String(row.attrs.protocol) : undefined,
            port: typeof row.attrs.port === 'number' ? row.attrs.port : undefined,
            vpcId: row.attrs.vpc ? String(row.attrs.vpc) : undefined,
          });
        },
      },
      {
        key: 'listener',
        label: 'Listeners',
        singular: 'listener',
        parent: 'load-balancer',
        columns: [
          { key: 'protocol', label: 'Protocolo' },
          { key: 'port', label: 'Porta' },
          { key: 'targetGroup', label: 'Encaminha para' },
        ],
        async list(parentId) {
          const { Listeners = [] } = await elb().send(new DescribeListenersCommand({ LoadBalancerArn: parentId }));
          return Listeners.map((l) => ({
            id: l.ListenerArn!,
            name: `${l.Protocol}:${l.Port}`,
            attrs: { protocol: l.Protocol ?? null, port: l.Port ?? null, targetGroup: l.DefaultActions?.[0]?.TargetGroupArn ?? null },
          }));
        },
        create: {
          label: 'Adicionar listener',
          fields: [
            { name: 'protocol', label: 'Protocolo', type: 'select', options: LB_PROTOCOLS, default: 'HTTP', required: true },
            { name: 'port', label: 'Porta', type: 'number', min: 1, max: 65535, default: 80, required: true },
            { name: 'targetGroupArn', label: 'Grupo de destino', type: 'select', source: 'elb/target-group', required: true },
          ],
          async run(input, parentId) {
            const { Listeners = [] } = await elb().send(
              new CreateListenerCommand({
                LoadBalancerArn: parentId,
                Protocol: str(input, 'protocol') as ProtocolEnum,
                Port: num(input, 'port'),
                DefaultActions: [{ Type: 'forward', TargetGroupArn: str(input, 'targetGroupArn') }],
              }),
            );
            return { id: Listeners[0]?.ListenerArn ?? '' };
          },
        },
        remove: {
          async run(id) {
            await elb().send(new DeleteListenerCommand({ ListenerArn: id }));
          },
        },
        async persist(row): Promise<Input | null> {
          if (!row.attrs.targetGroup) return null;
          return { protocol: String(row.attrs.protocol), port: Number(row.attrs.port), targetGroupArn: String(row.attrs.targetGroup) };
        },
      },
    ],
  };
}

