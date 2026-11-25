import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { logsApi, type LogGroupSummary } from '../../api/logs';
import { DeleteModal } from '../../components/DeleteModal';
import { formatBytes, formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { retentionLabel, retentionOptions } from './retention';

export const LOGS_BREADCRUMB = { text: 'CloudWatch', href: '/logs/groups' };
// Nomes de grupo têm "/", por isso vão na query string.
export const logGroupHref = (name: string) => `/logs/group?name=${encodeURIComponent(name)}`;

const GROUP_NAME = /^[.\-_/#A-Za-z0-9]{1,512}$/;

export function LogGroupsPage() {
  useBreadcrumbs([LOGS_BREADCRUMB, { text: 'Grupos de logs', href: '/logs/groups' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const groups = useRemote((signal) => logsApi.groups(signal), []);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<LogGroupSummary | null>(null);
  const [name, setName] = useState('');
  const [retention, setRetention] = useState<number | null>(null);

  return (
    <>
      <ResourceTable
        title="Grupos de logs"
        description="Funções Lambda criam o grupo /aws/lambda/<nome> na primeira execução."
        resourceName="grupos de logs"
        items={groups.data?.groups}
        loading={groups.loading}
        error={groups.error}
        onRetry={groups.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum grupo de logs" action={<Button onClick={() => setCreating(true)}>Criar grupo de logs</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={groups.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar grupo de logs
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Grupo de logs', sortingField: 'name', cell: (g) => <Link href={logGroupHref(g.name)} onFollow={follow}>{g.name}</Link> },
          { id: 'retention', header: 'Retenção', cell: (g) => retentionLabel(g.retentionDays) },
          { id: 'stored', header: 'Bytes armazenados', sortingField: 'storedBytes', cell: (g) => formatBytes(g.storedBytes) },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (g) => formatDate(g.createdAt) },
        ]}
      />
      <FormModal
        visible={creating}
        title="Criar grupo de logs"
        submitLabel="Criar"
        canSubmit={GROUP_NAME.test(name)}
        onSubmit={async () => {
          await logsApi.createGroup(name, retention);
          notifications.success(`Grupo "${name}" criado.`);
          setName('');
          groups.reload();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Nome do grupo de logs" constraintText="Letras, números e . - _ / #">
          <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="/minha-app/api" autoFocus />
        </FormField>
        <FormField label="Configuração de retenção">
          <Select
            selectedOption={retentionOptions.find((o) => o.value === String(retention ?? '')) ?? null}
            onChange={({ detail }) => setRetention(detail.selectedOption.value ? Number(detail.selectedOption.value) : null)}
            options={retentionOptions}
          />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir grupo de logs"
        confirmationText="excluir"
        description={<>O grupo <b>{toDelete?.name}</b> e todos os seus eventos serão excluídos permanentemente.</>}
        onConfirm={async () => {
          await logsApi.deleteGroup(toDelete!.name);
          notifications.success(`Grupo "${toDelete!.name}" excluído.`);
          groups.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
