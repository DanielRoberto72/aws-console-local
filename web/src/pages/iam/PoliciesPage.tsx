import Button from '@cloudscape-design/components/button';
import Link from '@cloudscape-design/components/link';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { iamApi, type PolicySummary, type PolicyType } from '../../api/iam';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { IAM_BREADCRUMB, POLICY_TYPE_LABELS, policyHref } from './iamLinks';

type TypeFilter = 'all' | PolicyType;

export function PoliciesPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Políticas', href: '/iam/policies' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const policies = useRemote((signal) => iamApi.listPolicies(signal), []);
  const [type, setType] = useState<TypeFilter>('all');
  const [toDelete, setToDelete] = useState<PolicySummary | null>(null);
  const items = policies.data?.policies.filter((p) => type === 'all' || p.type === type);
  const create = (
    <Button variant="primary" href="/iam/create-policy" onFollow={follow}>
      Criar política
    </Button>
  );

  return (
    <>
      <ResourceTable
        title="Políticas"
        description={
          <SpaceBetween size="xs">
            <span>Uma política define permissões. As gerenciadas pela AWS vêm prontas e não podem ser alteradas.</span>
            <SegmentedControl
              selectedId={type}
              onChange={({ detail }) => setType(detail.selectedId as TypeFilter)}
              label="Filtrar por tipo"
              options={[
                { id: 'all', text: 'Todos os tipos' },
                { id: 'customer', text: POLICY_TYPE_LABELS.customer },
                { id: 'aws', text: POLICY_TYPE_LABELS.aws },
              ]}
            />
          </SpaceBetween>
        }
        resourceName="políticas"
        items={items}
        loading={policies.loading}
        error={policies.error}
        onRetry={policies.reload}
        trackBy="arn"
        defaultSortField="name"
        empty={<EmptyState title="Nenhuma política" action={create} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={policies.reload} />
            <Button disabled={!selected || selected.type === 'aws'} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            {create}
          </SpaceBetween>
        )}
        columns={[
          {
            id: 'name',
            header: 'Nome da política',
            sortingField: 'name',
            cell: (p) => (
              <Link href={policyHref(p.arn)} onFollow={follow}>
                {p.name}
              </Link>
            ),
          },
          { id: 'type', header: 'Tipo', sortingField: 'type', cell: (p) => POLICY_TYPE_LABELS[p.type] },
          { id: 'attachments', header: 'Entidades anexadas', sortingField: 'attachments', cell: (p) => p.attachments },
          { id: 'updated', header: 'Última atualização', sortingField: 'updatedAt', cell: (p) => formatDate(p.updatedAt) },
        ]}
      />
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir política"
        confirmationText={toDelete?.name ?? ''}
        description={
          <>
            A política <b>{toDelete?.name}</b> será desanexada de {toDelete?.attachments ?? 0} entidade(s) e excluída com todas
            as versões. Para confirmar, digite o nome da política.
          </>
        }
        onConfirm={async () => {
          await iamApi.deletePolicy(toDelete!.arn);
          notifications.success(`Política "${toDelete!.name}" excluída.`);
          policies.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
