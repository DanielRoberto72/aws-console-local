import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { eventsApi, type RuleTarget } from '../../api/events';
import { CodeArea, jsonError, prettyJson } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { TargetSelect } from '../../components/TargetSelect';
import { EmptyState } from '../../components/TableStates';
import { useAction } from '../../hooks/useAction';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { DEFAULT_BUS, EVENTS_BREADCRUMB, rulesHref } from './BusesPage';
import { ruleHref, RuleState } from './RulesPage';

const TARGET_ID = /^[.\-_A-Za-z0-9]{1,64}$/;

export function RuleDetailPage() {
  const [params] = useSearchParams();
  const bus = params.get('bus') ?? DEFAULT_BUS;
  const name = params.get('name') ?? '';
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([EVENTS_BREADCRUMB, { text: 'Regras', href: rulesHref(bus) }, { text: name, href: ruleHref(bus, name) }]);
  const rule = useRemote((signal) => eventsApi.rule(bus, name, signal), [bus, name]);
  const toggle = useAction();
  const [adding, setAdding] = useState(false);
  const [targetArn, setTargetArn] = useState('');
  const [targetId, setTargetId] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [toRemove, setToRemove] = useState<RuleTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (rule.error) return <LoadError error={rule.error} onRetry={rule.reload} />;
  if (!rule.data) return <Spinner size="large" />;
  const { rule: r, targets } = rule.data;
  const enabled = r.state === 'ENABLED';
  const idTaken = targets.some((t) => t.id === targetId);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={rule.reload} />
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button
                loading={toggle.running}
                onClick={() =>
                  toggle
                    .run(() => eventsApi.setEnabled(bus, name, !enabled), enabled ? 'Regra desabilitada.' : 'Regra habilitada.', 'Falha ao alterar a regra')
                    .then(rule.reload)
                }
              >
                {enabled ? 'Desabilitar' : 'Habilitar'}
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes da regra</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Status', value: <RuleState state={r.state} /> },
              { label: 'Barramento', value: bus },
              { label: 'Descrição', value: r.description || '-' },
              { label: 'ARN', value: r.arn },
              { label: 'Expressão de agendamento', value: r.scheduleExpression ?? '-' },
            ]}
          />
        </Container>
        {r.eventPattern && (
          <Container header={<Header variant="h2">Padrão de evento</Header>}>
            <CodeArea value={prettyJson(r.eventPattern)} readOnly rows={8} ariaLabel="Padrão de evento" />
          </Container>
        )}
        <ResourceTable
          title="Destinos"
          variant="container"
          resourceName="destinos"
          items={targets}
          loading={false}
          error={null}
          onRetry={rule.reload}
          trackBy="id"
          empty={<EmptyState title="Nenhum destino" subtitle="Eventos que correspondem à regra não vão para lugar nenhum." />}
          actions={([selected]) => (
            <SpaceBetween direction="horizontal" size="xs">
              <Button disabled={!selected} onClick={() => selected && setToRemove(selected)}>
                Remover
              </Button>
              <Button variant="primary" disabled={targets.length >= 5} onClick={() => setAdding(true)}>
                Adicionar destino
              </Button>
            </SpaceBetween>
          )}
          columns={[
            { id: 'id', header: 'ID', cell: (t) => t.id },
            { id: 'arn', header: 'ARN', cell: (t) => t.arn },
            { id: 'input', header: 'Entrada', cell: (t) => t.input ?? 'Evento correspondente' },
          ]}
        />
      </SpaceBetween>
      <FormModal
        visible={adding}
        title="Adicionar destino"
        submitLabel="Adicionar"
        size="medium"
        canSubmit={!!targetArn && TARGET_ID.test(targetId) && !idTaken && !jsonError(targetInput)}
        onSubmit={async () => {
          await eventsApi.addTarget(bus, name, { id: targetId, arn: targetArn, input: targetInput.trim() || null });
          notifications.success('Destino adicionado.');
          setTargetArn('');
          setTargetId('');
          setTargetInput('');
          rule.reload();
        }}
        onDismiss={() => setAdding(false)}
      >
        <FormField label="Destino" description="O painel concede à regra a permissão de entregar neste destino.">
          <TargetSelect
            value={targetArn}
            onChange={(arn) => {
              setTargetArn(arn);
              if (!targetId) setTargetId(arn.slice(arn.lastIndexOf(':') + 1).replace(/[^.\-_A-Za-z0-9]/g, '-').slice(0, 64));
            }}
          />
        </FormField>
        <FormField label="ID do destino" errorText={idTaken ? 'Já existe um destino com esse ID.' : null}>
          <Input value={targetId} onChange={({ detail }) => setTargetId(detail.value)} />
        </FormField>
        <FormField label="Entrada fixa (JSON) - opcional" description="Em branco, o destino recebe o evento correspondente." errorText={jsonError(targetInput)} stretch>
          <CodeArea value={targetInput} onChange={setTargetInput} rows={4} ariaLabel="Entrada do destino" />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toRemove !== null}
        title="Remover destino"
        actionLabel="Remover"
        confirmationText="remover"
        description={<>O destino <b>{toRemove?.id}</b> deixará de receber eventos desta regra.</>}
        onConfirm={async () => {
          await eventsApi.removeTargets(bus, name, [toRemove!.id]);
          notifications.success('Destino removido.');
          rule.reload();
        }}
        onDismiss={() => setToRemove(null)}
      />
      <DeleteModal
        visible={deleting}
        title="Excluir regra"
        confirmationText="excluir"
        description={<>A regra <b>{name}</b> e seus destinos serão excluídos.</>}
        onConfirm={async () => {
          await eventsApi.deleteRule(bus, name);
          notifications.success(`Regra "${name}" excluída.`);
          navigate(rulesHref(bus));
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}
