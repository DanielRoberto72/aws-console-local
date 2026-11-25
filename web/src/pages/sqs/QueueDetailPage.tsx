import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Table from '@cloudscape-design/components/table';
import Tabs from '@cloudscape-design/components/tabs';
import Textarea from '@cloudscape-design/components/textarea';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { sqsApi, type QueueSummary, type ReceivedMessage } from '../../api/sqs';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate, formatNumber } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { queueTypeLabel, SQS_BREADCRUMB } from './QueuesPage';

export function QueueDetailPage() {
  const queueName = useParams().queue!;
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([
    SQS_BREADCRUMB,
    { text: 'Filas', href: '/sqs/queues' },
    { text: queueName, href: `/sqs/queues/${encodeURIComponent(queueName)}` },
  ]);
  const queue = useRemote((signal) => sqsApi.getQueue(queueName, signal), [queueName]);
  const [pending, setPending] = useState<'delete' | 'purge' | null>(null);
  const [activeTab, setActiveTab] = useState('details');

  if (queue.error) return <LoadError error={queue.error} onRetry={queue.reload} />;
  if (!queue.data) return <Spinner size="large" />;
  const { summary, attributes } = queue.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={queue.reload} />
              <Button onClick={() => setPending('purge')}>Limpar</Button>
              <Button onClick={() => setPending('delete')}>Excluir</Button>
              <Button variant="primary" onClick={() => setActiveTab('messages')}>
                Enviar e receber mensagens
              </Button>
            </SpaceBetween>
          }
        >
          {queueName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Nome', value: summary.name },
              { label: 'Tipo', value: queueTypeLabel(summary.type) },
              { label: 'Criada', value: formatDate(summary.createdAt) },
              { label: 'ARN', value: <CopyToClipboard variant="inline" textToCopy={attributes.QueueArn ?? ''} copySuccessText="ARN copiado" copyErrorText="Falha ao copiar" /> },
              { label: 'URL', value: <CopyToClipboard variant="inline" textToCopy={summary.url} copySuccessText="URL copiada" copyErrorText="Falha ao copiar" /> },
              { label: 'Mensagens disponíveis', value: formatNumber(summary.messagesAvailable) },
              { label: 'Mensagens em trânsito', value: formatNumber(summary.messagesInFlight) },
              { label: 'Mensagens atrasadas', value: formatNumber(summary.messagesDelayed) },
            ]}
          />
        </Container>
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            { id: 'details', label: 'Atributos', content: <AttributesTable attributes={attributes} /> },
            { id: 'messages', label: 'Enviar e receber mensagens', content: <MessagesPanel queue={summary} onChanged={queue.reload} /> },
          ]}
        />
      </SpaceBetween>

      <DeleteModal
        visible={pending === 'delete'}
        title="Excluir fila"
        confirmationText="confirmar"
        description={<>A fila <b>{queueName}</b> e todas as suas mensagens serão excluídas permanentemente.</>}
        onConfirm={async () => {
          await sqsApi.deleteQueue(queueName);
          notifications.success(`Fila "${queueName}" excluída.`);
          navigate('/sqs/queues');
        }}
        onDismiss={() => setPending(null)}
      />
      <DeleteModal
        visible={pending === 'purge'}
        title="Limpar fila"
        actionLabel="Limpar"
        confirmationText="limpar"
        description={<>Todas as mensagens da fila <b>{queueName}</b> serão excluídas permanentemente.</>}
        onConfirm={async () => {
          await sqsApi.purge(queueName);
          notifications.success(`Fila "${queueName}" limpa.`);
          queue.reload();
        }}
        onDismiss={() => setPending(null)}
      />
    </ContentLayout>
  );
}

function AttributesTable({ attributes }: { attributes: Record<string, string> }) {
  const rows = Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));
  return (
    <Table
      variant="container"
      header={<Header variant="h2" counter={`(${rows.length})`}>Atributos da fila</Header>}
      items={rows}
      columnDefinitions={[
        { id: 'name', header: 'Atributo', cell: (r) => r.name },
        { id: 'value', header: 'Valor', cell: (r) => <Box variant="code">{r.value}</Box> },
      ]}
    />
  );
}

function MessagesPanel({ queue, onChanged }: { queue: QueueSummary; onChanged: () => void }) {
  const notifications = useNotifications();
  const fifo = queue.type === 'FIFO';
  const [body, setBody] = useState('');
  const [groupId, setGroupId] = useState('');
  const [dedupId, setDedupId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [selected, setSelected] = useState<ReceivedMessage[]>([]);
  const [polling, setPolling] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState('5');

  const send = async () => {
    setSending(true);
    setSendError(undefined);
    try {
      const { messageId } = await sqsApi.send(queue.name, {
        body,
        ...(fifo ? { groupId: groupId || undefined, deduplicationId: dedupId || undefined } : {}),
      });
      notifications.success(`Mensagem ${messageId} enviada.`);
      setBody('');
      setDedupId('');
      onChanged();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const poll = async () => {
    setPolling(true);
    try {
      const wait = Math.min(Math.max(Number(waitSeconds) || 0, 0), 20);
      const { messages: received } = await sqsApi.receive(queue.name, wait);
      // Acumula sem repetir: a mesma mensagem pode voltar após o tempo de visibilidade.
      setMessages((current) => {
        const byId = new Map(current.map((m) => [m.messageId, m]));
        for (const m of received) byId.set(m.messageId, m);
        return [...byId.values()];
      });
      if (received.length === 0) notifications.info('Nenhuma mensagem disponível no momento.');
      onChanged();
    } catch (err) {
      notifications.failure('Falha ao receber mensagens', err);
    } finally {
      setPolling(false);
    }
  };

  const deleteSelected = async () => {
    try {
      for (const message of selected) await sqsApi.deleteMessage(queue.name, message.receiptHandle);
      const ids = new Set(selected.map((m) => m.messageId));
      setMessages((current) => current.filter((m) => !ids.has(m.messageId)));
      setSelected([]);
      notifications.success(`${ids.size} ${ids.size === 1 ? 'mensagem excluída' : 'mensagens excluídas'}.`);
      onChanged();
    } catch (err) {
      notifications.failure('Falha ao excluir mensagens', err);
    }
  };

  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header variant="h2" actions={<Button variant="primary" onClick={send} loading={sending} disabled={!body || (fifo && !groupId)}>Enviar mensagem</Button>}>
            Enviar mensagem
          </Header>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Corpo da mensagem" stretch>
            <Textarea value={body} onChange={({ detail }) => setBody(detail.value)} rows={5} placeholder='{"pedido": 42}' />
          </FormField>
          {fifo && (
            <ColumnLayout columns={2}>
              <FormField label="ID do grupo de mensagens" description="Obrigatório em filas FIFO.">
                <Input value={groupId} onChange={({ detail }) => setGroupId(detail.value)} />
              </FormField>
              <FormField label="ID de desduplicação - opcional" description="Necessário se a fila não usa desduplicação por conteúdo.">
                <Input value={dedupId} onChange={({ detail }) => setDedupId(detail.value)} />
              </FormField>
            </ColumnLayout>
          )}
          {sendError && <Alert type="error">{sendError}</Alert>}
        </SpaceBetween>
      </Container>

      <Table
        variant="container"
        selectionType="multi"
        trackBy="messageId"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        header={
          <Header
            variant="h2"
            counter={`(${messages.length})`}
            description="Receber não exclui: as mensagens ficam invisíveis até o tempo limite de visibilidade."
            actions={
              <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                <Input value={waitSeconds} onChange={({ detail }) => setWaitSeconds(detail.value)} inputMode="numeric" ariaLabel="Segundos de espera" />
                <Button disabled={selected.length === 0} onClick={deleteSelected}>
                  Excluir
                </Button>
                <Button onClick={() => { setMessages([]); setSelected([]); }} disabled={messages.length === 0}>
                  Limpar lista
                </Button>
                <Button variant="primary" onClick={poll} loading={polling}>
                  Pesquisar mensagens
                </Button>
              </SpaceBetween>
            }
          >
            Receber mensagens
          </Header>
        }
        items={messages}
        columnDefinitions={[
          { id: 'id', header: 'ID', cell: (m) => m.messageId },
          { id: 'sent', header: 'Enviada', cell: (m) => formatDate(m.sentAt) },
          { id: 'count', header: 'Recebimentos', cell: (m) => m.receiveCount },
          ...(fifo ? [{ id: 'group', header: 'Grupo', cell: (m: ReceivedMessage) => m.groupId ?? '-' }] : []),
          { id: 'body', header: 'Corpo', cell: (m) => <Box variant="code">{m.body.length > 200 ? `${m.body.slice(0, 200)}…` : m.body}</Box> },
        ]}
        empty={<EmptyState title="Nenhuma mensagem" subtitle='Use "Pesquisar mensagens" para receber da fila.' />}
      />
    </SpaceBetween>
  );
}
