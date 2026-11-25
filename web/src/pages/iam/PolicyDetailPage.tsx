import Badge from '@cloudscape-design/components/badge';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Tabs from '@cloudscape-design/components/tabs';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { iamApi, type PolicyDetail } from '../../api/iam';
import { CodeArea, jsonError, prettyJson } from '../../components/CodeArea';
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
import { groupHref, IAM_BREADCRUMB, POLICY_TYPE_LABELS, policyHref, roleHref, userHref } from './iamLinks';

/** Limite de versões de uma política gerenciada pelo cliente. */
const MAX_VERSIONS = 5;

export function PolicyDetailPage() {
  const [params] = useSearchParams();
  const arn = params.get('arn') ?? '';
  const navigate = useNavigate();
  const notifications = useNotifications();
  const policy = useRemote((signal) => iamApi.policy(arn, signal), [arn]);
  const name = policy.data?.name ?? arn.split('/').pop() ?? arn;
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Políticas', href: '/iam/policies' }, { text: name, href: policyHref(arn) }]);
  const [editing, setEditing] = useState(false);
  const [document, setDocument] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (policy.error) return <LoadError error={policy.error} onRetry={policy.reload} />;
  if (!policy.data) return <Spinner size="large" />;
  const data = policy.data;
  const editable = data.type === 'customer';
  const documentError = jsonError(document, true);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={data.description || undefined}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={policy.reload} />
              {editable && <Button onClick={() => setDeleting(true)}>Excluir</Button>}
            </SpaceBetween>
          }
        >
          {data.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes da política</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Tipo', value: POLICY_TYPE_LABELS[data.type] },
              { label: 'Criação', value: formatDate(data.createdAt) },
              { label: 'Última edição', value: formatDate(data.updatedAt) },
              { label: 'ARN', value: <CopyToClipboard variant="inline" textToCopy={data.arn} copySuccessText="ARN copiado" copyErrorText="Falha ao copiar" /> },
              { label: 'Versão padrão', value: data.defaultVersion },
              { label: 'Entidades anexadas', value: data.attachments },
            ]}
          />
        </Container>
        <Tabs
          tabs={[
            {
              id: 'permissions',
              label: 'Permissões',
              content: (
                <Container
                  header={
                    <Header
                      variant="h2"
                      description={editable ? 'Salvar alterações cria uma nova versão padrão.' : 'Políticas gerenciadas pela AWS não podem ser editadas.'}
                      actions={
                        editable && (
                          <Button
                            onClick={() => {
                              setDocument(prettyJson(data.document));
                              setEditing(true);
                            }}
                          >
                            Editar
                          </Button>
                        )
                      }
                    >
                      Permissões definidas nesta política
                    </Header>
                  }
                >
                  <CodeArea value={prettyJson(data.document)} readOnly rows={18} ariaLabel="Documento da política" />
                </Container>
              ),
            },
            { id: 'entities', label: 'Entidades anexadas', content: <AttachedEntities policy={data} /> },
            ...(editable ? [{ id: 'versions', label: 'Versões da política', content: <Versions policy={data} onChanged={policy.reload} /> }] : []),
          ]}
        />
      </SpaceBetween>
      <FormModal
        visible={editing}
        title={`Editar ${data.name}`}
        submitLabel="Salvar alterações"
        size="large"
        canSubmit={!documentError}
        onSubmit={async () => {
          await iamApi.updatePolicy(arn, document);
          notifications.success(
            data.versions.length >= MAX_VERSIONS
              ? `Nova versão salva. A versão mais antiga foi descartada (limite de ${MAX_VERSIONS}).`
              : 'Nova versão salva como padrão.',
          );
          policy.reload();
        }}
        onDismiss={() => setEditing(false)}
      >
        <FormField errorText={documentError} stretch>
          <CodeArea value={document} onChange={setDocument} rows={20} ariaLabel="Documento da política" />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={deleting}
        title="Excluir política"
        confirmationText={data.name}
        description={<>A política <b>{data.name}</b> será desanexada de {data.attachments} entidade(s) e excluída. Para confirmar, digite o nome da política.</>}
        onConfirm={async () => {
          await iamApi.deletePolicy(arn);
          notifications.success(`Política "${data.name}" excluída.`);
          navigate('/iam/policies');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}

const ENTITY_LABELS = { user: 'Usuário', group: 'Grupo de usuários', role: 'Função' } as const;
const ENTITY_HREFS = { user: userHref, group: groupHref, role: roleHref } as const;

function AttachedEntities({ policy }: { policy: PolicyDetail }) {
  const follow = useFollow();
  const items = [
    ...policy.entities.users.map((name) => ({ name, type: 'user' as const })),
    ...policy.entities.groups.map((name) => ({ name, type: 'group' as const })),
    ...policy.entities.roles.map((name) => ({ name, type: 'role' as const })),
  ].map((e) => ({ ...e, key: `${e.type}:${e.name}` }));

  return (
    <ResourceTable
      title="Entidades anexadas"
      variant="container"
      resourceName="entidades"
      items={items}
      loading={false}
      error={null}
      onRetry={() => undefined}
      trackBy="key"
      selectionType="none"
      defaultSortField="name"
      empty={<EmptyState title="Nenhuma entidade" subtitle="Esta política não está anexada a usuários, grupos ou funções." />}
      actions={() => null}
      columns={[
        {
          id: 'name',
          header: 'Nome da entidade',
          sortingField: 'name',
          cell: (e) => (
            <Link href={ENTITY_HREFS[e.type](e.name)} onFollow={follow}>
              {e.name}
            </Link>
          ),
        },
        { id: 'type', header: 'Tipo de entidade', sortingField: 'type', cell: (e) => ENTITY_LABELS[e.type] },
      ]}
    />
  );
}

function Versions({ policy, onChanged }: { policy: PolicyDetail; onChanged: () => void }) {
  const action = useAction();
  const notifications = useNotifications();
  const [toDelete, setToDelete] = useState<string | null>(null);

  return (
    <>
      <ResourceTable
        title="Versões da política"
        description={`Até ${MAX_VERSIONS} versões. A versão padrão é a que vale.`}
        variant="container"
        resourceName="versões"
        items={policy.versions}
        loading={false}
        error={null}
        onRetry={onChanged}
        trackBy="id"
        empty={<EmptyState title="Nenhuma versão" />}
        actions={([version]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!version || version.isDefault} onClick={() => version && setToDelete(version.id)}>
              Excluir
            </Button>
            <Button
              disabled={!version || version.isDefault}
              loading={action.running}
              onClick={async () => {
                if (!version) return;
                const ok = await action.run(
                  () => iamApi.setDefaultVersion(policy.arn, version.id),
                  `Versão ${version.id} definida como padrão.`,
                  'Não foi possível definir a versão padrão',
                );
                if (ok) onChanged();
              }}
            >
              Definir como padrão
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'id', header: 'Versão', cell: (v) => (v.isDefault ? <SpaceBetween direction="horizontal" size="xs"><span>{v.id}</span><Badge color="blue">Padrão</Badge></SpaceBetween> : v.id) },
          { id: 'created', header: 'Criação', cell: (v) => formatDate(v.createdAt) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir versão da política"
        confirmationText="excluir"
        description={<>A versão <b>{toDelete}</b> será excluída permanentemente.</>}
        onConfirm={async () => {
          await iamApi.deleteVersion(policy.arn, toDelete!);
          notifications.success(`Versão ${toDelete} excluída.`);
          onChanged();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
