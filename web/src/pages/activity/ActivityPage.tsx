import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import { overviewApi } from '../../api/overview';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { filterCountText, useConsoleCollection } from '../../components/useConsoleCollection';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useServiceDirectory } from '../../layout/serviceDirectory';

export function ActivityPage() {
  const { serviceName } = useServiceDirectory();
  useBreadcrumbs([
    { text: 'Console', href: '/' },
    { text: 'Atividade recente', href: '/activity' },
  ]);
  const activity = useRemote((signal) => overviewApi.activity(500, signal), []);
  const { items, collectionProps, filterProps, filteredItemsCount, paginationProps } = useConsoleCollection(activity.data?.entries ?? [], {
    resourceName: 'atividade',
    empty: <EmptyState title="Nenhuma ação registrada" subtitle="As ações feitas pelo painel aparecem aqui." />,
    pageSize: 50,
  });

  if (activity.error) return <LoadError error={activity.error} onRetry={activity.reload} />;

  return (
    <Table
      {...collectionProps}
      variant="full-page"
      header={
        <Header variant="awsui-h1-sticky" counter={`(${activity.data?.entries.length ?? 0})`} description="Últimas 500 ações feitas pelo painel" actions={<Button iconName="refresh" ariaLabel="Atualizar" onClick={activity.reload} />}>
          Atividade recente
        </Header>
      }
      loading={activity.loading}
      loadingText="Carregando atividade"
      items={items}
      filter={<TextFilter {...filterProps} filteringPlaceholder="Filtrar atividade" countText={filterCountText(filteredItemsCount)} />}
      pagination={<Pagination {...paginationProps} />}
      columnDefinitions={[
        { id: 'at', header: 'Quando', cell: (e) => formatDate(e.at), sortingField: 'at' },
        { id: 'service', header: 'Serviço', cell: (e) => serviceName(e.service), sortingField: 'service' },
        { id: 'action', header: 'Ação', cell: (e) => e.action, sortingField: 'action' },
        { id: 'target', header: 'Recurso', cell: (e) => e.target },
        {
          id: 'outcome',
          header: 'Resultado',
          cell: (e) => (e.outcome === 'success' ? <StatusIndicator>Sucesso</StatusIndicator> : <StatusIndicator type="error">Falha</StatusIndicator>),
        },
        { id: 'message', header: 'Detalhe', cell: (e) => e.message ?? '-' },
      ]}
    />
  );
}
