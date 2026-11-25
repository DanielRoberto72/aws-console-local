import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Tabs from '@cloudscape-design/components/tabs';
import Textarea from '@cloudscape-design/components/textarea';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { lambdaApi } from '../../api/lambda';
import { snsApi, type SubscriptionSummary, type TopicDetail } from '../../api/sns';
import { sqsApi } from '../../api/sqs';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { FormModal } from '../../components/FormModal';
import { LoadError } from '../../components/ErrorAlert';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { SNS_BREADCRUMB, topicHref } from './TopicsPage';

const PROTOCOLS = [
  { value: 'sqs', label: 'Amazon SQS' },
  { value: 'lambda', label: 'AWS Lambda' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'email', label: 'E-mail' },
  { value: 'email-json', label: 'E-mail (JSON)' },
];

export function TopicDetailPage() {
  const name = useParams().topic!;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([SNS_BREADCRUMB, { text: 'Tópicos', href: '/sns/topics' }, { text: name, href: topicHref(name) }]);
  const topic = useRemote((signal) => snsApi.topic(name, signal), [name]);
  const [activeTab, setActiveTab] = useState(params.get('tab') === 'publish' ? 'publish' : 'subscriptions');
  const [deleting, setDeleting] = useState(false);

  if (topic.error) return <LoadError error={topic.error} onRetry={topic.reload} />;
  if (!topic.data) return <Spinner size="large" />;
  const { attributes } = topic.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={topic.reload} />
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button variant="primary" onClick={() => setActiveTab('publish')}>
                Publicar mensagem
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Nome', value: name },
              { label: 'Tipo', value: attributes.FifoTopic === 'true' ? 'FIFO' : 'Padrão' },
              { label: 'Nome de exibição', value: attributes.DisplayName || '-' },
              { label: 'ARN', value: topic.data.arn },
              { label: 'Assinaturas confirmadas', value: attributes.SubscriptionsConfirmed ?? '0' },
              { label: 'Assinaturas pendentes', value: attributes.SubscriptionsPending ?? '0' },
            ]}
          />
        </Container>
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            { id: 'subscriptions', label: 'Assinaturas', content: <Subscriptions topic={topic.data} onChanged={topic.reload} /> },
            { id: 'publish', label: 'Publicar mensagem', content: <PublishForm topic={topic.data} /> },
          ]}
        />
      </SpaceBetween>
      <DeleteModal
        visible={deleting}
        title="Excluir tópico"
        confirmationText="excluir"
        description={<>O tópico <b>{name}</b> e todas as suas assinaturas serão excluídos.</>}
        onConfirm={async () => {
          await snsApi.deleteTopic(name);
          notifications.success(`Tópico "${name}" excluído.`);
          navigate('/sns/topics');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}

function Subscriptions({ topic, onChanged }: { topic: TopicDetail; onChanged: () => void }) {
  const notifications = useNotifications();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<SubscriptionSummary | null>(null);
  const [protocol, setProtocol] = useState('sqs');
  const [endpoint, setEndpoint] = useState('');
  const [raw, setRaw] = useState(false);
  const [filterPolicy, setFilterPolicy] = useState('');
  // Sugestões de destino: as filas e funções existentes, como os seletores do console.
  const queues = useRemote((signal) => (creating && protocol === 'sqs' ? sqsApi.listQueues(signal) : Promise.resolve(null)), [creating, protocol]);
  const functions = useRemote((signal) => (creating && protocol === 'lambda' ? lambdaApi.list(signal) : Promise.resolve(null)), [creating, protocol]);
  const targets =
    protocol === 'sqs'
      ? (queues.data?.queues ?? []).map((q) => `arn:aws:sqs:us-east-1:000000000000:${q.name}`)
      : protocol === 'lambda'
        ? (functions.data?.functions ?? []).map((f) => f.arn)
        : [];
  const filterError = jsonError(filterPolicy);

  return (
    <>
      <ResourceTable
        title="Assinaturas"
        variant="container"
        resourceName="assinaturas"
        items={topic.subscriptions}
        loading={false}
        error={null}
        onRetry={onChanged}
        trackBy="arn"
        empty={<EmptyState title="Nenhuma assinatura" action={<Button onClick={() => setCreating(true)}>Criar assinatura</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!selected || selected.pending} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar assinatura
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'protocol', header: 'Protocolo', cell: (s) => s.protocol },
          { id: 'endpoint', header: 'Endpoint', cell: (s) => s.endpoint },
          { id: 'status', header: 'Status', cell: (s) => (s.pending ? <StatusIndicator type="pending">Confirmação pendente</StatusIndicator> : <StatusIndicator>Confirmada</StatusIndicator>) },
          { id: 'raw', header: 'Entrega bruta', cell: (s) => (s.attributes.RawMessageDelivery === 'true' ? 'Sim' : 'Não') },
        ]}
      />
      <FormModal
        visible={creating}
        title="Criar assinatura"
        submitLabel="Criar assinatura"
        size="medium"
        canSubmit={!!endpoint.trim() && !filterError}
        onSubmit={async () => {
          await snsApi.subscribe(topic.name, {
            protocol,
            endpoint: endpoint.trim(),
            rawMessageDelivery: raw || undefined,
            filterPolicy: filterPolicy.trim() || undefined,
          });
          notifications.success('Assinatura criada.');
          setEndpoint('');
          setFilterPolicy('');
          onChanged();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Protocolo">
          <Select
            selectedOption={PROTOCOLS.find((p) => p.value === protocol) ?? null}
            onChange={({ detail }) => {
              setProtocol(detail.selectedOption.value!);
              setEndpoint('');
            }}
            options={PROTOCOLS}
          />
        </FormField>
        <FormField
          label="Endpoint"
          description={protocol === 'sqs' || protocol === 'lambda' ? 'O painel concede ao tópico a permissão de entregar neste destino.' : undefined}
        >
          {targets.length > 0 ? (
            <Select
              selectedOption={endpoint ? { value: endpoint, label: endpoint } : null}
              onChange={({ detail }) => setEndpoint(detail.selectedOption.value!)}
              options={targets.map((t) => ({ value: t, label: t }))}
              placeholder="Escolha um destino"
              filteringType="auto"
            />
          ) : (
            <Input value={endpoint} onChange={({ detail }) => setEndpoint(detail.value)} placeholder="ARN, URL ou e-mail" />
          )}
        </FormField>
        {(protocol === 'sqs' || protocol === 'http' || protocol === 'https') && (
          <Checkbox checked={raw} onChange={({ detail }) => setRaw(detail.checked)} description="Entrega só o corpo da mensagem, sem o envelope JSON do SNS.">
            Habilitar entrega de mensagem bruta
          </Checkbox>
        )}
        <FormField label="Política de filtro - opcional" errorText={filterError} stretch>
          <CodeArea value={filterPolicy} onChange={setFilterPolicy} rows={4} ariaLabel="Política de filtro" placeholder='{"tipo": ["pedido"]}' />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir assinatura"
        confirmationText="excluir"
        description={<>A assinatura de <b>{toDelete?.endpoint}</b> será removida.</>}
        onConfirm={async () => {
          await snsApi.unsubscribe(toDelete!.arn);
          notifications.success('Assinatura excluída.');
          onChanged();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}

function PublishForm({ topic }: { topic: TopicDetail }) {
  const notifications = useNotifications();
  const fifo = topic.attributes.FifoTopic === 'true';
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [groupId, setGroupId] = useState('');
  const [dedupId, setDedupId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const publish = async () => {
    setSending(true);
    setError(undefined);
    try {
      const { messageId } = await snsApi.publish(topic.name, {
        message,
        subject: subject || undefined,
        ...(fifo ? { groupId, deduplicationId: dedupId || undefined } : {}),
      });
      notifications.success(`Mensagem ${messageId} publicada.`);
      setMessage('');
      setDedupId('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Container
      header={
        <Header variant="h2" actions={<Button variant="primary" onClick={publish} loading={sending} disabled={!message || (fifo && !groupId)}>Publicar mensagem</Button>}>
          Detalhes da mensagem
        </Header>
      }
    >
      <SpaceBetween size="m">
        <FormField label="Assunto - opcional">
          <Input value={subject} onChange={({ detail }) => setSubject(detail.value)} />
        </FormField>
        <FormField label="Corpo da mensagem" stretch>
          <Textarea value={message} onChange={({ detail }) => setMessage(detail.value)} rows={6} />
        </FormField>
        {fifo && (
          <ColumnLayout columns={2}>
            <FormField label="ID do grupo de mensagens">
              <Input value={groupId} onChange={({ detail }) => setGroupId(detail.value)} />
            </FormField>
            <FormField label="ID de desduplicação - opcional">
              <Input value={dedupId} onChange={({ detail }) => setDedupId(detail.value)} />
            </FormField>
          </ColumnLayout>
        )}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Container>
  );
}
