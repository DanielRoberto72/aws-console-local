import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { iamApi, type IdentityKind, type IdentityPolicies, type PolicySummary } from '../../api/iam';
import { CodeArea, jsonError, prettyJson } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { nameError, POLICY_TEMPLATE, POLICY_TYPE_LABELS, policyHref } from './iamLinks';
import { PolicyPicker } from './PolicyPicker';

/** Linha da tabela: política gerenciada anexada ou política em linha. */
interface PermissionRow {
  key: string;
  name: string;
  type: keyof typeof POLICY_TYPE_LABELS;
  arn?: string;
  document?: string;
}

interface PermissionsPanelProps {
  kind: IdentityKind;
  name: string;
  policies: IdentityPolicies;
  onChanged: () => void;
}

/** Aba "Permissões" de usuários, grupos e funções: anexar, desanexar e políticas em linha. */
export function PermissionsPanel({ kind, name, policies, onChanged }: PermissionsPanelProps) {
  const follow = useFollow();
  const notifications = useNotifications();
  const [attaching, setAttaching] = useState(false);
  const [toAttach, setToAttach] = useState<PolicySummary[]>([]);
  const [editing, setEditing] = useState<{ name: string; document: string; isNew: boolean } | null>(null);
  const [toRemove, setToRemove] = useState<PermissionRow | null>(null);

  const rows: PermissionRow[] = [
    ...policies.attached.map((p) => ({ key: p.arn, name: p.name, type: p.type, arn: p.arn })),
    ...policies.inline.map((p) => ({ key: `inline:${p.name}`, name: p.name, type: 'inline' as const, document: p.document })),
  ];
  const editingNameError = editing?.isNew ? nameError(editing.name, 128) : null;
  const editingDocError = editing ? jsonError(editing.document, true) : null;

  return (
    <>
      <ResourceTable
        title="Políticas de permissões"
        variant="container"
        resourceName="políticas"
        items={rows}
        loading={false}
        error={null}
        onRetry={onChanged}
        trackBy="key"
        defaultSortField="name"
        empty={<EmptyState title="Nenhuma política" subtitle="Esta identidade ainda não tem permissões." />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!selected} onClick={() => selected && setToRemove(selected)}>
              Remover
            </Button>
            <ButtonDropdown
              variant="primary"
              items={[
                { id: 'attach', text: 'Anexar políticas' },
                { id: 'inline', text: 'Criar política em linha' },
              ]}
              onItemClick={({ detail }) => {
                if (detail.id === 'attach') setAttaching(true);
                else setEditing({ name: '', document: POLICY_TEMPLATE, isNew: true });
              }}
            >
              Adicionar permissões
            </ButtonDropdown>
          </SpaceBetween>
        )}
        columns={[
          {
            id: 'name',
            header: 'Nome da política',
            sortingField: 'name',
            cell: (row) =>
              row.arn ? (
                <Link href={policyHref(row.arn)} onFollow={follow}>
                  {row.name}
                </Link>
              ) : (
                <Link onFollow={() => setEditing({ name: row.name, document: prettyJson(row.document), isNew: false })}>{row.name}</Link>
              ),
          },
          { id: 'type', header: 'Tipo', sortingField: 'type', cell: (row) => POLICY_TYPE_LABELS[row.type] },
          { id: 'via', header: 'Anexada via', cell: () => 'Diretamente' },
        ]}
      />

      <FormModal
        visible={attaching}
        title="Anexar políticas"
        submitLabel="Adicionar permissões"
        size="large"
        canSubmit={toAttach.length > 0}
        onSubmit={async () => {
          await iamApi.attachPolicies(kind, name, toAttach.map((p) => p.arn));
          notifications.success(`${toAttach.length === 1 ? 'Política anexada' : `${toAttach.length} políticas anexadas`} a "${name}".`);
          setToAttach([]);
          onChanged();
        }}
        onDismiss={() => setAttaching(false)}
      >
        {attaching && <PolicyPicker selected={toAttach} onChange={setToAttach} exclude={policies.attached.map((p) => p.arn)} title="Outras políticas de permissões" />}
      </FormModal>

      <FormModal
        visible={editing !== null}
        title={editing?.isNew ? 'Criar política em linha' : `Editar ${editing?.name ?? ''}`}
        submitLabel={editing?.isNew ? 'Criar política' : 'Salvar alterações'}
        size="large"
        canSubmit={!editingNameError && !editingDocError}
        onSubmit={async () => {
          await iamApi.putInlinePolicy(kind, name, editing!.name, editing!.document);
          notifications.success(`Política em linha "${editing!.name}" salva.`);
          onChanged();
        }}
        onDismiss={() => setEditing(null)}
      >
        {editing?.isNew && (
          <FormField label="Nome da política" errorText={editing.name ? editingNameError : null} constraintText="Até 128 caracteres: letras, números e +=,.@_-">
            <Input value={editing.name} onChange={({ detail }) => setEditing({ ...editing, name: detail.value })} autoFocus />
          </FormField>
        )}
        {editing && (
          <FormField label="Editor de políticas (JSON)" errorText={editingDocError} stretch>
            <CodeArea value={editing.document} onChange={(document) => setEditing({ ...editing, document })} rows={16} ariaLabel="Documento da política" />
          </FormField>
        )}
      </FormModal>

      <DeleteModal
        visible={toRemove !== null}
        title={toRemove?.type === 'inline' ? 'Excluir política em linha' : 'Remover política'}
        confirmationText={toRemove?.type === 'inline' ? 'excluir' : 'remover'}
        actionLabel={toRemove?.type === 'inline' ? 'Excluir' : 'Remover'}
        description={
          toRemove?.type === 'inline' ? (
            <>A política em linha <b>{toRemove?.name}</b> será excluída. Ela só existe nesta identidade.</>
          ) : (
            <>A política <b>{toRemove?.name}</b> será desanexada de <b>{name}</b>. A política continua existindo.</>
          )
        }
        onConfirm={async () => {
          if (toRemove!.arn) await iamApi.detachPolicy(kind, name, toRemove!.arn);
          else await iamApi.deleteInlinePolicy(kind, name, toRemove!.name);
          notifications.success(`Política "${toRemove!.name}" removida de "${name}".`);
          onChanged();
        }}
        onDismiss={() => setToRemove(null)}
      />
    </>
  );
}
