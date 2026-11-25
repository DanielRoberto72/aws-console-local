import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { schedulerApi, type ScheduleSummary } from '../../api/scheduler';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useAction } from '../../hooks/useAction';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const SCHEDULER_BREADCRUMB = { text: 'EventBridge Scheduler', href: '/scheduler/schedules' };
export const scheduleHref = (group: string, name: string) => `/scheduler/schedules/${encodeURIComponent(group)}/${encodeURIComponent(name)}`;

export const ScheduleState = ({ state }: { state: string }) =>
  state === 'ENABLED' ? <StatusIndicator>Habilitado</StatusIndicator> : <StatusIndicator type="stopped">Desabilitado</StatusIndicator>;

/** Linhas da tabela identificadas por grupo + nome, que juntos são únicos. */
type Row = ScheduleSummary & { id: string };

export function SchedulesPage() {
  useBreadcrumbs([SCHEDULER_BREADCRUMB, { text: 'Agendamentos', href: '/scheduler/schedules' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const toggle = useAction();
  const schedules = useRemote((signal) => schedulerApi.schedules(signal), []);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const rows: Row[] | undefined = schedules.data?.schedules.map((s) => ({ ...s, id: `${s.group}/${s.name}` }));

  return (
    <>
      <ResourceTable
        title="Agendamentos"
        description="Invoque destinos uma vez ou de forma recorrente."
        resourceName="agendamentos"
        items={rows}
        loading={schedules.loading}
        error={schedules.error}
        onRetry={schedules.reload}
        trackBy="id"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum agendamento" action={<Button onClick={() => navigate('/scheduler/create-schedule')}>Criar agendamento</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={schedules.reload} />
            <Button
              disabled={!selected}
              loading={toggle.running}
              onClick={() =>
                selected &&
                toggle
                  .run(
                    () => schedulerApi.setEnabled(selected.group, selected.name, selected.state !== 'ENABLED'),
                    selected.state === 'ENABLED' ? 'Agendamento desabilitado.' : 'Agendamento habilitado.',
                    'Falha ao alterar o agendamento',
                  )
                  .then(schedules.reload)
              }
            >
              {selected?.state === 'ENABLED' ? 'Desabilitar' : 'Habilitar'}
            </Button>
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => navigate('/scheduler/create-schedule')}>
              Criar agendamento
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', sortingField: 'name', cell: (s) => <Link href={scheduleHref(s.group, s.name)} onFollow={follow}>{s.name}</Link> },
          { id: 'group', header: 'Grupo', sortingField: 'group', cell: (s) => s.group },
          { id: 'state', header: 'Status', cell: (s) => <ScheduleState state={s.state} /> },
          { id: 'target', header: 'Destino', cell: (s) => s.targetArn },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (s) => formatDate(s.createdAt) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir agendamento"
        confirmationText="excluir"
        description={<>O agendamento <b>{toDelete?.name}</b> será excluído.</>}
        onConfirm={async () => {
          await schedulerApi.remove(toDelete!.group, toDelete!.name);
          notifications.success(`Agendamento "${toDelete!.name}" excluído.`);
          schedules.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
