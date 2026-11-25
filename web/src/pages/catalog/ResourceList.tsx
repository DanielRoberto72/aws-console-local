import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import type { TableProps } from '@cloudscape-design/components/table';
import { useState } from 'react';
import { catalogApi, type ResourceRow, type TypeMeta } from '../../api/catalog';
import { DeleteModal } from '../../components/DeleteModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { CreateResourceModal } from './CreateResourceModal';
import { formatAttribute } from './fields';

export const itemHref = (service: string, type: string, id: string, parentId?: string) =>
  `/c/${service}/${type}/item?id=${encodeURIComponent(id)}${parentId ? `&parent=${encodeURIComponent(parentId)}` : ''}`;

interface ResourceListProps {
  service: string;
  type: TypeMeta;
  parentId?: string;
  variant: 'full-page' | 'container';
}

/** Tabela de um tipo do catálogo, com criar e excluir. */
export function ResourceList({ service, type, parentId, variant }: ResourceListProps) {
  const follow = useFollow();
  const notifications = useNotifications();
  const rows = useRemote((signal) => catalogApi.list(service, type.key, parentId, signal), [service, type.key, parentId]);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ResourceRow | null>(null);
  const hasStatus = rows.data?.rows.some((r) => r.status) ?? false;
  const showId = rows.data?.rows.some((r) => r.id !== r.name) ?? false;

  const createButton = type.create && (
    <Button variant="primary" onClick={() => setCreating(true)}>
      {type.create.label ?? `Criar ${type.singular}`}
    </Button>
  );

  const columns: TableProps.ColumnDefinition<ResourceRow>[] = [
    {
      id: 'name',
      header: 'Nome',
      sortingField: 'name',
      cell: (row) => (
        <Link href={itemHref(service, type.key, row.id, parentId)} onFollow={follow}>
          {row.name}
        </Link>
      ),
    },
    ...(showId ? [{ id: 'id', header: 'ID', cell: (row: ResourceRow) => row.id }] : []),
    ...(hasStatus
      ? [{ id: 'status', header: 'Status', cell: (row: ResourceRow) => (row.status ? <StatusIndicator type={row.status.tone}>{row.status.label}</StatusIndicator> : '-') }]
      : []),
    ...type.columns.map((column) => ({ id: column.key, header: column.label, cell: (row: ResourceRow) => formatAttribute(row.attrs[column.key]) })),
  ];

  return (
    <>
      <ResourceTable
        title={type.label}
        description={variant === 'full-page' ? type.description : undefined}
        variant={variant}
        resourceName={type.label.toLowerCase()}
        items={rows.data?.rows}
        loading={rows.loading}
        error={rows.error}
        onRetry={rows.reload}
        trackBy="id"
        defaultSortField="name"
        selectionType={type.remove ? 'single' : 'none'}
        empty={<EmptyState title={`Nenhum(a) ${type.singular}`} action={createButton} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={rows.reload} />
            {type.remove && (
              <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
                {type.remove.label ?? 'Excluir'}
              </Button>
            )}
            {createButton}
          </SpaceBetween>
        )}
        columns={columns}
      />
      {type.create && (
        <CreateResourceModal service={service} type={type} parentId={parentId} visible={creating} onDismiss={() => setCreating(false)} onCreated={rows.reload} />
      )}
      {type.remove && (
        <DeleteModal
          visible={toDelete !== null}
          title={`${type.remove.label ?? 'Excluir'}: ${toDelete?.name ?? ''}`}
          confirmationText="confirmar"
          actionLabel={type.remove.label ?? 'Excluir'}
          description={
            <>
              {type.remove.warning ?? `O(a) ${type.singular} será excluído(a).`} Recurso: <b>{toDelete?.name}</b>
              {toDelete && toDelete.id !== toDelete.name ? ` (${toDelete.id})` : ''}.
            </>
          }
          onConfirm={async () => {
            await catalogApi.remove(service, type.key, toDelete!.id, parentId);
            notifications.success(`"${toDelete!.name}": ${(type.remove?.label ?? 'excluir').toLowerCase()} solicitado.`);
            rows.reload();
          }}
          onDismiss={() => setToDelete(null)}
        />
      )}
    </>
  );
}
