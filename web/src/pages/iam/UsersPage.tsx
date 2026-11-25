import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { iamApi, type UserSummary } from '../../api/iam';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { IAM_BREADCRUMB, userHref } from './iamLinks';

const activeKey = (user: UserSummary) => user.accessKeys.find((k) => k.status === 'Active');

export function UsersPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Usuários', href: '/iam/users' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const users = useRemote((signal) => iamApi.listUsers(signal), []);
  const [toDelete, setToDelete] = useState<UserSummary | null>(null);
  const create = (
    <Button variant="primary" href="/iam/create-user" onFollow={follow}>
      Criar usuário
    </Button>
  );

  return (
    <>
      <ResourceTable
        title="Usuários"
        description="Um usuário do IAM é uma identidade com credenciais de longo prazo usada para interagir com a AWS."
        resourceName="usuários"
        items={users.data?.users}
        loading={users.loading}
        error={users.error}
        onRetry={users.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum usuário" action={create} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={users.reload} />
            <Button disabled={!selected || selected.builtIn} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            {create}
          </SpaceBetween>
        )}
        columns={[
          {
            id: 'name',
            header: 'Nome do usuário',
            sortingField: 'name',
            cell: (u) => (
              <Link href={userHref(u.name)} onFollow={follow}>
                {u.name}
              </Link>
            ),
          },
          { id: 'path', header: 'Caminho', sortingField: 'path', cell: (u) => u.path },
          { id: 'groups', header: 'Grupos', cell: (u) => u.groups.length },
          { id: 'policies', header: 'Políticas', sortingField: 'policies', cell: (u) => u.policies },
          { id: 'key', header: 'ID da chave de acesso', cell: (u) => activeKey(u)?.id ?? '-' },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (u) => (u.builtIn ? 'Embutido no emulador' : formatDate(u.createdAt)) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir usuário"
        confirmationText={toDelete?.name ?? ''}
        description={
          <>
            O usuário <b>{toDelete?.name}</b> será excluído junto com suas chaves de acesso e políticas em linha, e removido
            dos grupos. Para confirmar, digite o nome do usuário.
          </>
        }
        onConfirm={async () => {
          await iamApi.deleteUser(toDelete!.name);
          notifications.success(`Usuário "${toDelete!.name}" excluído.`);
          users.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
