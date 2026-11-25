import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useSearchParams } from 'react-router-dom';
import { logsApi } from '../../api/logs';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { logStreamHref } from './LogGroupPage';
import { logGroupHref, LOGS_BREADCRUMB } from './LogGroupsPage';

const TAIL_POLL_MS = 5_000;

export function LogStreamPage() {
  const [params] = useSearchParams();
  const group = params.get('group') ?? '';
  const stream = params.get('stream') ?? '';
  useBreadcrumbs([
    LOGS_BREADCRUMB,
    { text: 'Grupos de logs', href: '/logs/groups' },
    { text: group, href: logGroupHref(group) },
    { text: stream, href: logStreamHref(group, stream) },
  ]);
  const events = useRemote((signal) => logsApi.events(group, stream, signal), [group, stream]);
  // Acompanha o fluxo enquanto a página está aberta, como o "tail" do console.
  usePolling(events.reload, TAIL_POLL_MS);
  const rows = (events.data?.events ?? []).map((e, i) => ({ ...e, id: String(i) }));

  return (
    <ResourceTable
      title="Eventos de log"
      description={stream}
      resourceName="eventos"
      items={events.data ? rows : undefined}
      loading={events.loading}
      error={events.error}
      onRetry={events.reload}
      trackBy="id"
      selectionType="none"
      empty={<EmptyState title="Nenhum evento" />}
      actions={() => (
        <SpaceBetween direction="horizontal" size="xs">
          <Button iconName="refresh" ariaLabel="Atualizar" onClick={events.reload} />
        </SpaceBetween>
      )}
      columns={[
        { id: 'timestamp', header: 'Carimbo de data/hora', width: 200, cell: (e) => formatDate(e.timestamp) },
        { id: 'message', header: 'Mensagem', cell: (e) => <pre className="log-output">{e.message}</pre> },
      ]}
    />
  );
}
