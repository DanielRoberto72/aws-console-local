import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lambdaApi, type FunctionSummary } from '../../api/lambda';
import { DeleteModal } from '../../components/DeleteModal';
import { formatBytes, formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { runtimeLabel } from './runtimes';

export const LAMBDA_BREADCRUMB = { text: 'Lambda', href: '/lambda/functions' };
export const functionHref = (name: string) => `/lambda/functions/${encodeURIComponent(name)}`;

export function FunctionsPage() {
  useBreadcrumbs([LAMBDA_BREADCRUMB, { text: 'Funções', href: '/lambda/functions' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const functions = useRemote((signal) => lambdaApi.list(signal), []);
  const [toDelete, setToDelete] = useState<FunctionSummary | null>(null);

  return (
    <>
      <ResourceTable
        title="Funções"
        resourceName="funções"
        items={functions.data?.functions}
        loading={functions.loading}
        error={functions.error}
        onRetry={functions.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhuma função" subtitle="Crie uma função para começar." action={<Button onClick={() => navigate('/lambda/create-function')}>Criar função</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={functions.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => navigate('/lambda/create-function')}>
              Criar função
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome da função', sortingField: 'name', cell: (f) => <Link href={functionHref(f.name)} onFollow={follow}>{f.name}</Link> },
          { id: 'runtime', header: 'Runtime', sortingField: 'runtime', cell: (f) => runtimeLabel(f.runtime) },
          { id: 'handler', header: 'Manipulador', cell: (f) => f.handler ?? '-' },
          { id: 'memory', header: 'Memória', sortingField: 'memorySize', cell: (f) => (f.memorySize ? `${f.memorySize} MB` : '-') },
          { id: 'timeout', header: 'Tempo limite', cell: (f) => (f.timeout ? `${f.timeout} s` : '-') },
          { id: 'size', header: 'Tamanho do pacote', sortingField: 'codeSize', cell: (f) => formatBytes(f.codeSize) },
          { id: 'modified', header: 'Última modificação', sortingField: 'lastModified', cell: (f) => formatDate(f.lastModified) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir função"
        confirmationText="confirmar"
        description={<>A função <b>{toDelete?.name}</b> será excluída permanentemente.</>}
        onConfirm={async () => {
          await lambdaApi.remove(toDelete!.name);
          notifications.success(`Função "${toDelete!.name}" excluída.`);
          functions.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
