import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sfnApi, type StateMachineSummary } from '../../api/stepfunctions';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const SFN_BREADCRUMB = { text: 'Step Functions', href: '/stepfunctions/state-machines' };
export const machineHref = (name: string) => `/stepfunctions/state-machines/${encodeURIComponent(name)}`;
export const machineTypeLabel = (type: string) => (type === 'EXPRESS' ? 'Expressa' : 'Padrão');

export function StateMachinesPage() {
  useBreadcrumbs([SFN_BREADCRUMB, { text: 'Máquinas de estado', href: '/stepfunctions/state-machines' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const machines = useRemote((signal) => sfnApi.list(signal), []);
  const [toDelete, setToDelete] = useState<StateMachineSummary | null>(null);

  return (
    <>
      <ResourceTable
        title="Máquinas de estado"
        resourceName="máquinas de estado"
        items={machines.data?.stateMachines}
        loading={machines.loading}
        error={machines.error}
        onRetry={machines.reload}
        trackBy="arn"
        defaultSortField="name"
        empty={<EmptyState title="Nenhuma máquina de estado" action={<Button onClick={() => navigate('/stepfunctions/create')}>Criar máquina de estado</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={machines.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => navigate('/stepfunctions/create')}>
              Criar máquina de estado
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', sortingField: 'name', cell: (m) => <Link href={machineHref(m.name)} onFollow={follow}>{m.name}</Link> },
          { id: 'type', header: 'Tipo', sortingField: 'type', cell: (m) => machineTypeLabel(m.type) },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (m) => formatDate(m.createdAt) },
          { id: 'arn', header: 'ARN', cell: (m) => m.arn },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir máquina de estado"
        confirmationText="excluir"
        description={<>A máquina de estado <b>{toDelete?.name}</b> será excluída.</>}
        onConfirm={async () => {
          await sfnApi.remove(toDelete!.name);
          notifications.success(`Máquina de estado "${toDelete!.name}" excluída.`);
          machines.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
