import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Tabs from '@cloudscape-design/components/tabs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { iamApi, type GroupDetail, type UserSummary } from '../../api/iam';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { FormModal } from '../../components/FormModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useAction } from '../../hooks/useAction';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { groupHref, IAM_BREADCRUMB, userHref } from './iamLinks';
import { UserPicker } from './IdentityPickers';
import { PermissionsPanel } from './PermissionsPanel';

export function GroupDetailPage() {
  const name = useParams().name!;
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Grupos de usuários', href: '/iam/groups' }, { text: name, href: groupHref(name) }]);
  const group = useRemote((signal) => iamApi.group(name, signal), [name]);
  const [deleting, setDeleting] = useState(false);

  if (group.error) return <LoadError error={group.error} onRetry={group.reload} />;
  if (!group.data) return <Spinner size="large" />;
  const data = group.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={group.reload} />
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Resumo</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Nome do grupo', value: name },
              { label: 'Criação', value: formatDate(data.createdAt) },
              { label: 'ARN', value: <CopyToClipboard variant="inline" textToCopy={data.arn} copySuccessText="ARN copiado" copyErrorText="Falha ao copiar" /> },
            ]}
          />
        </Container>
        <Tabs
          tabs={[
            { id: 'users', label: `Usuários (${data.users.length})`, content: <GroupUsers group={data} onChanged={group.reload} /> },
            { id: 'permissions', label: 'Permissões', content: <PermissionsPanel kind="groups" name={name} policies={data} onChanged={group.reload} /> },
          ]}
        />
      </SpaceBetween>
      <DeleteModal
        visible={deleting}
        title="Excluir grupo"
        confirmationText={name}
        description={<>O grupo <b>{name}</b> será excluído e os usuários sairão dele. Para confirmar, digite o nome do grupo.</>}
        onConfirm={async () => {
          await iamApi.deleteGroup(name);
          notifications.success(`Grupo "${name}" excluído.`);
          navigate('/iam/groups');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}

function GroupUsers({ group, onChanged }: { group: GroupDetail; onChanged: () => void }) {
  const follow = useFollow();
  const notifications = useNotifications();
  const action = useAction();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<UserSummary[]>([]);

  return (
    <>
      <ResourceTable
        title="Usuários neste grupo"
        variant="container"
        resourceName="usuários"
        items={group.users}
        loading={false}
        error={null}
        onRetry={onChanged}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum usuário no grupo" action={<Button onClick={() => setAdding(true)}>Adicionar usuários</Button>} />}
        actions={([user]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              disabled={!user}
              loading={action.running}
              onClick={async () => {
                if (!user) return;
                const ok = await action.run(
                  () => iamApi.removeUserFromGroupOf(group.name, user.name),
                  `"${user.name}" removido do grupo.`,
                  'Não foi possível remover o usuário',
                );
                if (ok) onChanged();
              }}
            >
              Remover
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Adicionar usuários
            </Button>
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
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (u) => formatDate(u.createdAt) },
        ]}
      />
      <FormModal
        visible={adding}
        title={`Adicionar usuários a ${group.name}`}
        submitLabel="Adicionar usuários"
        size="large"
        canSubmit={selected.length > 0}
        onSubmit={async () => {
          await iamApi.addUsersToGroup(group.name, selected.map((u) => u.name));
          notifications.success(`${selected.length === 1 ? 'Usuário adicionado' : `${selected.length} usuários adicionados`} ao grupo.`);
          setSelected([]);
          onChanged();
        }}
        onDismiss={() => setAdding(false)}
      >
        {adding && <UserPicker title="Outros usuários" selected={selected} onChange={setSelected} exclude={group.users.map((u) => u.name)} />}
      </FormModal>
    </>
  );
}
