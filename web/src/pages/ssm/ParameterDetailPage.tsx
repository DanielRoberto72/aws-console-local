import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ssmApi } from '../../api/ssm';
import { CodeArea } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { ParameterFormModal } from './ParameterFormModal';
import { parameterHref, SSM_BREADCRUMB } from './ParametersPage';

export function ParameterDetailPage() {
  const name = useSearchParams()[0].get('name') ?? '';
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([SSM_BREADCRUMB, { text: 'Parameter Store', href: '/ssm/parameters' }, { text: name, href: parameterHref(name) }]);
  const parameter = useRemote((signal) => ssmApi.detail(name, signal), [name]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revealed, setRevealed] = useState(false);

  if (parameter.error) return <LoadError error={parameter.error} onRetry={parameter.reload} />;
  if (!parameter.data) return <Spinner size="large" />;
  const secure = parameter.data.type === 'SecureString';

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button variant="primary" onClick={() => setEditing(true)}>
                Editar
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes do parâmetro</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Tipo', value: parameter.data.type },
              { label: 'Versão', value: parameter.data.version },
              { label: 'Última modificação', value: formatDate(parameter.data.lastModified) },
              { label: 'ARN', value: parameter.data.arn },
            ]}
          />
        </Container>
        <Container
          header={
            <Header variant="h2" actions={secure && <Button onClick={() => setRevealed((r) => !r)}>{revealed ? 'Ocultar' : 'Mostrar'}</Button>}>
              Valor
            </Header>
          }
        >
          <CodeArea value={secure && !revealed ? '••••••••' : parameter.data.value} readOnly rows={5} ariaLabel="Valor do parâmetro" />
        </Container>
      </SpaceBetween>
      <ParameterFormModal
        visible={editing}
        existing={parameter.data}
        onSaved={() => {
          notifications.success('Parâmetro atualizado.');
          parameter.reload();
        }}
        onDismiss={() => setEditing(false)}
      />
      <DeleteModal
        visible={deleting}
        title="Excluir parâmetro"
        confirmationText="excluir"
        description={<>O parâmetro <b>{name}</b> e todo o seu histórico serão excluídos.</>}
        onConfirm={async () => {
          await ssmApi.remove(name);
          notifications.success(`Parâmetro "${name}" excluído.`);
          navigate('/ssm/parameters');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}
