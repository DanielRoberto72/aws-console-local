import Badge from '@cloudscape-design/components/badge';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useNavigate } from 'react-router-dom';
import { bedrockApi } from '../../api/bedrock';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';

export const BEDROCK_BREADCRUMB = { text: 'Amazon Bedrock', href: '/bedrock/playground' };

export function ModelsPage() {
  useBreadcrumbs([BEDROCK_BREADCRUMB, { text: 'Modelos de base', href: '/bedrock/models' }]);
  const navigate = useNavigate();
  const models = useRemote((signal) => bedrockApi.models(signal), []);

  return (
    <ResourceTable
      title="Modelos de base"
      description="Catálogo do emulador. Nenhum modelo executa inferência real localmente."
      resourceName="modelos"
      items={models.data?.models}
      loading={models.loading}
      error={models.error}
      onRetry={models.reload}
      trackBy="id"
      defaultSortField="provider"
      filteringPlaceholder="Encontrar modelos por nome ou provedor"
      empty={<EmptyState title="Nenhum modelo" />}
      actions={([selected]) => (
        <SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!selected} onClick={() => selected && navigate(`/bedrock/playground?model=${encodeURIComponent(selected.id)}`)}>
            Abrir no playground
          </Button>
        </SpaceBetween>
      )}
      columns={[
        { id: 'name', header: 'Modelo', sortingField: 'name', cell: (m) => m.name },
        { id: 'provider', header: 'Provedor', sortingField: 'provider', cell: (m) => m.provider },
        { id: 'id', header: 'ID do modelo', cell: (m) => m.id },
        { id: 'input', header: 'Entrada', cell: (m) => m.inputModalities.join(', ') },
        { id: 'output', header: 'Saída', cell: (m) => m.outputModalities.join(', ') },
        { id: 'streaming', header: 'Streaming', cell: (m) => (m.streaming ? <Badge color="green">Sim</Badge> : 'Não') },
      ]}
    />
  );
}
