import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useSearchParams } from 'react-router-dom';
import { sfnApi } from '../../api/stepfunctions';
import { CodeArea, prettyJson } from '../../components/CodeArea';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useAction } from '../../hooks/useAction';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { executionHref } from './StateMachineDetailPage';
import { machineHref, SFN_BREADCRUMB } from './StateMachinesPage';
import { ExecutionStatus } from './status';

const RUNNING_POLL_MS = 1_500;

export function ExecutionPage() {
  const [params] = useSearchParams();
  const machine = params.get('machine') ?? '';
  const arn = params.get('arn') ?? '';
  const executionName = arn.slice(arn.lastIndexOf(':') + 1);
  useBreadcrumbs([
    SFN_BREADCRUMB,
    { text: 'Máquinas de estado', href: '/stepfunctions/state-machines' },
    { text: machine, href: machineHref(machine) },
    { text: executionName, href: executionHref(machine, arn) },
  ]);
  const execution = useRemote((signal) => sfnApi.execution(arn, signal), [arn]);
  const stop = useAction();
  usePolling(execution.reload, RUNNING_POLL_MS, execution.data?.status === 'RUNNING');

  if (execution.error) return <LoadError error={execution.error} onRetry={execution.reload} />;
  if (!execution.data) return <Spinner size="large" />;
  const e = execution.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={execution.reload} />
              <Button
                disabled={e.status !== 'RUNNING'}
                loading={stop.running}
                onClick={() => stop.run(() => sfnApi.stop(arn), 'Execução interrompida.', 'Falha ao interromper').then(execution.reload)}
              >
                Interromper execução
              </Button>
            </SpaceBetween>
          }
        >
          {executionName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Status', value: <ExecutionStatus status={e.status} /> },
              { label: 'Início', value: formatDate(e.startedAt) },
              { label: 'Fim', value: formatDate(e.stoppedAt) },
              { label: 'ARN da execução', value: e.arn },
            ]}
          />
        </Container>
        {e.error && (
          <Alert type="error" header={e.error}>
            {e.cause}
          </Alert>
        )}
        <ColumnLayout columns={2}>
          <Container header={<Header variant="h2">Entrada</Header>}>
            <CodeArea value={prettyJson(e.input)} readOnly rows={10} ariaLabel="Entrada da execução" />
          </Container>
          <Container header={<Header variant="h2">Saída</Header>}>
            <CodeArea value={prettyJson(e.output) || '(sem saída)'} readOnly rows={10} ariaLabel="Saída da execução" />
          </Container>
        </ColumnLayout>
        <ResourceTable
          title="Histórico de eventos"
          variant="container"
          resourceName="eventos"
          items={e.events.map((ev) => ({ ...ev, key: String(ev.id) }))}
          loading={false}
          error={null}
          onRetry={execution.reload}
          trackBy="key"
          selectionType="none"
          empty={<EmptyState title="Nenhum evento" />}
          actions={() => null}
          columns={[
            { id: 'id', header: 'ID', width: 70, cell: (ev) => ev.id },
            { id: 'type', header: 'Tipo', cell: (ev) => ev.type },
            { id: 'timestamp', header: 'Carimbo de data/hora', cell: (ev) => formatDate(ev.timestamp) },
            { id: 'detail', header: 'Detalhe', cell: (ev) => (ev.detail ? <pre className="log-output">{JSON.stringify(ev.detail)}</pre> : '-') },
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
