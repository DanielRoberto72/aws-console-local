import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { ssmApi, type ParameterSummary } from '../../api/ssm';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { ParameterFormModal } from './ParameterFormModal';

export const SSM_BREADCRUMB = { text: 'Systems Manager', href: '/ssm/parameters' };
export const parameterHref = (name: string) => `/ssm/parameter?name=${encodeURIComponent(name)}`;

export const PARAMETER_TYPE_LABELS: Record<string, string> = {
  String: 'String',
  StringList: 'StringList',
  SecureString: 'SecureString',
};

export function ParametersPage() {
  useBreadcrumbs([SSM_BREADCRUMB, { text: 'Parameter Store', href: '/ssm/parameters' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const parameters = useRemote((signal) => ssmApi.list(signal), []);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ParameterSummary | null>(null);

  return (
    <>
      <ResourceTable
        title="Meus parâmetros"
        description="Parameter Store"
        resourceName="parâmetros"
        items={parameters.data?.parameters}
        loading={parameters.loading}
        error={parameters.error}
        onRetry={parameters.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum parâmetro" action={<Button onClick={() => setCreating(true)}>Criar parâmetro</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={parameters.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar parâmetro
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', sortingField: 'name', cell: (p) => <Link href={parameterHref(p.name)} onFollow={follow}>{p.name}</Link> },
          { id: 'tier', header: 'Nível', cell: (p) => p.tier },
          { id: 'type', header: 'Tipo', sortingField: 'type', cell: (p) => PARAMETER_TYPE_LABELS[p.type] ?? p.type },
          { id: 'version', header: 'Versão', sortingField: 'version', cell: (p) => p.version },
          { id: 'modified', header: 'Última modificação', sortingField: 'lastModified', cell: (p) => formatDate(p.lastModified) },
        ]}
      />
      <ParameterFormModal
        visible={creating}
        existing={null}
        onSaved={(name) => {
          notifications.success(`Parâmetro "${name}" criado.`);
          parameters.reload();
        }}
        onDismiss={() => setCreating(false)}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir parâmetro"
        confirmationText="excluir"
        description={<>O parâmetro <b>{toDelete?.name}</b> e todo o seu histórico serão excluídos.</>}
        onConfirm={async () => {
          await ssmApi.remove(toDelete!.name);
          notifications.success(`Parâmetro "${toDelete!.name}" excluído.`);
          parameters.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
