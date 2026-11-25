import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Table from '@cloudscape-design/components/table';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { vectorsApi, type QueryResult } from '../../api/s3vectors';
import { CodeArea } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { parseIntInRange } from '../lambda/validation';
import { metricLabel, vectorIndexHref } from './VectorBucketPage';
import { vectorBucketHref, VECTORS_BREADCRUMB } from './VectorBucketsPage';
import { formatVector, parseMetadata, parseVector } from './vectorInput';

export function VectorIndexPage() {
  const { bucket = '', index = '' } = useParams();
  const notifications = useNotifications();
  useBreadcrumbs([
    VECTORS_BREADCRUMB,
    { text: 'Buckets de vetores', href: '/s3vectors/buckets' },
    { text: bucket, href: vectorBucketHref(bucket) },
    { text: index, href: vectorIndexHref(bucket, index) },
  ]);
  const data = useRemote((signal) => vectorsApi.index(bucket, index, signal), [bucket, index]);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState('');
  const [values, setValues] = useState('');
  const [metadata, setMetadata] = useState('');
  const [toDelete, setToDelete] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState('5');
  const [querying, setQuerying] = useState(false);
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [queryError, setQueryError] = useState<string>();

  if (data.error) return <LoadError error={data.error} onRetry={data.reload} />;
  if (!data.data) return <Spinner size="large" />;
  const { index: definition, vectors } = data.data;
  const parsedValues = parseVector(values, definition.dimension);
  const parsedMetadata = parseMetadata(metadata);
  const parsedQuery = parseVector(query, definition.dimension);
  const topKValue = parseIntInRange(topK, 1, 100, 'resultados');

  const runQuery = async () => {
    if (!parsedQuery.ok || typeof topKValue !== 'number') return;
    setQuerying(true);
    setQueryError(undefined);
    try {
      setResults((await vectorsApi.query(bucket, index, parsedQuery.values, topKValue, null)).results);
    } catch (err) {
      setQueryError(errorMessage(err));
    } finally {
      setQuerying(false);
    }
  };

  return (
    <ContentLayout header={<Header variant="h1">{index}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Propriedades do índice</Header>}>
          <KeyValuePairs
            columns={4}
            items={[
              { label: 'Dimensão', value: definition.dimension },
              { label: 'Métrica de distância', value: metricLabel(definition.distanceMetric) },
              { label: 'Vetores', value: vectors.length },
              { label: 'Criação', value: formatDate(definition.createdAt) },
              { label: 'ARN', value: definition.arn },
            ]}
          />
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Busca os vetores mais próximos do vetor informado."
              actions={<Button variant="primary" onClick={runQuery} loading={querying} disabled={!parsedQuery.ok || typeof topKValue !== 'number'}>Consultar</Button>}
            >
              Consultar vetores
            </Header>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Vetor de consulta" description={`${definition.dimension} números separados por vírgula.`} errorText={query && !parsedQuery.ok ? parsedQuery.error : null} stretch>
              <CodeArea value={query} onChange={setQuery} rows={3} ariaLabel="Vetor de consulta" placeholder="[0.12, -0.03, ...]" />
            </FormField>
            <FormField label="Quantidade de resultados (top K)" errorText={typeof topKValue === 'string' ? topKValue : null}>
              <Input value={topK} onChange={({ detail }) => setTopK(detail.value)} inputMode="numeric" />
            </FormField>
            {queryError && <Alert type="error">{queryError}</Alert>}
            {results && (
              <Table
                variant="embedded"
                items={results}
                columnDefinitions={[
                  { id: 'rank', header: '#', cell: (r) => results.indexOf(r) + 1 },
                  { id: 'key', header: 'Chave', cell: (r) => r.key },
                  { id: 'distance', header: 'Distância', cell: (r) => (r.distance === null ? '-' : r.distance.toFixed(6)) },
                  { id: 'metadata', header: 'Metadados', cell: (r) => (r.metadata && Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : '-') },
                ]}
                empty={<EmptyState title="Nenhum resultado" />}
              />
            )}
          </SpaceBetween>
        </Container>

        <ResourceTable
          title="Vetores"
          variant="container"
          resourceName="vetores"
          items={vectors}
          loading={data.loading}
          error={null}
          onRetry={data.reload}
          trackBy="key"
          selectionType="multi"
          empty={<EmptyState title="Nenhum vetor" action={<Button onClick={() => setAdding(true)}>Inserir vetor</Button>} />}
          actions={(selected) => (
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Atualizar" onClick={data.reload} />
              <Button disabled={selected.length === 0} onClick={() => setToDelete(selected.map((v) => v.key))}>
                Excluir
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Inserir vetor
              </Button>
            </SpaceBetween>
          )}
          columns={[
            { id: 'key', header: 'Chave', sortingField: 'key', cell: (v) => v.key },
            { id: 'values', header: 'Valores', cell: (v) => formatVector(v.values) },
            { id: 'metadata', header: 'Metadados', cell: (v) => (v.metadata && Object.keys(v.metadata).length ? JSON.stringify(v.metadata) : '-') },
          ]}
        />
      </SpaceBetween>
      <FormModal
        visible={adding}
        title="Inserir vetor"
        submitLabel="Inserir"
        size="medium"
        canSubmit={!!key.trim() && parsedValues.ok && parsedMetadata.ok}
        onSubmit={async () => {
          if (!parsedValues.ok || !parsedMetadata.ok) return;
          await vectorsApi.putVectors(bucket, index, [{ key: key.trim(), values: parsedValues.values, metadata: parsedMetadata.metadata }]);
          notifications.success(`Vetor "${key}" inserido.`);
          setKey('');
          setValues('');
          setMetadata('');
          data.reload();
        }}
        onDismiss={() => setAdding(false)}
      >
        <FormField label="Chave" description="Uma chave existente é substituída.">
          <Input value={key} onChange={({ detail }) => setKey(detail.value)} autoFocus />
        </FormField>
        <FormField label="Valores" description={`${definition.dimension} números.`} errorText={values && !parsedValues.ok ? parsedValues.error : null} stretch>
          <CodeArea value={values} onChange={setValues} rows={4} ariaLabel="Valores do vetor" />
        </FormField>
        <FormField label="Metadados (JSON) - opcional" errorText={!parsedMetadata.ok ? parsedMetadata.error : null} stretch>
          <CodeArea value={metadata} onChange={setMetadata} rows={4} ariaLabel="Metadados do vetor" placeholder='{"fonte": "manual.pdf", "pagina": 3}' />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete.length > 0}
        title="Excluir vetores"
        confirmationText="excluir"
        description={`${toDelete.length} ${toDelete.length === 1 ? 'vetor será excluído' : 'vetores serão excluídos'}.`}
        onConfirm={async () => {
          await vectorsApi.deleteVectors(bucket, index, toDelete);
          notifications.success('Vetores excluídos.');
          data.reload();
        }}
        onDismiss={() => setToDelete([])}
      />
    </ContentLayout>
  );
}
