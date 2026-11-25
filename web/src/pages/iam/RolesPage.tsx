import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { iamApi, type RoleSummary } from '../../api/iam';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { IAM_BREADCRUMB, roleHref } from './iamLinks';

export function RolesPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Funções', href: '/iam/roles' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const roles = useRemote((signal) => iamApi.listRoles(signal), []);
  const [toDelete, setToDelete] = useState<RoleSummary | null>(null);
  const create = (
    <Button variant="primary" href="/iam/create-role" onFollow={follow}>
      Criar função
    </Button>
  );

  return (
    <>
      <ResourceTable
        title="Funções"
        description="Uma função do IAM é uma identidade com permissões que pode ser assumida por serviços, contas ou usuários confiáveis, com credenciais temporárias."
        resourceName="funções"
        items={roles.data?.roles}
        loading={roles.loading}
        error={roles.error}
        onRetry={roles.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhuma função" action={create} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={roles.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            {create}
          </SpaceBetween>
        )}
        columns={[
          {
            id: 'name',
            header: 'Nome da função',
            sortingField: 'name',
            cell: (r) => (
              <Link href={roleHref(r.name)} onFollow={follow}>
                {r.name}
              </Link>
            ),
          },
          { id: 'trusted', header: 'Entidades confiáveis', cell: (r) => r.trustedEntities.join(', ') || '-' },
          { id: 'description', header: 'Descrição', cell: (r) => r.description || '-' },
          { id: 'used', header: 'Última atividade', sortingField: 'lastUsedAt', cell: (r) => formatDate(r.lastUsedAt) },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (r) => formatDate(r.createdAt) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir função"
        confirmationText={toDelete?.name ?? ''}
        description={
          <>
            A função <b>{toDelete?.name}</b> será excluída. Serviços que a usam (funções Lambda, agendamentos, máquinas de
            estado) deixam de conseguir assumi-la. Para confirmar, digite o nome da função.
          </>
        }
        onConfirm={async () => {
          await iamApi.deleteRole(toDelete!.name);
          notifications.success(`Função "${toDelete!.name}" excluída.`);
          roles.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
