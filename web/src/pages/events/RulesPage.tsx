import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Link from '@cloudscape-design/components/link';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { eventsApi, type RuleSummary } from '../../api/events';
import { DeleteModal } from '../../components/DeleteModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { DEFAULT_BUS, EVENTS_BREADCRUMB } from './BusesPage';

export const ruleHref = (bus: string, rule: string) => `/events/rule?bus=${encodeURIComponent(bus)}&name=${encodeURIComponent(rule)}`;

export const RuleState = ({ state }: { state: string }) =>
  state === 'ENABLED' ? <StatusIndicator>Habilitada</StatusIndicator> : <StatusIndicator type="stopped">Desabilitada</StatusIndicator>;

export function RulesPage() {
  const [params, setParams] = useSearchParams();
  const bus = params.get('bus') ?? DEFAULT_BUS;
  useBreadcrumbs([EVENTS_BREADCRUMB, { text: 'Regras', href: '/events/rules' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const buses = useRemote((signal) => eventsApi.buses(signal), []);
  const rules = useRemote((signal) => eventsApi.rules(bus, signal), [bus]);
  const [toDelete, setToDelete] = useState<RuleSummary | null>(null);

  return (
    <SpaceBetween size="m">
      <FormField label="Barramento de eventos">
        <Select
          selectedOption={{ value: bus, label: bus }}
          onChange={({ detail }) => setParams({ bus: detail.selectedOption.value! })}
          options={(buses.data?.buses ?? []).map((b) => ({ value: b.name, label: b.name }))}
          statusType={buses.loading ? 'loading' : 'finished'}
        />
      </FormField>
      <ResourceTable
        title="Regras"
        description="Regras encaminham eventos que correspondem a um padrão, ou rodam em um agendamento."
        resourceName="regras"
        items={rules.data?.rules}
        loading={rules.loading}
        error={rules.error}
        onRetry={rules.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhuma regra" action={<Button onClick={() => navigate(`/events/create-rule?bus=${encodeURIComponent(bus)}`)}>Criar regra</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={rules.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => navigate(`/events/create-rule?bus=${encodeURIComponent(bus)}`)}>
              Criar regra
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', sortingField: 'name', cell: (r) => <Link href={ruleHref(bus, r.name)} onFollow={follow}>{r.name}</Link> },
          { id: 'state', header: 'Status', cell: (r) => <RuleState state={r.state} /> },
          { id: 'type', header: 'Tipo', cell: (r) => (r.scheduleExpression ? 'Agendada' : 'Padrão de evento') },
          { id: 'description', header: 'Descrição', cell: (r) => r.description || '-' },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir regra"
        confirmationText="excluir"
        description={<>A regra <b>{toDelete?.name}</b> e seus destinos serão excluídos.</>}
        onConfirm={async () => {
          await eventsApi.deleteRule(bus, toDelete!.name);
          notifications.success(`Regra "${toDelete!.name}" excluída.`);
          rules.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </SpaceBetween>
  );
}
