import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Grid from '@cloudscape-design/components/grid';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { overviewApi, type SyncStatus } from '../../api/overview';
import { LoadError } from '../../components/ErrorAlert';
import { formatBytes, formatDate, formatNumber } from '../../components/format';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { CATEGORIES } from '../../layout/services';
import { useServiceDirectory } from '../../layout/serviceDirectory';
import { ActivityTable } from '../activity/ActivityTable';
import { EmulatorVersion } from '../emulator/EmulatorVersion';
import { FidelityBadge } from '../emulator/FidelityBadge';
import { useFidelity } from '../../layout/fidelity';

const OVERVIEW_POLL_MS = 10_000;

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  function: 'Funções',
  'log-group': 'Grupos de logs',
  topic: 'Tópicos',
  subscription: 'Assinaturas',
  secret: 'Segredos',
  parameter: 'Parâmetros',
  bus: 'Barramentos de eventos',
  rule: 'Regras',
  schedule: 'Agendamentos',
  group: 'Grupos de agendamento',
  'state-machine': 'Máquinas de estado',
  bucket: 'Buckets de vetores',
  index: 'Índices de vetores',
  role: 'Funções',
  user: 'Usuários',
  policy: 'Políticas gerenciadas pelo cliente',
};

/** O mesmo tipo pode ter nomes diferentes por serviço (ex.: grupo de agendamento e grupo de usuários). */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  'iam:group': 'Grupos de usuários',
};

const resourceTypeLabel = (service: string, type: string) =>
  SERVICE_TYPE_LABELS[`${service}:${type}`] ?? RESOURCE_TYPE_LABELS[type] ?? type;

function EmulatorState({ sync }: { sync: SyncStatus }) {
  if (sync.emulator === 'offline') {
    return <StatusIndicator type="error">Offline{sync.emulatorReason ? ` (${sync.emulatorReason})` : ''}</StatusIndicator>;
  }
  if (sync.emulator === 'unknown') return <StatusIndicator type="pending">Verificando</StatusIndicator>;
  if (sync.phase === 'restoring') return <StatusIndicator type="in-progress">Online, restaurando dados salvos</StatusIndicator>;
  return <StatusIndicator type="success">Online</StatusIndicator>;
}

export function ConsoleHome() {
  useBreadcrumbs([{ text: 'Console', href: '/' }]);
  const follow = useFollow();
  const directory = useServiceDirectory();
  const notifications = useNotifications();
  const fidelity = useFidelity();
  const overview = useRemote((signal) => overviewApi.overview(signal), []);
  usePolling(overview.reload, OVERVIEW_POLL_MS);
  const data = overview.data;

  const syncNow = async () => {
    try {
      await overviewApi.syncNow();
      notifications.success('Sincronização solicitada.');
      setTimeout(overview.reload, 1_500);
    } catch (err) {
      notifications.failure('Falha ao sincronizar', err);
    }
  };

  return (
    <ContentLayout header={<Header variant="h1" description="Recursos do AWS Emulator rodando na sua máquina">Página inicial do console</Header>}>
      {overview.error && !data ? (
        <LoadError error={overview.error} onRetry={overview.reload} />
      ) : !data ? (
        <Spinner size="large" />
      ) : (
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }, { colspan: { default: 12, m: 6 } }, { colspan: { default: 12, m: 6 } }, { colspan: 12 }]}>
          <Container header={<Header variant="h2" description="Contagens do último snapshot salvo no banco">Uso</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <KeyValuePairs
                items={[
                  { label: 'Buckets S3', value: formatNumber(data.s3.buckets) },
                  { label: 'Objetos', value: formatNumber(data.s3.objects) },
                  { label: 'Armazenamento', value: formatBytes(data.s3.bytes) },
                ]}
              />
              <KeyValuePairs
                items={[
                  { label: 'Tabelas DynamoDB', value: formatNumber(data.dynamodb.tables) },
                  { label: 'Itens', value: formatNumber(data.dynamodb.items) },
                ]}
              />
              <KeyValuePairs
                items={[
                  { label: 'Filas SQS', value: formatNumber(data.sqs.queues) },
                  { label: 'Mensagens disponíveis', value: formatNumber(data.sqs.messages) },
                ]}
              />
            </ColumnLayout>
          </Container>

          <Container
            header={
              <Header variant="h2" actions={<Button iconName="refresh" onClick={syncNow} ariaLabel="Sincronizar agora" />}>
                Emulador e persistência
              </Header>
            }
          >
            <SpaceBetween size="s">
              <KeyValuePairs
                items={[
                  { label: 'Estado', value: <EmulatorState sync={data.sync} /> },
                  { label: 'Último snapshot', value: formatDate(data.sync.lastSnapshotAt) },
                  { label: 'Última restauração', value: formatDate(data.sync.lastRestoreAt) },
                ]}
              />
              {data.sync.lastError && <StatusIndicator type="warning">{data.sync.lastError}</StatusIndicator>}
              <EmulatorVersion />
            </SpaceBetween>
          </Container>

          <Table
            header={<Header variant="h2">Buckets por armazenamento</Header>}
            variant="container"
            items={data.topBuckets}
            columnDefinitions={[
              { id: 'name', header: 'Bucket', cell: (b) => <Link href={`/s3/buckets/${encodeURIComponent(b.name)}`} onFollow={follow}>{b.name}</Link> },
              { id: 'objects', header: 'Objetos', cell: (b) => formatNumber(b.objects) },
              { id: 'bytes', header: 'Tamanho', cell: (b) => formatBytes(b.bytes) },
            ]}
            empty={<Box textAlign="center" color="inherit">Nenhum bucket</Box>}
          />

          <Table
            header={<Header variant="h2">Tabelas por quantidade de itens</Header>}
            variant="container"
            items={data.topTables}
            columnDefinitions={[
              { id: 'name', header: 'Tabela', cell: (t) => <Link href={`/dynamodb/tables/${encodeURIComponent(t.name)}`} onFollow={follow}>{t.name}</Link> },
              { id: 'items', header: 'Itens', cell: (t) => formatNumber(t.items) },
            ]}
            empty={<Box textAlign="center" color="inherit">Nenhuma tabela</Box>}
          />

          <SpaceBetween size="l">
            <Table
              header={<Header variant="h2" description="Recursos dos demais serviços, no último snapshot">Outros recursos salvos</Header>}
              variant="container"
              items={data.resources}
              columnDefinitions={[
                { id: 'service', header: 'Serviço', cell: (r) => directory.serviceName(r.service) },
                { id: 'type', header: 'Tipo', cell: (r) => directory.typeMeta(r.service, r.type)?.label ?? resourceTypeLabel(r.service, r.type) },
                { id: 'count', header: 'Quantidade', cell: (r) => formatNumber(r.count) },
              ]}
              empty={<Box textAlign="center" color="inherit">Nenhum recurso</Box>}
            />
            <Container
              header={
                <Header variant="h2" description="O selo indica a fidelidade do serviço no emulador; o painel lateral de cada serviço detalha o que falha">
                  Serviços
                </Header>
              }
            >
              <ColumnLayout columns={4} variant="text-grid">
                {CATEGORIES.map((category) => (
                  <SpaceBetween key={category} size="xs">
                    <Box variant="awsui-key-label">{category}</Box>
                    {directory.services.filter((s) => s.category === category).map((service) => (
                      <div key={service.id}>
                        <SpaceBetween size="xxs" direction="horizontal" alignItems="center">
                          <Link href={service.links[0]!.href} onFollow={follow}>
                            {service.name}
                          </Link>
                          <FidelityBadge summary={fidelity.summary(service.id)} />
                        </SpaceBetween>
                        <Box variant="small" display="block">
                          {service.description}
                        </Box>
                      </div>
                    ))}
                  </SpaceBetween>
                ))}
              </ColumnLayout>
            </Container>
            <ActivityTable limit={8} title="Atividade recente" variant="container" />
          </SpaceBetween>
        </Grid>
      )}
    </ContentLayout>
  );
}
