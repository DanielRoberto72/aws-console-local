import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Pagination from '@cloudscape-design/components/pagination';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sqsApi, type QueueSummary } from '../../api/sqs';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate, formatNumber } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { filterCountText, useConsoleCollection } from '../../components/useConsoleCollection';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const SQS_BREADCRUMB = { text: 'Amazon SQS', href: '/sqs/queues' };

type PendingAction = { kind: 'delete' | 'purge'; queue: QueueSummary } | null;

export const queueTypeLabel = (type: QueueSummary['type']) => (type === 'FIFO' ? 'FIFO' : 'Padrão');

export function QueuesPage() {
  useBreadcrumbs([SQS_BREADCRUMB, { text: 'Filas', href: '/sqs/queues' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const queues = useRemote((signal) => sqsApi.listQueues(signal), []);
  const [pending, setPending] = useState<PendingAction>(null);

  const { items, collectionProps, filterProps, filteredItemsCount, paginationProps } = useConsoleCollection(queues.data?.queues ?? [], {
    resourceName: 'filas',
    empty: (
      <EmptyState
        title="Nenhuma fila"
        subtitle="Você não tem filas nesta região."
        action={<Button onClick={() => navigate('/sqs/create-queue')}>Criar fila</Button>}
      />
    ),
    defaultSortField: 'name',
  });
  const selected = collectionProps.selectedItems?.[0];

  if (queues.error) return <LoadError error={queues.error} onRetry={queues.reload} />;

  return (
    <>
      <Table
        {...collectionProps}
        variant="full-page"
        selectionType="single"
        trackBy="url"
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${queues.data?.queues.length ?? 0})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Atualizar" onClick={queues.reload} />
                <Button disabled={!selected} onClick={() => selected && setPending({ kind: 'purge', queue: selected })}>
                  Limpar
                </Button>
                <Button disabled={!selected} onClick={() => selected && setPending({ kind: 'delete', queue: selected })}>
                  Excluir
                </Button>
                <Button variant="primary" onClick={() => navigate('/sqs/create-queue')}>
                  Criar fila
                </Button>
              </SpaceBetween>
            }
          >
            Filas
          </Header>
        }
        loading={queues.loading}
        loadingText="Carregando filas"
        items={items}
        filter={<TextFilter {...filterProps} filteringPlaceholder="Pesquisar filas por prefixo" countText={filterCountText(filteredItemsCount)} />}
        pagination={<Pagination {...paginationProps} />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Nome',
            sortingField: 'name',
            cell: (q) => (
              <Link href={`/sqs/queues/${encodeURIComponent(q.name)}`} onFollow={follow}>
                {q.name}
              </Link>
            ),
          },
          { id: 'type', header: 'Tipo', sortingField: 'type', cell: (q) => queueTypeLabel(q.type) },
          { id: 'created', header: 'Criada', sortingField: 'createdAt', cell: (q) => formatDate(q.createdAt) },
          { id: 'available', header: 'Mensagens disponíveis', sortingField: 'messagesAvailable', cell: (q) => formatNumber(q.messagesAvailable) },
          { id: 'inflight', header: 'Mensagens em trânsito', sortingField: 'messagesInFlight', cell: (q) => formatNumber(q.messagesInFlight) },
        ]}
      />

      <DeleteModal
        visible={pending?.kind === 'delete'}
        title="Excluir fila"
        confirmationText="confirmar"
        description={<>A fila <b>{pending?.queue.name}</b> e todas as suas mensagens serão excluídas permanentemente.</>}
        onConfirm={async () => {
          const name = pending!.queue.name;
          await sqsApi.deleteQueue(name);
          notifications.success(`Fila "${name}" excluída.`);
          queues.reload();
        }}
        onDismiss={() => setPending(null)}
      />

      <DeleteModal
        visible={pending?.kind === 'purge'}
        title="Limpar fila"
        actionLabel="Limpar"
        confirmationText="limpar"
        description={<>Todas as mensagens da fila <b>{pending?.queue.name}</b> serão excluídas permanentemente.</>}
        onConfirm={async () => {
          const name = pending!.queue.name;
          await sqsApi.purge(name);
          notifications.success(`Fila "${name}" limpa.`);
          queues.reload();
        }}
        onDismiss={() => setPending(null)}
      />
    </>
  );
}
