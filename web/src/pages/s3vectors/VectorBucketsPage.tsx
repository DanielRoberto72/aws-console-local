import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { vectorsApi, type VectorBucket } from '../../api/s3vectors';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const VECTORS_BREADCRUMB = { text: 'S3 Vectors', href: '/s3vectors/buckets' };
export const vectorBucketHref = (bucket: string) => `/s3vectors/buckets/${encodeURIComponent(bucket)}`;
export const VECTOR_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
export const VECTOR_NAME_HINT = '3 a 63 caracteres: minúsculas, números, pontos e hifens.';

export function VectorBucketsPage() {
  useBreadcrumbs([VECTORS_BREADCRUMB, { text: 'Buckets de vetores', href: '/s3vectors/buckets' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const buckets = useRemote((signal) => vectorsApi.buckets(signal), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [toDelete, setToDelete] = useState<VectorBucket | null>(null);

  return (
    <>
      <ResourceTable
        title="Buckets de vetores"
        description="Guarde embeddings e consulte por similaridade. Os embeddings são gerados fora do emulador."
        resourceName="buckets de vetores"
        items={buckets.data?.buckets}
        loading={buckets.loading}
        error={buckets.error}
        onRetry={buckets.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum bucket de vetores" action={<Button onClick={() => setCreating(true)}>Criar bucket de vetores</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={buckets.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar bucket de vetores
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', sortingField: 'name', cell: (b) => <Link href={vectorBucketHref(b.name)} onFollow={follow}>{b.name}</Link> },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (b) => formatDate(b.createdAt) },
          { id: 'arn', header: 'ARN', cell: (b) => b.arn },
        ]}
      />
      <FormModal
        visible={creating}
        title="Criar bucket de vetores"
        submitLabel="Criar"
        canSubmit={VECTOR_NAME.test(name)}
        onSubmit={async () => {
          await vectorsApi.createBucket(name);
          notifications.success(`Bucket de vetores "${name}" criado.`);
          setName('');
          buckets.reload();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Nome do bucket de vetores" constraintText={VECTOR_NAME_HINT}>
          <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir bucket de vetores"
        confirmationText={toDelete?.name ?? ''}
        description={<>O bucket <b>{toDelete?.name}</b> precisa estar sem índices para ser excluído.</>}
        onConfirm={async () => {
          await vectorsApi.deleteBucket(toDelete!.name);
          notifications.success(`Bucket "${toDelete!.name}" excluído.`);
          buckets.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
