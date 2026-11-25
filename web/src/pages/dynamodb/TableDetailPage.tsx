import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Table from '@cloudscape-design/components/table';
import Tabs from '@cloudscape-design/components/tabs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dynamodbApi, type TableDetail, type WireItem } from '../../api/dynamodb';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate, formatNumber } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { ItemEditorModal } from './ItemEditorModal';
import { displayValue, itemColumns, itemKey } from './itemDisplay';
import { DYNAMODB_BREADCRUMB } from './TablesPage';
import { TableStatus, billingLabel } from './TableStatus';

const TRANSITION_POLL_MS = 2_000;

export function TableDetailPage() {
  const tableName = useParams().table!;
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([
    DYNAMODB_BREADCRUMB,
    { text: 'Tabelas', href: '/dynamodb/tables' },
    { text: tableName, href: `/dynamodb/tables/${encodeURIComponent(tableName)}` },
  ]);
  const detail = useRemote((signal) => dynamodbApi.getTable(tableName, signal), [tableName]);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const status = detail.data?.summary.status;
  usePolling(detail.reload, TRANSITION_POLL_MS, !!status && status !== 'ACTIVE');

  if (detail.error) return <LoadError error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Spinner size="large" />;
  const table = detail.data;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={detail.reload} />
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button variant="primary" disabled={status !== 'ACTIVE'} onClick={() => setActiveTab('items')}>
                Explorar itens da tabela
              </Button>
            </SpaceBetween>
          }
        >
          {tableName}
        </Header>
      }
    >
      <Tabs
        activeTabId={activeTab}
        onChange={({ detail: d }) => setActiveTab(d.activeTabId)}
        tabs={[
          { id: 'overview', label: 'Visão geral', content: <Overview table={table} /> },
          {
            id: 'items',
            label: 'Explorar itens',
            disabled: status !== 'ACTIVE',
            content: <ItemsExplorer table={table} onChanged={detail.reload} />,
          },
        ]}
      />
      <DeleteModal
        visible={deleting}
        title="Excluir tabela"
        confirmationText="confirmar"
        description={<>A tabela <b>{tableName}</b> e todos os seus itens serão excluídos permanentemente.</>}
        onConfirm={async () => {
          await dynamodbApi.deleteTable(tableName);
          notifications.success(`Exclusão da tabela "${tableName}" iniciada.`);
          navigate('/dynamodb/tables');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}

function Overview({ table }: { table: TableDetail }) {
  const { summary } = table;
  const typeOf = (name: string | null) => table.attributeDefinitions.find((a) => a.AttributeName === name)?.AttributeType;
  const keyLabel = (name: string | null) => (name ? `${name} (${typeOf(name) ?? '?'})` : '-');
  return (
    <Container header={<Header variant="h2">Informações gerais</Header>}>
      <KeyValuePairs
        columns={3}
        items={[
          { label: 'Chave de partição', value: keyLabel(summary.partitionKey) },
          { label: 'Chave de classificação', value: keyLabel(summary.sortKey) },
          { label: 'Modo de capacidade', value: billingLabel(summary.billingMode) },
          { label: 'Status da tabela', value: <TableStatus status={summary.status} /> },
          { label: 'Quantidade de itens', value: formatNumber(summary.itemCount) },
          { label: 'Data de criação', value: formatDate(summary.createdAt) },
          { label: 'Índices secundários globais', value: table.globalSecondaryIndexes.join(', ') || '-' },
          { label: 'Índices secundários locais', value: table.localSecondaryIndexes.join(', ') || '-' },
          { label: 'Nome do recurso da Amazon (ARN)', value: <Box variant="code">{table.arn ?? '-'}</Box> },
        ]}
      />
    </Container>
  );
}

interface Row {
  id: string;
  item: WireItem;
}

function ItemsExplorer({ table, onChanged }: { table: TableDetail; onChanged: () => void }) {
  const notifications = useNotifications();
  const { summary } = table;
  const keyAttributes = useMemo(
    () =>
      [summary.partitionKey, summary.sortKey]
        .filter((n): n is string => !!n)
        .map((name) => ({ name, type: table.attributeDefinitions.find((a) => a.AttributeName === name)?.AttributeType ?? 'S' })),
    [summary.partitionKey, summary.sortKey, table.attributeDefinitions],
  );
  const keyNames = useMemo(() => keyAttributes.map((k) => k.name), [keyAttributes]);

  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState<Row[]>([]);
  const [editing, setEditing] = useState<WireItem | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const [version, setVersion] = useState(0);

  const toRows = (items: WireItem[]) => items.map((item) => ({ id: JSON.stringify(itemKey(item, keyNames)), item }));

  // Primeira página (e recarga após alterações); "Carregar mais" acrescenta as próximas.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    dynamodbApi
      .scan(summary.name, null, controller.signal)
      .then((page) => {
        setRows(toRows(page.items));
        setCursor(page.nextCursor);
        setSelected([]);
      })
      .catch((err: unknown) => !controller.signal.aborted && setError(err))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.name, version]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await dynamodbApi.scan(summary.name, cursor);
      setRows((current) => [...current, ...toRows(page.items)]);
      setCursor(page.nextCursor);
    } catch (err) {
      notifications.failure('Falha ao carregar mais itens', err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    setVersion((v) => v + 1);
    onChanged();
  };

  const columns = itemColumns(rows.map((r) => r.item), keyNames);

  if (error) return <LoadError error={error} onRetry={() => setVersion((v) => v + 1)} />;

  return (
    <>
      <Table
        variant="container"
        selectionType="multi"
        trackBy="id"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        header={
          <Header
            variant="h2"
            counter={`(${rows.length}${cursor ? '+' : ''})`}
            description="Resultado do scan da tabela, 50 itens por vez."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Atualizar" onClick={() => setVersion((v) => v + 1)} />
                <Button disabled={selected.length !== 1} onClick={() => setEditing(selected[0]!.item)}>
                  Editar
                </Button>
                <Button disabled={selected.length === 0} onClick={() => setDeleting(true)}>
                  Excluir itens
                </Button>
                <Button variant="primary" onClick={() => setEditing(null)}>
                  Criar item
                </Button>
              </SpaceBetween>
            }
          >
            Itens retornados
          </Header>
        }
        loading={loading && rows.length === 0}
        loadingText="Executando scan"
        items={rows}
        columnDefinitions={columns.map((name) => ({
          id: name,
          header: keyNames.includes(name) ? `${name} (chave)` : name,
          cell: (row: Row) => displayValue(row.item[name]),
        }))}
        empty={<EmptyState title="Nenhum item" subtitle="A tabela está vazia." />}
        footer={
          cursor && (
            <Box textAlign="center">
              <Button variant="link" loading={loading} onClick={loadMore}>
                Carregar mais
              </Button>
            </Box>
          )
        }
      />

      <ItemEditorModal
        visible={editing !== undefined}
        item={editing ?? null}
        keyAttributes={keyAttributes}
        onDismiss={() => setEditing(undefined)}
        onSave={async (item) => {
          await dynamodbApi.putItem(summary.name, item);
          notifications.success('Item salvo.');
          refresh();
        }}
      />

      <DeleteModal
        visible={deleting}
        title="Excluir itens"
        confirmationText="excluir"
        description={`${selected.length} ${selected.length === 1 ? 'item será excluído' : 'itens serão excluídos'} permanentemente.`}
        onConfirm={async () => {
          try {
            const { deleted } = await dynamodbApi.deleteItems(summary.name, selected.map((r) => itemKey(r.item, keyNames)));
            notifications.success(`${deleted} ${deleted === 1 ? 'item excluído' : 'itens excluídos'}.`);
          } finally {
            refresh();
          }
        }}
        onDismiss={() => setDeleting(false)}
      />
    </>
  );
}

