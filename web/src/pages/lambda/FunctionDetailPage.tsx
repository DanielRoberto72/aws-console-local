import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Tabs from '@cloudscape-design/components/tabs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { lambdaApi } from '../../api/lambda';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatBytes, formatDate } from '../../components/format';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { logGroupHref } from '../logs/LogGroupsPage';
import { CodePanel } from './CodePanel';
import { ConfigurationPanel } from './ConfigurationPanel';
import { functionHref, LAMBDA_BREADCRUMB } from './FunctionsPage';
import { runtimeLabel } from './runtimes';
import { TestPanel } from './TestPanel';

export function FunctionDetailPage() {
  const name = useParams().name!;
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([LAMBDA_BREADCRUMB, { text: 'Funções', href: '/lambda/functions' }, { text: name, href: functionHref(name) }]);
  const fn = useRemote((signal) => lambdaApi.get(name, signal), [name]);
  const [activeTab, setActiveTab] = useState('code');
  const [deleting, setDeleting] = useState(false);

  if (fn.error) return <LoadError error={fn.error} onRetry={fn.reload} />;
  if (!fn.data) return <Spinner size="large" />;
  const { summary } = fn.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={fn.reload} />
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button iconName="external" onClick={() => navigate(logGroupHref(fn.data!.logGroup))}>
                Ver logs no CloudWatch
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Visão geral da função</Header>}>
          <KeyValuePairs
            columns={4}
            items={[
              { label: 'Runtime', value: runtimeLabel(summary.runtime) },
              { label: 'Manipulador', value: summary.handler ?? '-' },
              { label: 'Tamanho do pacote', value: formatBytes(summary.codeSize) },
              { label: 'Última modificação', value: formatDate(summary.lastModified) },
              { label: 'ARN da função', value: summary.arn },
              { label: 'Papel de execução', value: fn.data.role || '-' },
            ]}
          />
        </Container>
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            { id: 'code', label: 'Código', content: <CodePanel fn={fn.data} onDeployed={fn.reload} /> },
            { id: 'test', label: 'Testar', content: <TestPanel functionName={name} /> },
            { id: 'configuration', label: 'Configuração', content: <ConfigurationPanel fn={fn.data} onSaved={fn.reload} /> },
          ]}
        />
      </SpaceBetween>
      <DeleteModal
        visible={deleting}
        title="Excluir função"
        confirmationText="confirmar"
        description={<>A função <b>{name}</b> será excluída permanentemente.</>}
        onConfirm={async () => {
          await lambdaApi.remove(name);
          notifications.success(`Função "${name}" excluída.`);
          navigate('/lambda/functions');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}
