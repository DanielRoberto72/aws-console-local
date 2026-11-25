import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { iamApi, type GroupSummary } from '../../api/iam';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { groupHref, IAM_BREADCRUMB } from './iamLinks';

export function GroupsPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Grupos de usuários', href: '/iam/groups' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const groups = useRemote((signal) => iamApi.listGroups(signal), []);
  const [toDelete, setToDelete] = useState<GroupSummary | null>(null);
  const create = (
    <Button variant="primary" href="/iam/create-group" onFollow={follow}>
      Criar grupo
    </Button>
  );

  return (
    <>
      <ResourceTable
        title="Grupos de usuários"
        description="Um grupo de usuários reúne usuários do IAM. Use grupos para dar as mesmas permissões a vários usuários."
        resourceName="grupos"
        items={groups.data?.groups}
        loading={groups.loading}
        error={groups.error}
        onRetry={groups.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum grupo de usuários" action={create} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={groups.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            {create}
          </SpaceBetween>
        )}
        columns={[
          {
            id: 'name',
            header: 'Nome do grupo',
            sortingField: 'name',
            cell: (g) => (
              <Link href={groupHref(g.name)} onFollow={follow}>
                {g.name}
              </Link>
            ),
          },
          { id: 'users', header: 'Usuários', sortingField: 'users', cell: (g) => g.users },
          { id: 'policies', header: 'Permissões', sortingField: 'policies', cell: (g) => (g.policies ? `${g.policies} ${g.policies === 1 ? 'política' : 'políticas'}` : 'Não definidas') },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (g) => formatDate(g.createdAt) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir grupo"
        confirmationText={toDelete?.name ?? ''}
        description={
          <>
            O grupo <b>{toDelete?.name}</b> será excluído. Os usuários saem do grupo e perdem as permissões dele, mas não
            são excluídos. Para confirmar, digite o nome do grupo.
          </>
        }
        onConfirm={async () => {
          await iamApi.deleteGroup(toDelete!.name);
          notifications.success(`Grupo "${toDelete!.name}" excluído.`);
          groups.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
