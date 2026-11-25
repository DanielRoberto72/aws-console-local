import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { secretsApi, type SecretSummary } from '../../api/secrets';
import { CodeArea } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { formatDate } from '../../components/format';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const SECRETS_BREADCRUMB = { text: 'Secrets Manager', href: '/secrets' };
// Nomes de segredo podem ter "/", por isso vão na query string.
export const secretHref = (name: string) => `/secrets/detail?name=${encodeURIComponent(name)}`;

const SECRET_NAME = /^[a-zA-Z0-9/_+=.@-]{1,512}$/;

export function SecretsPage() {
  useBreadcrumbs([SECRETS_BREADCRUMB, { text: 'Segredos', href: '/secrets' }]);
  const follow = useFollow();
  const notifications = useNotifications();
  const secrets = useRemote((signal) => secretsApi.list(signal), []);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<SecretSummary | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('{\n  "usuario": "",\n  "senha": ""\n}');

  return (
    <>
      <ResourceTable
        title="Segredos"
        resourceName="segredos"
        items={secrets.data?.secrets}
        loading={secrets.loading}
        error={secrets.error}
        onRetry={secrets.reload}
        trackBy="name"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum segredo" action={<Button onClick={() => setCreating(true)}>Armazenar um novo segredo</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={secrets.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Armazenar um novo segredo
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome do segredo', sortingField: 'name', cell: (s) => <Link href={secretHref(s.name)} onFollow={follow}>{s.name}</Link> },
          { id: 'description', header: 'Descrição', cell: (s) => s.description || '-' },
          { id: 'changed', header: 'Última alteração', sortingField: 'lastChangedAt', cell: (s) => formatDate(s.lastChangedAt) },
          { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (s) => formatDate(s.createdAt) },
        ]}
      />
      <FormModal
        visible={creating}
        title="Armazenar um novo segredo"
        submitLabel="Armazenar"
        size="medium"
        canSubmit={SECRET_NAME.test(name) && value.length > 0}
        onSubmit={async () => {
          await secretsApi.create(name, description, { kind: 'string', value });
          notifications.success(`Segredo "${name}" armazenado.`);
          setName('');
          setDescription('');
          secrets.reload();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Nome do segredo" constraintText="Letras, números e /_+=.@-">
          <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="prod/minha-app/banco" autoFocus />
        </FormField>
        <FormField label="Descrição - opcional">
          <Input value={description} onChange={({ detail }) => setDescription(detail.value)} />
        </FormField>
        <FormField label="Valor do segredo" description="Texto simples ou JSON com pares de chave/valor." stretch>
          <CodeArea value={value} onChange={setValue} rows={8} ariaLabel="Valor do segredo" />
        </FormField>
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir segredo"
        confirmationText="excluir"
        description={<>O segredo <b>{toDelete?.name}</b> será excluído imediatamente, sem janela de recuperação.</>}
        onConfirm={async () => {
          await secretsApi.remove(toDelete!.name);
          notifications.success(`Segredo "${toDelete!.name}" excluído.`);
          secrets.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
