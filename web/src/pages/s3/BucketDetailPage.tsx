import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Icon from '@cloudscape-design/components/icon';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import Pagination from '@cloudscape-design/components/pagination';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import Alert from '@cloudscape-design/components/alert';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { s3Api } from '../../api/s3';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatBytes, formatDate } from '../../components/format';
import { EmptyState } from '../../components/TableStates';
import { filterCountText, useConsoleCollection } from '../../components/useConsoleCollection';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { S3_BREADCRUMB } from './BucketsPage';

/** Linha da tabela: pasta (prefixo comum) ou objeto, como no console. */
interface Entry {
  id: string;
  name: string;
  kind: 'folder' | 'object';
  size: number | null;
  lastModified: string | null;
}

const lastSegment = (path: string) => path.replace(/\/$/, '').split('/').pop() ?? path;

export function BucketDetailPage() {
  const bucket = useParams().bucket!;
  const [searchParams, setSearchParams] = useSearchParams();
  const prefix = searchParams.get('prefix') ?? '';
  const follow = useFollow();
  const notifications = useNotifications();
  const [modal, setModal] = useState<'upload' | 'folder' | 'delete' | null>(null);

  const folderHref = (target: string) => `/s3/buckets/${encodeURIComponent(bucket)}${target ? `?prefix=${encodeURIComponent(target)}` : ''}`;
  const folders = prefix.split('/').filter(Boolean);
  useBreadcrumbs([
    S3_BREADCRUMB,
    { text: 'Buckets', href: '/s3/buckets' },
    { text: bucket, href: folderHref('') },
    ...folders.map((folder, i) => ({ text: folder, href: folderHref(`${folders.slice(0, i + 1).join('/')}/`) })),
  ]);

  const listing = useRemote((signal) => s3Api.listObjects(bucket, prefix, signal), [bucket, prefix]);
  const entries = useMemo<Entry[]>(
    () => [
      ...(listing.data?.prefixes ?? []).map((p) => ({ id: p, name: lastSegment(p), kind: 'folder' as const, size: null, lastModified: null })),
      ...(listing.data?.objects ?? []).map((o) => ({ id: o.key, name: lastSegment(o.key), kind: 'object' as const, size: o.size, lastModified: o.lastModified })),
    ],
    [listing.data],
  );

  const { items, collectionProps, filterProps, filteredItemsCount, paginationProps, actions } = useConsoleCollection(entries, {
    resourceName: 'objetos',
    empty: (
      <EmptyState
        title="Nenhum objeto"
        subtitle={prefix ? 'Esta pasta está vazia.' : 'Este bucket está vazio. Carregue arquivos para começar.'}
        action={<Button onClick={() => setModal('upload')}>Carregar</Button>}
      />
    ),
    pageSize: 50,
  });
  const selected = collectionProps.selectedItems ?? [];
  const singleObject = selected.length === 1 && selected[0]?.kind === 'object' ? selected[0] : undefined;

  const afterChange = () => {
    actions.setSelectedItems([]);
    listing.reload();
  };

  if (listing.error) return <LoadError error={listing.error} onRetry={listing.reload} />;

  return (
    <>
      <Table
        {...collectionProps}
        variant="full-page"
        selectionType="multi"
        trackBy="id"
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${entries.length})`}
            description={prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Atualizar" onClick={listing.reload} />
                <Button
                  iconName="download"
                  disabled={!singleObject}
                  href={singleObject ? s3Api.downloadUrl(bucket, singleObject.id) : undefined}
                  download={singleObject?.name}
                >
                  Baixar
                </Button>
                <Button disabled={selected.length === 0} onClick={() => setModal('delete')}>
                  Excluir
                </Button>
                <Button onClick={() => setModal('folder')}>Criar pasta</Button>
                <Button variant="primary" iconName="upload" onClick={() => setModal('upload')}>
                  Carregar
                </Button>
              </SpaceBetween>
            }
          >
            {prefix ? lastSegment(prefix) : bucket}
          </Header>
        }
        loading={listing.loading}
        loadingText="Carregando objetos"
        items={items}
        filter={<TextFilter {...filterProps} filteringPlaceholder="Encontrar objetos pelo nome" countText={filterCountText(filteredItemsCount)} />}
        pagination={<Pagination {...paginationProps} />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Nome',
            sortingField: 'name',
            cell: (e) =>
              e.kind === 'folder' ? (
                <Link href={folderHref(e.id)} onFollow={follow}>
                  <Icon name="folder" /> {e.name}/
                </Link>
              ) : (
                <span>
                  <Icon name="file" /> {e.name}
                </span>
              ),
          },
          { id: 'type', header: 'Tipo', cell: (e) => (e.kind === 'folder' ? 'Pasta' : e.name.includes('.') ? e.name.split('.').pop() : '-') },
          { id: 'modified', header: 'Última modificação', sortingField: 'lastModified', cell: (e) => formatDate(e.lastModified) },
          { id: 'size', header: 'Tamanho', sortingField: 'size', cell: (e) => (e.size === null ? '-' : formatBytes(e.size)) },
        ]}
      />

      <UploadModal
        visible={modal === 'upload'}
        bucket={bucket}
        prefix={prefix}
        onDismiss={() => setModal(null)}
        onUploaded={(count) => {
          notifications.success(`${count} ${count === 1 ? 'arquivo carregado' : 'arquivos carregados'} em s3://${bucket}/${prefix}`);
          afterChange();
        }}
      />

      <CreateFolderModal
        visible={modal === 'folder'}
        bucket={bucket}
        prefix={prefix}
        onDismiss={() => setModal(null)}
        onCreated={(name) => {
          notifications.success(`Pasta "${name}" criada.`);
          afterChange();
        }}
      />

      <DeleteModal
        visible={modal === 'delete'}
        title="Excluir objetos"
        confirmationText="excluir permanentemente"
        description={
          <SpaceBetween size="s">
            <span>
              {selected.length} {selected.length === 1 ? 'item selecionado será excluído' : 'itens selecionados serão excluídos'} permanentemente.
            </span>
            {selected.some((e) => e.kind === 'folder') && (
              <Alert type="warning">Excluir uma pasta exclui todos os objetos dentro dela.</Alert>
            )}
          </SpaceBetween>
        }
        onConfirm={async () => {
          const { deleted } = await s3Api.deleteObjects(
            bucket,
            selected.filter((e) => e.kind === 'object').map((e) => e.id),
            selected.filter((e) => e.kind === 'folder').map((e) => e.id),
          );
          notifications.success(`${deleted} ${deleted === 1 ? 'objeto excluído' : 'objetos excluídos'}.`);
          afterChange();
        }}
        onDismiss={() => setModal(null)}
      />
    </>
  );
}

interface UploadModalProps {
  visible: boolean;
  bucket: string;
  prefix: string;
  onDismiss: () => void;
  onUploaded: (count: number) => void;
}

function UploadModal({ visible, bucket, prefix, onDismiss, onUploaded }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const close = () => {
    if (submitting) return;
    setFiles([]);
    setError(undefined);
    onDismiss();
  };

  const upload = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const { uploaded } = await s3Api.upload(bucket, prefix, files);
      onUploaded(uploaded.length);
      setFiles([]);
      onDismiss();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={close}
      header="Carregar arquivos"
      size="medium"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={upload} disabled={files.length === 0} loading={submitting}>
              Carregar
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <FormField label="Arquivos" description={`Destino: s3://${bucket}/${prefix}`} constraintText="Até 200 MB por arquivo.">
          <FileUpload
            multiple
            value={files}
            onChange={({ detail }) => setFiles(detail.value)}
            showFileSize
            showFileLastModified
            tokenLimit={5}
            i18nStrings={{
              uploadButtonText: (multiple) => (multiple ? 'Escolher arquivos' : 'Escolher arquivo'),
              dropzoneText: (multiple) => (multiple ? 'Solte os arquivos aqui' : 'Solte o arquivo aqui'),
              removeFileAriaLabel: (index) => `Remover arquivo ${index + 1}`,
              limitShowFewer: 'Mostrar menos',
              limitShowMore: 'Mostrar mais',
              errorIconAriaLabel: 'Erro',
              warningIconAriaLabel: 'Aviso',
            }}
          />
        </FormField>
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  );
}

interface CreateFolderModalProps {
  visible: boolean;
  bucket: string;
  prefix: string;
  onDismiss: () => void;
  onCreated: (name: string) => void;
}

function CreateFolderModal({ visible, bucket, prefix, onDismiss, onCreated }: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const invalid = name.includes('/') ? 'O nome da pasta não pode conter "/".' : null;

  const close = () => {
    if (submitting) return;
    setName('');
    setError(undefined);
    onDismiss();
  };

  const create = async () => {
    if (!name || invalid) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await s3Api.createFolder(bucket, `${prefix}${name}/`);
      onCreated(name);
      setName('');
      onDismiss();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={close}
      header="Criar pasta"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={create} disabled={!name || !!invalid} loading={submitting}>
              Criar pasta
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <SpaceBetween size="m">
          <FormField label="Nome da pasta" errorText={invalid}>
            <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
          </FormField>
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      </form>
    </Modal>
  );
}
