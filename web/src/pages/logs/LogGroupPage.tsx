import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Link from '@cloudscape-design/components/link';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logsApi } from '../../api/logs';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { logGroupHref, LOGS_BREADCRUMB } from './LogGroupsPage';
import { retentionLabel, retentionOptions } from './retention';

export const logStreamHref = (group: string, stream: string) =>
  `/logs/stream?group=${encodeURIComponent(group)}&stream=${encodeURIComponent(stream)}`;

export function LogGroupPage() {
  const name = useSearchParams()[0].get('name') ?? '';
  const follow = useFollow();
  const notifications = useNotifications();
  useBreadcrumbs([LOGS_BREADCRUMB, { text: 'Grupos de logs', href: '/logs/groups' }, { text: name, href: logGroupHref(name) }]);
  const streams = useRemote((signal) => logsApi.streams(name, signal), [name]);
  const groups = useRemote((signal) => logsApi.groups(signal), []);
  const group = groups.data?.groups.find((g) => g.name === name);
  const [editing, setEditing] = useState(false);
  const [retention, setRetention] = useState<number | null>(null);

  return (
    <>
      <ResourceTable
        title={name}
        description={`Retenção: ${retentionLabel(group?.retentionDays ?? null)}`}
        resourceName="fluxos de logs"
        items={streams.data?.streams}
        loading={streams.loading}
        error={streams.error}
        onRetry={streams.reload}
        trackBy="name"
        selectionType="none"
        empty={<EmptyState title="Nenhum fluxo de logs" subtitle="Os fluxos aparecem quando a aplicação escreve logs." />}
        actions={() => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={streams.reload} />
            <Button
              onClick={() => {
                setRetention(group?.retentionDays ?? null);
                setEditing(true);
              }}
            >
              Editar retenção
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Fluxo de logs', cell: (s) => <Link href={logStreamHref(name, s.name)} onFollow={follow}>{s.name}</Link> },
          { id: 'last', header: 'Hora do último evento', sortingField: 'lastEventAt', cell: (s) => formatDate(s.lastEventAt) },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (s) => formatDate(s.createdAt) },
        ]}
      />
      <FormModal
        visible={editing}
        title="Editar configuração de retenção"
        submitLabel="Salvar"
        onSubmit={async () => {
          await logsApi.setRetention(name, retention);
          notifications.success('Retenção atualizada.');
          groups.reload();
        }}
        onDismiss={() => setEditing(false)}
      >
        <FormField label="Expirar eventos após">
          <Select
            selectedOption={retentionOptions.find((o) => o.value === String(retention ?? '')) ?? null}
            onChange={({ detail }) => setRetention(detail.selectedOption.value ? Number(detail.selectedOption.value) : null)}
            options={retentionOptions}
          />
        </FormField>
      </FormModal>
    </>
  );
}
