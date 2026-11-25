import Box from '@cloudscape-design/components/box';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import { overviewApi } from '../../api/overview';
import { errorMessage } from '../../api/http';
import { formatDate } from '../../components/format';
import { useRemote } from '../../hooks/useRemote';
import { useFollow } from '../../layout/ConsoleLayout';
import { useServiceDirectory } from '../../layout/serviceDirectory';

interface ActivityTableProps {
  limit: number;
  title: string;
  variant: TableProps['variant'];
}

/** Resumo das ações recentes, com link para o histórico completo. */
export function ActivityTable({ limit, title, variant }: ActivityTableProps) {
  const follow = useFollow();
  const { serviceName } = useServiceDirectory();
  const activity = useRemote((signal) => overviewApi.activity(limit, signal), [limit]);

  return (
    <Table
      variant={variant}
      header={
        <Header variant="h2" info={<Link href="/activity" onFollow={follow}>Ver tudo</Link>}>
          {title}
        </Header>
      }
      loading={activity.loading && !activity.data}
      loadingText="Carregando atividade"
      items={activity.data?.entries ?? []}
      columnDefinitions={[
        { id: 'at', header: 'Quando', cell: (e) => formatDate(e.at) },
        { id: 'service', header: 'Serviço', cell: (e) => serviceName(e.service) },
        { id: 'action', header: 'Ação', cell: (e) => e.action },
        { id: 'target', header: 'Recurso', cell: (e) => e.target },
        {
          id: 'outcome',
          header: 'Resultado',
          cell: (e) => (e.outcome === 'success' ? <StatusIndicator>Sucesso</StatusIndicator> : <StatusIndicator type="error">Falha</StatusIndicator>),
        },
      ]}
      empty={
        <Box textAlign="center" color="inherit">
          {activity.error ? errorMessage(activity.error) : 'Nenhuma ação registrada'}
        </Box>
      }
    />
  );
}
