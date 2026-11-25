import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStackEventsCommand,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
  UpdateStackCommand,
  type Parameter,
} from '@aws-sdk/client-cloudformation';
import {
  CloudWatchClient,
  DeleteAlarmsCommand,
  DeleteDashboardsCommand,
  DescribeAlarmsCommand,
  GetDashboardCommand,
  GetMetricStatisticsCommand,
  ListDashboardsCommand,
  ListMetricsCommand,
  PutDashboardCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
  SetAlarmStateCommand,
  type Dimension,
} from '@aws-sdk/client-cloudwatch';
import { BadRequestError } from '../../http/errors.js';
import type { CatalogContext } from '../context.js';
import { compact, iso, list, message, num, optStr, paginate, status, str } from '../helpers.js';
import type { CatalogService, Input } from '../types.js';

const STATISTICS = ['Average', 'Sum', 'Minimum', 'Maximum', 'SampleCount'].map((v) => ({ value: v, label: v }));
const COMPARISONS = [
  { value: 'GreaterThanThreshold', label: 'Maior que' },
  { value: 'GreaterThanOrEqualToThreshold', label: 'Maior ou igual a' },
  { value: 'LessThanThreshold', label: 'Menor que' },
  { value: 'LessThanOrEqualToThreshold', label: 'Menor ou igual a' },
];

/** Dimensões no formato "Nome=Valor", uma por linha. */
export function parseDimensions(lines: string[]): Dimension[] {
  return lines.map((line) => {
    const index = line.indexOf('=');
    if (index <= 0) throw new BadRequestError(`Dimensão inválida "${line}". Use Nome=Valor.`);
    return { Name: line.slice(0, index).trim(), Value: line.slice(index + 1).trim() };
  });
}

const formatDimensions = (dimensions: Dimension[] | undefined) => (dimensions ?? []).map((d) => `${d.Name}=${d.Value}`);

/** ID de métrica: namespace, nome e dimensões, já que a métrica não tem ID próprio. */
const metricId = (namespace: string, name: string, dimensions: string[]) => JSON.stringify([namespace, name, dimensions]);

function parseMetricId(id: string): { namespace: string; name: string; dimensions: Dimension[] } {
  const [namespace, name, dimensions] = JSON.parse(id) as [string, string, string[]];
  return { namespace, name, dimensions: parseDimensions(dimensions) };
}

export function cloudWatchService(ctx: CatalogContext): CatalogService {
  const cw = () => ctx.client(CloudWatchClient);
  const alarms = async () =>
    paginate(async (NextToken) => {
      const page = await cw().send(new DescribeAlarmsCommand({ NextToken }));
      return { items: page.MetricAlarms, next: page.NextToken };
    });

  return {
    id: 'cloudwatch',
    name: 'CloudWatch',
    description: 'Métricas, alarmes e painéis',
    category: 'Gerenciamento e governança',
    notes: 'Os dados de métricas ficam na memória do emulador; o painel salva alarmes e painéis, não os pontos de dados.',
    types: [
      {
        key: 'alarm',
        label: 'Alarmes',
        singular: 'alarme',
        columns: [
          { key: 'metric', label: 'Métrica' },
          { key: 'condition', label: 'Condição' },
          { key: 'updatedAt', label: 'Última mudança de estado' },
        ],
        async list() {
          return (await alarms()).map((a) => ({
            id: a.AlarmName!,
            name: a.AlarmName!,
            status: { label: a.StateValue ?? 'INSUFFICIENT_DATA', tone: a.StateValue === 'ALARM' ? 'error' : a.StateValue === 'OK' ? 'success' : 'pending' },
            attrs: {
              metric: `${a.Namespace}/${a.MetricName}`,
              condition: `${a.Statistic} ${COMPARISONS.find((c) => c.value === a.ComparisonOperator)?.label.toLowerCase() ?? a.ComparisonOperator} ${a.Threshold} por ${a.EvaluationPeriods} x ${a.Period}s`,
              updatedAt: iso(a.StateUpdatedTimestamp),
              reason: a.StateReason ?? null,
            },
          }));
        },
        async describe(id) {
          return (await alarms()).find((a) => a.AlarmName === id) ?? null;
        },
        create: {
          label: 'Criar alarme',
          fields: [
            { name: 'name', label: 'Nome do alarme', type: 'text', required: true },
            { name: 'namespace', label: 'Namespace', type: 'text', required: true, placeholder: 'MinhaApp' },
            { name: 'metric', label: 'Nome da métrica', type: 'text', required: true, placeholder: 'Erros' },
            { name: 'dimensions', label: 'Dimensões', type: 'list', description: 'Uma por linha: Nome=Valor.' },
            { name: 'statistic', label: 'Estatística', type: 'select', options: STATISTICS, default: 'Sum', required: true },
            { name: 'comparison', label: 'Condição', type: 'select', options: COMPARISONS, default: 'GreaterThanThreshold', required: true },
            { name: 'threshold', label: 'Limite', type: 'number', required: true, default: 0 },
            { name: 'period', label: 'Período (segundos)', type: 'number', min: 10, default: 60, required: true },
            { name: 'evaluationPeriods', label: 'Períodos de avaliação', type: 'number', min: 1, default: 1, required: true },
            { name: 'topicArn', label: 'Notificar tópico do SNS', type: 'select', source: 'sns-topics' },
          ],
          async run(input) {
            const topic = optStr(input, 'topicArn');
            await cw().send(
              new PutMetricAlarmCommand({
                AlarmName: str(input, 'name'),
                Namespace: str(input, 'namespace'),
                MetricName: str(input, 'metric'),
                Dimensions: parseDimensions(list(input, 'dimensions')),
                Statistic: str(input, 'statistic') as never,
                ComparisonOperator: str(input, 'comparison') as never,
                Threshold: num(input, 'threshold') ?? 0,
                Period: num(input, 'period') ?? 60,
                EvaluationPeriods: num(input, 'evaluationPeriods') ?? 1,
                AlarmActions: topic ? [topic] : undefined,
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await cw().send(new DeleteAlarmsCommand({ AlarmNames: [id] }));
          },
        },
        actions: [
          {
            key: 'SetAlarmState',
            label: 'Definir estado (teste)',
            description: 'Força o estado do alarme para testar as notificações.',
            fields: [
              { name: 'state', label: 'Estado', type: 'select', required: true, default: 'ALARM', options: ['ALARM', 'OK', 'INSUFFICIENT_DATA'].map((v) => ({ value: v, label: v })) },
              { name: 'reason', label: 'Motivo', type: 'text', required: true, default: 'Teste pelo Console AWS local' },
            ],
            mutates: true,
            async run(id, input) {
              await cw().send(new SetAlarmStateCommand({ AlarmName: id, StateValue: str(input, 'state') as never, StateReason: str(input, 'reason') }));
              return message('Estado do alarme alterado.');
            },
          },
        ],
        async persist(row) {
          const alarm = (await alarms()).find((a) => a.AlarmName === row.id);
          if (!alarm) return null;
          return compact({
            name: row.id,
            namespace: alarm.Namespace,
            metric: alarm.MetricName,
            dimensions: formatDimensions(alarm.Dimensions),
            statistic: alarm.Statistic,
            comparison: alarm.ComparisonOperator,
            threshold: alarm.Threshold,
            period: alarm.Period,
            evaluationPeriods: alarm.EvaluationPeriods,
            topicArn: alarm.AlarmActions?.[0],
          });
        },
      },
      {
        key: 'metric',
        label: 'Métricas',
        singular: 'métrica',
        columns: [
          { key: 'namespace', label: 'Namespace' },
          { key: 'metric', label: 'Métrica' },
          { key: 'dimensions', label: 'Dimensões' },
        ],
        async list() {
          const metrics = await paginate(async (NextToken) => {
            const page = await cw().send(new ListMetricsCommand({ NextToken }));
            return { items: page.Metrics, next: page.NextToken };
          });
          return metrics.map((m) => {
            const dimensions = formatDimensions(m.Dimensions);
            return {
              id: metricId(m.Namespace ?? '', m.MetricName ?? '', dimensions),
              name: `${m.Namespace}/${m.MetricName}`,
              attrs: { namespace: m.Namespace ?? null, metric: m.MetricName ?? null, dimensions: dimensions.join(', ') || null },
            };
          });
        },
        create: {
          label: 'Publicar dado de métrica',
          fields: [
            { name: 'namespace', label: 'Namespace', type: 'text', required: true, placeholder: 'MinhaApp', pattern: '^[^:].*' },
            { name: 'metric', label: 'Nome da métrica', type: 'text', required: true, placeholder: 'Pedidos' },
            { name: 'dimensions', label: 'Dimensões', type: 'list', description: 'Uma por linha: Nome=Valor.' },
            { name: 'value', label: 'Valor', type: 'number', required: true, default: 1 },
          ],
          async run(input) {
            const dimensions = list(input, 'dimensions');
            await cw().send(
              new PutMetricDataCommand({
                Namespace: str(input, 'namespace'),
                MetricData: [{ MetricName: str(input, 'metric'), Value: num(input, 'value') ?? 0, Dimensions: parseDimensions(dimensions) }],
              }),
            );
            return { id: metricId(str(input, 'namespace'), str(input, 'metric'), dimensions) };
          },
        },
        actions: [
          {
            key: 'PutMetricData',
            label: 'Publicar valor',
            fields: [{ name: 'value', label: 'Valor', type: 'number', required: true, default: 1 }],
            async run(id, input) {
              const metric = parseMetricId(id);
              await cw().send(
                new PutMetricDataCommand({ Namespace: metric.namespace, MetricData: [{ MetricName: metric.name, Dimensions: metric.dimensions, Value: num(input, 'value') ?? 0 }] }),
              );
              return message('Valor publicado.');
            },
          },
          {
            key: 'GetMetricStatistics',
            label: 'Ver dados da última hora',
            submitLabel: 'Consultar',
            fields: [{ name: 'statistic', label: 'Estatística', type: 'select', options: STATISTICS, default: 'Sum', required: true }],
            async run(id, input) {
              const metric = parseMetricId(id);
              const statistic = str(input, 'statistic') as 'Sum';
              const end = new Date();
              const { Datapoints = [] } = await cw().send(
                new GetMetricStatisticsCommand({
                  Namespace: metric.namespace,
                  MetricName: metric.name,
                  Dimensions: metric.dimensions,
                  StartTime: new Date(end.getTime() - 3_600_000),
                  EndTime: end,
                  Period: 60,
                  Statistics: [statistic],
                }),
              );
              const rows = Datapoints.sort((a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0)).map((d) => [iso(d.Timestamp), d[statistic] ?? null]);
              return { kind: 'table', columns: ['Minuto', statistic], rows };
            },
          },
        ],
      },
      {
        key: 'dashboard',
        label: 'Painéis',
        singular: 'painel',
        columns: [
          { key: 'size', label: 'Tamanho (bytes)' },
          { key: 'updatedAt', label: 'Última atualização' },
        ],
        async list() {
          const { DashboardEntries = [] } = await cw().send(new ListDashboardsCommand({}));
          return DashboardEntries.map((d) => ({ id: d.DashboardName!, name: d.DashboardName!, attrs: { size: d.Size ?? null, updatedAt: iso(d.LastModified) } }));
        },
        async describe(id) {
          const { DashboardBody } = await cw().send(new GetDashboardCommand({ DashboardName: id }));
          return DashboardBody ? JSON.parse(DashboardBody) : null;
        },
        create: {
          label: 'Criar painel',
          fields: [
            { name: 'name', label: 'Nome do painel', type: 'text', required: true, pattern: '^[a-zA-Z0-9_-]{1,255}$' },
            { name: 'body', label: 'Definição (JSON)', type: 'code', required: true, rows: 12, default: '{\n  "widgets": []\n}' },
          ],
          async run(input) {
            await cw().send(new PutDashboardCommand({ DashboardName: str(input, 'name'), DashboardBody: str(input, 'body') }));
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await cw().send(new DeleteDashboardsCommand({ DashboardNames: [id] }));
          },
        },
        async persist(row) {
          const { DashboardBody } = await cw().send(new GetDashboardCommand({ DashboardName: row.id }));
          return { name: row.id, body: DashboardBody ?? '{"widgets":[]}' };
        },
      },
    ],
  };
}

/** Parâmetros no formato "Chave=Valor", um por linha. */
export function parseParameters(lines: string[]): Parameter[] {
  return lines.map((line) => {
    const index = line.indexOf('=');
    if (index <= 0) throw new BadRequestError(`Parâmetro inválido "${line}". Use Chave=Valor.`);
    return { ParameterKey: line.slice(0, index).trim(), ParameterValue: line.slice(index + 1) };
  });
}

const CAPABILITIES = ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'] as const;
const DEFAULT_TEMPLATE = JSON.stringify(
  { AWSTemplateFormatVersion: '2010-09-09', Resources: { Fila: { Type: 'AWS::SQS::Queue', Properties: { QueueName: 'fila-da-stack' } } } },
  null,
  2,
);

export function cloudFormationService(ctx: CatalogContext): CatalogService {
  const cfn = () => ctx.client(CloudFormationClient);
  const stacks = async () =>
    paginate(async (NextToken) => {
      const page = await cfn().send(new DescribeStacksCommand({ NextToken }));
      return { items: page.Stacks, next: page.NextToken };
    });

  const templateOf = async (name: string) => (await cfn().send(new GetTemplateCommand({ StackName: name }))).TemplateBody ?? '';

  return {
    id: 'cloudformation',
    name: 'CloudFormation',
    description: 'Infraestrutura como código',
    category: 'Gerenciamento e governança',
    notes:
      'O emulador cria de verdade os recursos da stack nos serviços emulados. Na restauração, as stacks são recriadas logo depois do IAM, e os recursos criados por elas não são salvos à parte.',
    types: [
      {
        key: 'stack',
        label: 'Stacks',
        singular: 'stack',
        columns: [
          { key: 'description', label: 'Descrição' },
          { key: 'reason', label: 'Motivo do status' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          return (await stacks()).map((s) => ({
            id: s.StackName!,
            name: s.StackName!,
            status: status(s.StackStatus),
            attrs: {
              description: s.Description ?? null,
              reason: s.StackStatusReason ?? null,
              createdAt: iso(s.CreationTime),
              parameters: (s.Parameters ?? []).map((p) => `${p.ParameterKey}=${p.ParameterValue}`).join('\n') || null,
              outputs: (s.Outputs ?? []).map((o) => `${o.OutputKey}=${o.OutputValue}`).join(', ') || null,
            },
          }));
        },
        async describe(id) {
          return (await stacks()).find((s) => s.StackName === id) ?? null;
        },
        create: {
          label: 'Criar stack',
          fields: [
            { name: 'name', label: 'Nome da stack', type: 'text', required: true, pattern: '^[a-zA-Z][a-zA-Z0-9-]{0,127}$' },
            { name: 'template', label: 'Template (JSON ou YAML)', type: 'code', required: true, rows: 16, default: DEFAULT_TEMPLATE },
            { name: 'parameters', label: 'Parâmetros', type: 'list', description: 'Um por linha: Chave=Valor.' },
          ],
          async run(input) {
            await cfn().send(
              new CreateStackCommand({
                StackName: str(input, 'name'),
                TemplateBody: str(input, 'template'),
                Parameters: parseParameters(list(input, 'parameters')),
                Capabilities: [...CAPABILITIES],
              }),
            );
            return { id: str(input, 'name') };
          },
        },
        remove: {
          label: 'Excluir stack',
          warning: 'Os recursos criados pela stack também serão excluídos.',
          async run(id) {
            await cfn().send(new DeleteStackCommand({ StackName: id }));
          },
        },
        actions: [
          {
            key: 'GetTemplate',
            label: 'Ver template',
            fields: [],
            async run(id) {
              return { kind: 'text', text: await templateOf(id) };
            },
          },
          {
            key: 'UpdateStack',
            label: 'Atualizar stack',
            submitLabel: 'Atualizar',
            fields: [
              { name: 'template', label: 'Template (JSON ou YAML)', type: 'code', required: true, rows: 16 },
              { name: 'parameters', label: 'Parâmetros', type: 'list', description: 'Um por linha: Chave=Valor.' },
            ],
            mutates: true,
            async run(id, input) {
              await cfn().send(
                new UpdateStackCommand({
                  StackName: id,
                  TemplateBody: str(input, 'template'),
                  Parameters: parseParameters(list(input, 'parameters')),
                  Capabilities: [...CAPABILITIES],
                }),
              );
              return message('Atualização iniciada.');
            },
          },
        ],
        async persist(row): Promise<Input | null> {
          // Stacks que falharam ou estão sendo excluídas não valem ser recriadas.
          if (/FAILED|ROLLBACK_COMPLETE|DELETE/.test(row.status?.label ?? '')) return null;
          return compact({
            name: row.id,
            template: await templateOf(row.id),
            parameters: row.attrs.parameters ? String(row.attrs.parameters).split('\n') : undefined,
          });
        },
      },
      {
        key: 'resource',
        label: 'Recursos',
        singular: 'recurso',
        parent: 'stack',
        columns: [
          { key: 'logicalId', label: 'ID lógico' },
          { key: 'physicalId', label: 'ID físico' },
          { key: 'type', label: 'Tipo' },
        ],
        async list(stack) {
          const { StackResources = [] } = await cfn().send(new DescribeStackResourcesCommand({ StackName: stack }));
          return StackResources.map((r) => ({
            id: r.LogicalResourceId!,
            name: r.LogicalResourceId!,
            status: status(r.ResourceStatus),
            attrs: { logicalId: r.LogicalResourceId ?? null, physicalId: r.PhysicalResourceId ?? null, type: r.ResourceType ?? null },
          }));
        },
      },
      {
        key: 'event',
        label: 'Eventos',
        singular: 'evento',
        parent: 'stack',
        columns: [
          { key: 'time', label: 'Data e hora' },
          { key: 'logicalId', label: 'ID lógico' },
          { key: 'reason', label: 'Motivo' },
        ],
        async list(stack) {
          const { StackEvents = [] } = await cfn().send(new DescribeStackEventsCommand({ StackName: stack }));
          return StackEvents.map((e) => ({
            id: e.EventId!,
            name: e.LogicalResourceId ?? e.EventId!,
            status: status(e.ResourceStatus),
            attrs: { time: iso(e.Timestamp), logicalId: e.LogicalResourceId ?? null, reason: e.ResourceStatusReason ?? null },
          }));
        },
      },
    ],
  };
}
