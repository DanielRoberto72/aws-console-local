import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { secretsApi, type SecretValue } from '../../api/secrets';
import { CodeArea, prettyJson } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { useAction } from '../../hooks/useAction';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { secretHref, SECRETS_BREADCRUMB } from './SecretsPage';

export function SecretDetailPage() {
  const name = useSearchParams()[0].get('name') ?? '';
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([SECRETS_BREADCRUMB, { text: 'Segredos', href: '/secrets' }, { text: name, href: secretHref(name) }]);
  const detail = useRemote((signal) => secretsApi.detail(name, signal), [name]);
  const retrieve = useAction();
  // O valor só é buscado quando o usuário pede, como no console.
  const [value, setValue] = useState<SecretValue | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (detail.error) return <LoadError error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Spinner size="large" />;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes do segredo</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Nome do segredo', value: detail.data.name },
              { label: 'Descrição', value: detail.data.description || '-' },
              { label: 'ARN do segredo', value: detail.data.arn },
              { label: 'Criação', value: formatDate(detail.data.createdAt) },
              { label: 'Última alteração', value: formatDate(detail.data.lastChangedAt) },
              { label: 'Versões', value: detail.data.versions },
            ]}
          />
        </Container>
        <Container
          header={
            <Header
              variant="h2"
              description="Recupere e visualize o valor do segredo."
              actions={
                value ? (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={() => setValue(null)}>Ocultar</Button>
                    <Button
                      disabled={value.kind !== 'string'}
                      onClick={() => {
                        setDraft(value.kind === 'string' ? value.value : '');
                        setEditing(true);
                      }}
                    >
                      Editar
                    </Button>
                  </SpaceBetween>
                ) : (
                  <Button
                    loading={retrieve.running}
                    onClick={() => retrieve.run(async () => setValue((await secretsApi.value(name)).value), 'Valor recuperado.', 'Falha ao recuperar o valor')}
                  >
                    Recuperar valor do segredo
                  </Button>
                )
              }
            >
              Valor do segredo
            </Header>
          }
        >
          {!value ? (
            <Alert type="info">O valor fica oculto até ser recuperado.</Alert>
          ) : value.kind === 'string' ? (
            <CodeArea value={prettyJson(value.value)} readOnly rows={8} ariaLabel="Valor do segredo" />
          ) : (
            <Alert type="info">Segredo binário ({value.base64.length} caracteres em base64).</Alert>
          )}
        </Container>
      </SpaceBetween>
      <FormModal
        visible={editing}
        title="Editar valor do segredo"
        submitLabel="Salvar"
        size="medium"
        canSubmit={draft.length > 0}
        onSubmit={async () => {
          await secretsApi.putValue(name, { kind: 'string', value: draft });
          setValue({ kind: 'string', value: draft });
          notifications.success('Nova versão do segredo salva.');
          detail.reload();
        }}
        onDismiss={() => setEditing(false)}
      >
        <FormField label="Valor" stretch>
          <CodeArea value={draft} onChange={setDraft} rows={10} ariaLabel="Novo valor do segredo" />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={deleting}
        title="Excluir segredo"
        confirmationText="excluir"
        description={<>O segredo <b>{name}</b> será excluído imediatamente, sem janela de recuperação.</>}
        onConfirm={async () => {
          await secretsApi.remove(name);
          notifications.success(`Segredo "${name}" excluído.`);
          navigate('/secrets');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}
