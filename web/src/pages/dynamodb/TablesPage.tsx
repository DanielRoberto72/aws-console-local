import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Pagination from '@cloudscape-design/components/pagination';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dynamodbApi, type TableSummary } from '../../api/dynamodb';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatNumber } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { filterCountText, useConsoleCollection } from '../../components/useConsoleCollection';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { TableStatus, billingLabel } from './TableStatus';

export const DYNAMODB_BREADCRUMB = { text: 'DynamoDB', href: '/dynamodb/tables' };

/** Enquanto alguma tabela muda de estado, a lista se atualiza sozinha. */
const TRANSITION_POLL_MS = 2_000;

export function TablesPage() {
  useBreadcrumbs([DYNAMODB_BREADCRUMB, { text: 'Tabelas', href: '/dynamodb/tables' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const tables = useRemote((signal) => dynamodbApi.listTables(signal), []);
  const [toDelete, setToDelete] = useState<TableSummary | null>(null);

  const all = tables.data?.tables ?? [];
  const inTransition = all.some((t) => t.status !== 'ACTIVE');
  usePolling(tables.reload, TRANSITION_POLL_MS, inTransition);

  const { items, collectionProps, filterProps, filteredItemsCount, paginationProps } = useConsoleCollection(all, {
    resourceName: 'tabelas',
    empty: (
      <EmptyState
        title="Nenhuma tabela"
        subtitle="Você não tem tabelas nesta conta."
        action={<Button onClick={() => navigate('/dynamodb/create-table')}>Criar tabela</Button>}
      />
    ),
    defaultSortField: 'name',
  });
  const selected = collectionProps.selectedItems?.[0];

  if (tables.error) return <LoadError error={tables.error} onRetry={tables.reload} />;

  return (
    <>
      <Table
        {...collectionProps}
        variant="full-page"
        selectionType="single"
        trackBy="name"
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${all.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Atualizar" onClick={tables.reload} />
                <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
                  Excluir
                </Button>
                <Button variant="primary" onClick={() => navigate('/dynamodb/create-table')}>
                  Criar tabela
                </Button>
              </SpaceBetween>
            }
          >
            Tabelas
          </Header>
        }
        loading={tables.loading && !tables.data}
        loadingText="Carregando tabelas"
        items={items}
        filter={<TextFilter {...filterProps} filteringPlaceholder="Encontrar tabelas pelo nome" countText={filterCountText(filteredItemsCount)} />}
        pagination={<Pagination {...paginationProps} />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Nome',
            sortingField: 'name',
            cell: (t) => (
              <Link href={`/dynamodb/tables/${encodeURIComponent(t.name)}`} onFollow={follow}>
                {t.name}
              </Link>
            ),
          },
          { id: 'status', header: 'Status', sortingField: 'status', cell: (t) => <TableStatus status={t.status} /> },
          { id: 'pk', header: 'Chave de partição', cell: (t) => t.partitionKey ?? '-' },
          { id: 'sk', header: 'Chave de classificação', cell: (t) => t.sortKey ?? '-' },
          { id: 'indexes', header: 'Índices', sortingField: 'indexes', cell: (t) => t.indexes },
          { id: 'billing', header: 'Modo de capacidade', cell: (t) => billingLabel(t.billingMode) },
          { id: 'items', header: 'Itens', sortingField: 'itemCount', cell: (t) => formatNumber(t.itemCount) },
        ]}
      />

      <DeleteModal
        visible={toDelete !== null}
        title="Excluir tabela"
        confirmationText="confirmar"
        description={
          <>
            A tabela <b>{toDelete?.name}</b> e todos os seus {formatNumber(toDelete?.itemCount ?? 0)} itens serão excluídos
            permanentemente.
          </>
        }
        onConfirm={async () => {
          const name = toDelete!.name;
          await dynamodbApi.deleteTable(name);
          notifications.success(`Exclusão da tabela "${name}" iniciada.`);
          tables.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}

