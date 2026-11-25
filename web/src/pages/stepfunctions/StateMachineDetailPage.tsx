import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Tabs from '@cloudscape-design/components/tabs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sfnApi } from '../../api/stepfunctions';
import { CodeArea, jsonError, prettyJson } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useAction } from '../../hooks/useAction';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { machineHref, machineTypeLabel, SFN_BREADCRUMB } from './StateMachinesPage';
import { ExecutionStatus } from './status';

export const executionHref = (machine: string, arn: string) =>
  `/stepfunctions/execution?machine=${encodeURIComponent(machine)}&arn=${encodeURIComponent(arn)}`;

const EXECUTION_NAME = /^[a-zA-Z0-9_-]{0,80}$/;
const RUNNING_POLL_MS = 2_000;

export function StateMachineDetailPage() {
  const name = useParams().name!;
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  useBreadcrumbs([SFN_BREADCRUMB, { text: 'Máquinas de estado', href: '/stepfunctions/state-machines' }, { text: name, href: machineHref(name) }]);
  const machine = useRemote((signal) => sfnApi.get(name, signal), [name]);
  const executions = useRemote((signal) => sfnApi.executions(name, signal), [name]);
  const save = useAction();
  const [definition, setDefinition] = useState('');
  const [starting, setStarting] = useState(false);
  const [input, setInput] = useState('{\n  "comentario": "Olá"\n}');
  const [executionName, setExecutionName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (machine.data) setDefinition(prettyJson(machine.data.definition));
  }, [machine.data]);
  usePolling(executions.reload, RUNNING_POLL_MS, executions.data?.executions.some((e) => e.status === 'RUNNING') ?? false);

  if (machine.error) return <LoadError error={machine.error} onRetry={machine.reload} />;
  if (!machine.data) return <Spinner size="large" />;
  const m = machine.data;
  const definitionError = jsonError(definition, true);
  const dirty = definition !== prettyJson(m.definition);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button variant="primary" onClick={() => setStarting(true)}>
                Iniciar execução
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Tipo', value: machineTypeLabel(m.type) },
              { label: 'Status', value: m.status ?? '-' },
              { label: 'Criação', value: formatDate(m.createdAt) },
              { label: 'ARN', value: m.arn },
              { label: 'Papel do IAM', value: m.roleArn },
            ]}
          />
        </Container>
        <Tabs
          tabs={[
            {
              id: 'executions',
              label: 'Execuções',
              content: (
                <ResourceTable
                  title="Execuções"
                  variant="container"
                  resourceName="execuções"
                  items={executions.data?.executions}
                  loading={executions.loading}
                  error={executions.error}
                  onRetry={executions.reload}
                  trackBy="arn"
                  selectionType="none"
                  empty={<EmptyState title="Nenhuma execução" action={<Button onClick={() => setStarting(true)}>Iniciar execução</Button>} />}
                  actions={() => <Button iconName="refresh" ariaLabel="Atualizar" onClick={executions.reload} />}
                  columns={[
                    { id: 'name', header: 'Nome', cell: (e) => <Link href={executionHref(name, e.arn)} onFollow={follow}>{e.name}</Link> },
                    { id: 'status', header: 'Status', cell: (e) => <ExecutionStatus status={e.status} /> },
                    { id: 'started', header: 'Início', sortingField: 'startedAt', cell: (e) => formatDate(e.startedAt) },
                    { id: 'stopped', header: 'Fim', cell: (e) => formatDate(e.stoppedAt) },
                  ]}
                />
              ),
            },
            {
              id: 'definition',
              label: 'Definição',
              content: (
                <Container
                  header={
                    <Header
                      variant="h2"
                      actions={
                        <Button
                          variant="primary"
                          disabled={!dirty || !!definitionError}
                          loading={save.running}
                          onClick={() => save.run(() => sfnApi.update(name, definition), 'Definição salva.', 'Falha ao salvar a definição').then(machine.reload)}
                        >
                          Salvar
                        </Button>
                      }
                    >
                      Definição (Amazon States Language)
                    </Header>
                  }
                >
                  <FormField errorText={definitionError} stretch>
                    <CodeArea value={definition} onChange={setDefinition} rows={24} ariaLabel="Definição da máquina de estado" />
                  </FormField>
                </Container>
              ),
            },
          ]}
        />
      </SpaceBetween>
      <FormModal
        visible={starting}
        title="Iniciar execução"
        submitLabel="Iniciar execução"
        size="medium"
        canSubmit={!jsonError(input, true) && EXECUTION_NAME.test(executionName)}
        onSubmit={async () => {
          const { executionArn } = await sfnApi.start(name, input, executionName || undefined);
          notifications.success('Execução iniciada.');
          setExecutionName('');
          navigate(executionHref(name, executionArn));
        }}
        onDismiss={() => setStarting(false)}
      >
        <FormField label="Nome - opcional" description="Em branco, a AWS gera um identificador.">
          <Input value={executionName} onChange={({ detail }) => setExecutionName(detail.value)} />
        </FormField>
        <FormField label="Entrada (JSON)" errorText={jsonError(input, true)} stretch>
          <CodeArea value={input} onChange={setInput} rows={8} ariaLabel="Entrada da execução" />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={deleting}
        title="Excluir máquina de estado"
        confirmationText="excluir"
        description={<>A máquina de estado <b>{name}</b> será excluída.</>}
        onConfirm={async () => {
          await sfnApi.remove(name);
          notifications.success(`Máquina de estado "${name}" excluída.`);
          navigate('/stepfunctions/state-machines');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}
