import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Tabs from '@cloudscape-design/components/tabs';
import Textarea from '@cloudscape-design/components/textarea';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { iamApi, type RoleDetail } from '../../api/iam';
import { CodeArea, jsonError, prettyJson } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { FormModal } from '../../components/FormModal';
import { formatDate } from '../../components/format';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { useRemote } from '../../hooks/useRemote';
import { IAM_BREADCRUMB, roleHref } from './iamLinks';
import { PermissionsPanel } from './PermissionsPanel';

const formatDuration = (seconds: number) => (seconds % 3600 === 0 ? `${seconds / 3600} hora(s)` : `${seconds} segundos`);

export function RoleDetailPage() {
  const name = useParams().name!;
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Funções', href: '/iam/roles' }, { text: name, href: roleHref(name) }]);
  const role = useRemote((signal) => iamApi.role(name, signal), [name]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (role.error) return <LoadError error={role.error} onRetry={role.reload} />;
  if (!role.data) return <Spinner size="large" />;
  const data = role.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={data.description || undefined}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={role.reload} />
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2" actions={<Button onClick={() => setEditing(true)}>Editar</Button>}>Resumo</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Data de criação', value: formatDate(data.createdAt) },
              { label: 'ARN', value: <CopyToClipboard variant="inline" textToCopy={data.arn} copySuccessText="ARN copiado" copyErrorText="Falha ao copiar" /> },
              { label: 'Última atividade', value: data.lastUsedAt ? `${formatDate(data.lastUsedAt)} (${data.lastUsedRegion ?? '-'})` : '-' },
              { label: 'Duração máxima da sessão', value: formatDuration(data.maxSessionDuration) },
              { label: 'Caminho', value: data.path },
              { label: 'ID da função', value: data.id },
            ]}
          />
        </Container>
        <Tabs
          tabs={[
            { id: 'permissions', label: 'Permissões', content: <PermissionsPanel kind="roles" name={name} policies={data} onChanged={role.reload} /> },
            { id: 'trust', label: 'Relações de confiança', content: <TrustRelationships role={data} onChanged={role.reload} /> },
          ]}
        />
      </SpaceBetween>
      <EditRoleModal visible={editing} role={data} onDismiss={() => setEditing(false)} onSaved={role.reload} />
      <DeleteModal
        visible={deleting}
        title="Excluir função"
        confirmationText={name}
        description={<>A função <b>{name}</b> será excluída, e os serviços que a usam deixam de conseguir assumi-la. Para confirmar, digite o nome da função.</>}
        onConfirm={async () => {
          await iamApi.deleteRole(name);
          notifications.success(`Função "${name}" excluída.`);
          navigate('/iam/roles');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}

function EditRoleModal({ visible, role, onDismiss, onSaved }: { visible: boolean; role: RoleDetail; onDismiss: () => void; onSaved: () => void }) {
  const notifications = useNotifications();
  const [description, setDescription] = useState(role.description);
  const [hours, setHours] = useState(String(role.maxSessionDuration / 3600));
  const hoursValue = Number(hours);
  const hoursError = Number.isInteger(hoursValue) && hoursValue >= 1 && hoursValue <= 12 ? null : 'Entre 1 e 12 horas.';

  return (
    <FormModal
      visible={visible}
      title="Editar descrição e duração da sessão"
      submitLabel="Salvar alterações"
      canSubmit={!hoursError}
      onSubmit={async () => {
        await iamApi.updateRole(role.name, description, hoursValue * 3600);
        notifications.success(`Função "${role.name}" atualizada.`);
        onSaved();
      }}
      onDismiss={onDismiss}
    >
      <FormField label="Descrição">
        <Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} rows={2} />
      </FormField>
      <FormField label="Duração máxima da sessão (horas)" errorText={hoursError}>
        <Input type="number" value={hours} onChange={({ detail }) => setHours(detail.value)} />
      </FormField>
    </FormModal>
  );
}

function TrustRelationships({ role, onChanged }: { role: RoleDetail; onChanged: () => void }) {
  const notifications = useNotifications();
  const [editing, setEditing] = useState(false);
  const [document, setDocument] = useState('');
  const documentError = jsonError(document, true);

  return (
    <>
      <Container
        header={
          <Header
            variant="h2"
            description="Entidades que podem assumir esta função."
            actions={
              <Button
                onClick={() => {
                  setDocument(prettyJson(role.trustPolicy));
                  setEditing(true);
                }}
              >
                Editar política de confiança
              </Button>
            }
          >
            Entidades confiáveis
          </Header>
        }
      >
        <SpaceBetween size="m">
          <KeyValuePairs columns={1} items={[{ label: 'Entidades', value: role.trustedEntities.join(', ') || '-' }]} />
          <CodeArea value={prettyJson(role.trustPolicy)} readOnly rows={12} ariaLabel="Política de confiança" />
        </SpaceBetween>
      </Container>
      <FormModal
        visible={editing}
        title="Editar política de confiança"
        submitLabel="Atualizar política"
        size="large"
        canSubmit={!documentError}
        onSubmit={async () => {
          await iamApi.updateTrustPolicy(role.name, document);
          notifications.success('Política de confiança atualizada.');
          onChanged();
        }}
        onDismiss={() => setEditing(false)}
      >
        <FormField errorText={documentError} stretch>
          <CodeArea value={document} onChange={setDocument} rows={16} ariaLabel="Política de confiança" />
        </FormField>
      </FormModal>
    </>
  );
}
