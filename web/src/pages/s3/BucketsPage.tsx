import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Pagination from '@cloudscape-design/components/pagination';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import Alert from '@cloudscape-design/components/alert';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { s3Api, type BucketSummary } from '../../api/s3';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatBytes, formatDate, formatNumber } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { filterCountText, useConsoleCollection } from '../../components/useConsoleCollection';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const S3_BREADCRUMB = { text: 'Amazon S3', href: '/s3/buckets' };

type PendingAction = { kind: 'delete' | 'empty'; bucket: BucketSummary } | null;

export function BucketsPage() {
  useBreadcrumbs([S3_BREADCRUMB, { text: 'Buckets', href: '/s3/buckets' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const buckets = useRemote((signal) => s3Api.listBuckets(signal), []);
  const [pending, setPending] = useState<PendingAction>(null);

  const createButton = <Button onClick={() => navigate('/s3/create-bucket')}>Criar bucket</Button>;
  const { items, collectionProps, filterProps, filteredItemsCount, paginationProps } = useConsoleCollection(buckets.data?.buckets ?? [], {
    resourceName: 'buckets',
    empty: <EmptyState title="Nenhum bucket" subtitle="Você não tem buckets." action={createButton} />,
    defaultSortField: 'name',
  });
  const selected = collectionProps.selectedItems?.[0];

  if (buckets.error) return <LoadError error={buckets.error} onRetry={buckets.reload} />;

  return (
    <>
      <Table
        {...collectionProps}
        variant="full-page"
        selectionType="single"
        trackBy="name"
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${buckets.data?.buckets.length ?? 0})`}
            description="Buckets são contêineres para dados armazenados no S3."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Atualizar" onClick={buckets.reload} />
                <Button disabled={!selected} onClick={() => selected && setPending({ kind: 'empty', bucket: selected })}>
                  Esvaziar
                </Button>
                <Button disabled={!selected} onClick={() => selected && setPending({ kind: 'delete', bucket: selected })}>
                  Excluir
                </Button>
                <Button variant="primary" onClick={() => navigate('/s3/create-bucket')}>
                  Criar bucket
                </Button>
              </SpaceBetween>
            }
          >
            Buckets de uso geral
          </Header>
        }
        loading={buckets.loading}
        loadingText="Carregando buckets"
        items={items}
        filter={<TextFilter {...filterProps} filteringPlaceholder="Encontrar buckets pelo nome" countText={filterCountText(filteredItemsCount)} />}
        pagination={<Pagination {...paginationProps} />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Nome',
            sortingField: 'name',
            cell: (b) => (
              <Link href={`/s3/buckets/${encodeURIComponent(b.name)}`} onFollow={follow}>
                {b.name}
              </Link>
            ),
          },
          { id: 'region', header: 'Região da AWS', cell: () => 'Leste dos EUA (Norte da Virgínia) us-east-1' },
          { id: 'objects', header: 'Objetos', sortingField: 'objectCount', cell: (b) => formatNumber(b.objectCount) },
          { id: 'size', header: 'Tamanho', sortingField: 'totalSize', cell: (b) => formatBytes(b.totalSize) },
          { id: 'created', header: 'Data de criação', sortingField: 'createdAt', cell: (b) => formatDate(b.createdAt) },
        ]}
      />

      <DeleteModal
        visible={pending?.kind === 'delete'}
        title="Excluir bucket"
        confirmationText={pending?.bucket.name ?? ''}
        description={
          pending && pending.bucket.objectCount > 0 ? (
            <Alert type="warning" header="Este bucket não está vazio">
              Buckets precisam estar vazios para serem excluídos. Use <b>Esvaziar</b> antes.
            </Alert>
          ) : (
            <>Excluir o bucket <b>{pending?.bucket.name}</b> não pode ser desfeito.</>
          )
        }
        onConfirm={async () => {
          const name = pending!.bucket.name;
          await s3Api.deleteBucket(name);
          notifications.success(`Bucket "${name}" excluído.`);
          buckets.reload();
        }}
        onDismiss={() => setPending(null)}
      />

      <DeleteModal
        visible={pending?.kind === 'empty'}
        title="Esvaziar bucket"
        actionLabel="Esvaziar"
        confirmationText="excluir permanentemente"
        description={
          <>
            Todos os {formatNumber(pending?.bucket.objectCount ?? 0)} objetos de <b>{pending?.bucket.name}</b> serão excluídos
            permanentemente.
          </>
        }
        onConfirm={async () => {
          const name = pending!.bucket.name;
          const { deleted } = await s3Api.emptyBucket(name);
          notifications.success(`Bucket "${name}" esvaziado: ${formatNumber(deleted)} objetos excluídos.`);
          buckets.reload();
        }}
        onDismiss={() => setPending(null)}
      />
    </>
  );
}
