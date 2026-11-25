import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { eventsApi, type BusSummary } from '../../api/events';
import { DeleteModal } from '../../components/DeleteModal';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const EVENTS_BREADCRUMB = { text: 'Amazon EventBridge', href: '/events/rules' };
export const DEFAULT_BUS = 'default';
export const rulesHref = (bus: string) => `/events/rules?bus=${encodeURIComponent(bus)}`;

export function BusesPage() {
  useBreadcrumbs([EVENTS_BREADCRUMB, { text: 'Barramentos de eventos', href: '/events/buses' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const buses = useRemote((signal) => eventsApi.buses(signal), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [toDelete, setToDelete] = useState<BusSummary | null>(null);

  return (
    <>
      <ResourceTable
        title="Barramentos de eventos"
        description="O barramento default recebe eventos dos serviços da AWS."
        resourceName="barramentos"
        items={buses.data?.buses}
        loading={buses.loading}
        error={buses.error}
        onRetry={buses.reload}
        trackBy="name"
        empty={<EmptyState title="Nenhum barramento" />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={buses.reload} />
            <Button disabled={!selected || selected.name === DEFAULT_BUS} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar barramento de eventos
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', cell: (b) => <Link href={rulesHref(b.name)} onFollow={follow}>{b.name}</Link> },
          { id: 'arn', header: 'ARN', cell: (b) => b.arn },
        ]}
      />
      <FormModal
        visible={creating}
        title="Criar barramento de eventos"
        submitLabel="Criar"
        canSubmit={/^[.\-_A-Za-z0-9]{1,256}$/.test(name) && name !== DEFAULT_BUS}
        onSubmit={async () => {
          await eventsApi.createBus(name);
          notifications.success(`Barramento "${name}" criado.`);
          setName('');
          buses.reload();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Nome" constraintText="Letras, números e . - _">
          <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir barramento de eventos"
        confirmationText="excluir"
        description={<>O barramento <b>{toDelete?.name}</b> será excluído. Exclua as regras dele antes.</>}
        onConfirm={async () => {
          await eventsApi.deleteBus(toDelete!.name);
          notifications.success(`Barramento "${toDelete!.name}" excluído.`);
          buses.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
