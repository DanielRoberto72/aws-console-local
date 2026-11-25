import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Tabs from '@cloudscape-design/components/tabs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { iamApi, type AccessKey, type GroupSummary, type UserDetail } from '../../api/iam';
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
import { GroupPicker } from './IdentityPickers';
import { PermissionsPanel } from './PermissionsPanel';

/** A AWS permite no máximo duas chaves de acesso por usuário. */
const MAX_ACCESS_KEYS = 2;

export function UserDetailPage() {
  const name = useParams().name!;
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Usuários', href: '/iam/users' }, { text: name, href: userHref(name) }]);
  const user = useRemote((signal) => iamApi.user(name, signal), [name]);
  const [deleting, setDeleting] = useState(false);

  if (user.error) return <LoadError error={user.error} onRetry={user.reload} />;
  if (!user.data) return <Spinner size="large" />;
  const data = user.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={user.reload} />
              <Button disabled={data.builtIn} onClick={() => setDeleting(true)}>
                Excluir
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {data.builtIn && (
          <Alert type="info">
            Este é o usuário embutido do emulador: todas as chamadas são feitas como ele. Ele não pode ser excluído e não é
            salvo no banco.
          </Alert>
        )}
        <Container header={<Header variant="h2">Resumo</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'ARN', value: <CopyToClipboard variant="inline" textToCopy={data.arn} copySuccessText="ARN copiado" copyErrorText="Falha ao copiar" /> },
              { label: 'Criação', value: data.builtIn ? 'Embutido no emulador' : formatDate(data.createdAt) },
              { label: 'Caminho', value: data.path },
              { label: 'ID do usuário', value: data.id },
              { label: 'Grupos', value: data.groups.length },
              { label: 'Chaves de acesso', value: data.accessKeys.length },
            ]}
          />
        </Container>
        <Tabs
          tabs={[
            { id: 'permissions', label: 'Permissões', content: <PermissionsPanel kind="users" name={name} policies={data} onChanged={user.reload} /> },
            { id: 'groups', label: `Grupos (${data.groups.length})`, content: <UserGroups user={data} onChanged={user.reload} /> },
            { id: 'credentials', label: 'Credenciais de segurança', content: <AccessKeys user={data} onChanged={user.reload} /> },
          ]}
        />
      </SpaceBetween>
      <DeleteModal
        visible={deleting}
        title="Excluir usuário"
        confirmationText={name}
        description={<>O usuário <b>{name}</b> será excluído junto com suas chaves de acesso e políticas em linha. Para confirmar, digite o nome do usuário.</>}
        onConfirm={async () => {
          await iamApi.deleteUser(name);
          notifications.success(`Usuário "${name}" excluído.`);
          navigate('/iam/users');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}

function UserGroups({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const follow = useFollow();
  const notifications = useNotifications();
  const action = useAction();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<GroupSummary[]>([]);
  const items = user.groups.map((name) => ({ name }));

  return (
    <>
      <ResourceTable
        title="Associação a grupos de usuários"
        variant="container"
        resourceName="grupos"
        items={items}
        loading={false}
        error={null}
        onRetry={onChanged}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="O usuário não está em nenhum grupo" action={<Button onClick={() => setAdding(true)}>Adicionar usuário a grupos</Button>} />}
        actions={([group]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              disabled={!group}
              loading={action.running}
              onClick={async () => {
                if (!group) return;
                const ok = await action.run(
                  () => iamApi.removeUserFromGroup(user.name, group.name),
                  `"${user.name}" removido do grupo "${group.name}".`,
                  'Não foi possível remover do grupo',
                );
                if (ok) onChanged();
              }}
            >
              Remover
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Adicionar usuário a grupos
            </Button>
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
        ]}
      />
      <FormModal
        visible={adding}
        title="Adicionar usuário a grupos"
        submitLabel="Adicionar a grupos"
        size="large"
        canSubmit={selected.length > 0}
        onSubmit={async () => {
          await iamApi.addUserToGroups(user.name, selected.map((g) => g.name));
          notifications.success(`"${user.name}" adicionado a ${selected.length === 1 ? 'um grupo' : `${selected.length} grupos`}.`);
          setSelected([]);
          onChanged();
        }}
        onDismiss={() => setAdding(false)}
      >
        {adding && <GroupPicker title="Grupos de usuários" selected={selected} onChange={setSelected} exclude={user.groups} />}
      </FormModal>
    </>
  );
}

function AccessKeys({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const notifications = useNotifications();
  const action = useAction();
  const [created, setCreated] = useState<{ accessKeyId: string; secretAccessKey: string } | null>(null);
  const [toDelete, setToDelete] = useState<AccessKey | null>(null);
  const atLimit = user.accessKeys.length >= MAX_ACCESS_KEYS;

  const createKey = async () => {
    try {
      setCreated(await iamApi.createAccessKey(user.name));
      onChanged();
    } catch (err) {
      notifications.failure('Não foi possível criar a chave de acesso', err);
    }
  };

  return (
    <SpaceBetween size="l">
      <ResourceTable
        title="Chaves de acesso"
        description="Use chaves de acesso para chamadas programáticas. O emulador aceita qualquer credencial, então elas servem para testar o fluxo do seu código."
        variant="container"
        resourceName="chaves de acesso"
        items={user.accessKeys}
        loading={false}
        error={null}
        onRetry={onChanged}
        trackBy="id"
        empty={<EmptyState title="Nenhuma chave de acesso" action={<Button onClick={createKey}>Criar chave de acesso</Button>} />}
        actions={([key]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              disabled={!key}
              loading={action.running}
              onClick={async () => {
                if (!key) return;
                const status = key.status === 'Active' ? 'Inactive' : 'Active';
                const ok = await action.run(
                  () => iamApi.setAccessKeyStatus(user.name, key.id, status),
                  `Chave ${key.id} ${status === 'Active' ? 'ativada' : 'desativada'}.`,
                  'Não foi possível alterar a chave',
                );
                if (ok) onChanged();
              }}
            >
              {key?.status === 'Inactive' ? 'Ativar' : 'Desativar'}
            </Button>
            <Button disabled={!key} onClick={() => key && setToDelete(key)}>
              Excluir
            </Button>
            <Button variant="primary" disabled={atLimit} onClick={createKey}>
              Criar chave de acesso
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'id', header: 'ID da chave de acesso', cell: (k) => k.id },
          {
            id: 'status',
            header: 'Status',
            cell: (k) => (k.status === 'Active' ? <StatusIndicator type="success">Ativa</StatusIndicator> : <StatusIndicator type="stopped">Inativa</StatusIndicator>),
          },
          { id: 'created', header: 'Criação', cell: (k) => formatDate(k.createdAt) },
          { id: 'used', header: 'Último uso', cell: (k) => (k.lastUsedAt ? `${formatDate(k.lastUsedAt)}${k.lastUsedService ? ` (${k.lastUsedService})` : ''}` : 'Nunca') },
        ]}
      />
      {atLimit && <Box color="text-body-secondary">Limite de {MAX_ACCESS_KEYS} chaves por usuário atingido. Exclua uma para criar outra.</Box>}

      <Modal
        visible={created !== null}
        header="Chave de acesso criada"
        closeAriaLabel="Fechar"
        onDismiss={() => setCreated(null)}
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setCreated(null)}>
              Concluído
            </Button>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Alert type="warning">
            Esta é a única vez em que a chave secreta de acesso pode ser vista. Copie e guarde agora; depois só é possível
            criar uma nova chave.
          </Alert>
          {created && (
            <KeyValuePairs
              columns={1}
              items={[
                { label: 'Chave de acesso', value: <CopyToClipboard variant="inline" textToCopy={created.accessKeyId} copySuccessText="Copiado" copyErrorText="Falha ao copiar" /> },
                { label: 'Chave secreta de acesso', value: <CopyToClipboard variant="inline" textToCopy={created.secretAccessKey} copySuccessText="Copiado" copyErrorText="Falha ao copiar" /> },
              ]}
            />
          )}
        </SpaceBetween>
      </Modal>

      <DeleteModal
        visible={toDelete !== null}
        title="Excluir chave de acesso"
        confirmationText={toDelete?.id ?? ''}
        description={<>A chave <b>{toDelete?.id}</b> será excluída permanentemente. Para confirmar, digite o ID da chave.</>}
        onConfirm={async () => {
          await iamApi.deleteAccessKey(user.name, toDelete!.id);
          notifications.success(`Chave ${toDelete!.id} excluída.`);
          onChanged();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </SpaceBetween>
  );
}
