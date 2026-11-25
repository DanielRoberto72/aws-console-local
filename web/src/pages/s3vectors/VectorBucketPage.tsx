import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import RadioGroup from '@cloudscape-design/components/radio-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { vectorsApi, type DistanceMetric, type VectorIndex } from '../../api/s3vectors';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { parseIntInRange } from '../lambda/validation';
import { VECTOR_NAME, VECTOR_NAME_HINT, vectorBucketHref, VECTORS_BREADCRUMB } from './VectorBucketsPage';

export const vectorIndexHref = (bucket: string, index: string) => `${vectorBucketHref(bucket)}/indexes/${encodeURIComponent(index)}`;
export const metricLabel = (metric: string) => (metric === 'euclidean' ? 'Euclidiana' : 'Cosseno');

export function VectorBucketPage() {
  const bucket = useParams().bucket!;
  const follow = useFollow();
  const notifications = useNotifications();
  useBreadcrumbs([VECTORS_BREADCRUMB, { text: 'Buckets de vetores', href: '/s3vectors/buckets' }, { text: bucket, href: vectorBucketHref(bucket) }]);
  const indexes = useRemote((signal) => vectorsApi.indexes(bucket, signal), [bucket]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [dimension, setDimension] = useState('1024');
  const [metric, setMetric] = useState<DistanceMetric>('cosine');
  const [toDelete, setToDelete] = useState<VectorIndex | null>(null);
  const dimensionValue = parseIntInRange(dimension, 1, 4096, 'dimensões');

  return (
    <>
      <ResourceTable
        title={bucket}
        description="Índices de vetores"
        resourceName="índices"
        items={indexes.data?.indexes}
        loading={indexes.loading}
        error={indexes.error}
        onRetry={indexes.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum índice" action={<Button onClick={() => setCreating(true)}>Criar índice de vetores</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={indexes.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar índice de vetores
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome do índice', sortingField: 'name', cell: (i) => <Link href={vectorIndexHref(bucket, i.name)} onFollow={follow}>{i.name}</Link> },
          { id: 'dimension', header: 'Dimensão', sortingField: 'dimension', cell: (i) => i.dimension },
          { id: 'metric', header: 'Métrica de distância', cell: (i) => metricLabel(i.distanceMetric) },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (i) => formatDate(i.createdAt) },
        ]}
      />
      <FormModal
        visible={creating}
        title="Criar índice de vetores"
        submitLabel="Criar índice"
        canSubmit={VECTOR_NAME.test(name) && typeof dimensionValue === 'number'}
        onSubmit={async () => {
          await vectorsApi.createIndex(bucket, { name, dimension: dimensionValue as number, distanceMetric: metric });
          notifications.success(`Índice "${name}" criado.`);
          setName('');
          indexes.reload();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Nome do índice" constraintText={VECTOR_NAME_HINT}>
          <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
        </FormField>
        <FormField
          label="Dimensão"
          description="Deve ser igual ao tamanho dos embeddings do seu modelo (ex.: 1024 para Titan Text Embeddings V2)."
          errorText={typeof dimensionValue === 'string' ? dimensionValue : null}
        >
          <Input value={dimension} onChange={({ detail }) => setDimension(detail.value)} inputMode="numeric" />
        </FormField>
        <FormField label="Métrica de distância" description="Não pode ser alterada depois.">
          <RadioGroup
            value={metric}
            onChange={({ detail }) => setMetric(detail.value as DistanceMetric)}
            items={[
              { value: 'cosine', label: 'Cosseno' },
              { value: 'euclidean', label: 'Euclidiana' },
            ]}
          />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir índice de vetores"
        confirmationText={toDelete?.name ?? ''}
        description={<>O índice <b>{toDelete?.name}</b> e todos os seus vetores serão excluídos.</>}
        onConfirm={async () => {
          await vectorsApi.deleteIndex(bucket, toDelete!.name);
          notifications.success(`Índice "${toDelete!.name}" excluído.`);
          indexes.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
