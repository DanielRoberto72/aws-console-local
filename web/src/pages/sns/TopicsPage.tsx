import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tiles from '@cloudscape-design/components/tiles';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { snsApi, type TopicSummary } from '../../api/sns';
import { DeleteModal } from '../../components/DeleteModal';
import { FormModal } from '../../components/FormModal';
import { ResourceTable } from '../../components/ResourceTable';
import { EmptyState } from '../../components/TableStates';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';

export const SNS_BREADCRUMB = { text: 'Amazon SNS', href: '/sns/topics' };
export const topicHref = (name: string) => `/sns/topics/${encodeURIComponent(name)}`;

export function validateTopicName(name: string, fifo: boolean): string | null {
  const base = fifo ? name.replace(/\.fifo$/, '') : name;
  if (!name) return 'Informe o nome do tópico.';
  if (fifo !== name.endsWith('.fifo')) return fifo ? 'Tópicos FIFO devem terminar com ".fifo".' : 'Só tópicos FIFO terminam com ".fifo".';
  if (name.length > 256 || !/^[a-zA-Z0-9_-]+$/.test(base)) return 'Até 256 caracteres: letras, números, hifens e sublinhados.';
  return null;
}

export function TopicsPage() {
  useBreadcrumbs([SNS_BREADCRUMB, { text: 'Tópicos', href: '/sns/topics' }]);
  const navigate = useNavigate();
  const follow = useFollow();
  const notifications = useNotifications();
  const topics = useRemote((signal) => snsApi.topics(signal), []);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<TopicSummary | null>(null);
  const [fifo, setFifo] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dedup, setDedup] = useState(false);
  const nameError = validateTopicName(name, fifo);

  return (
    <>
      <ResourceTable
        title="Tópicos"
        resourceName="tópicos"
        items={topics.data?.topics}
        loading={topics.loading}
        error={topics.error}
        onRetry={topics.reload}
        trackBy="arn"
        defaultSortField="name"
        empty={<EmptyState title="Nenhum tópico" action={<Button onClick={() => setCreating(true)}>Criar tópico</Button>} />}
        actions={([selected]) => (
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Atualizar" onClick={topics.reload} />
            <Button disabled={!selected} onClick={() => selected && setToDelete(selected)}>
              Excluir
            </Button>
            <Button disabled={!selected} onClick={() => selected && navigate(`${topicHref(selected.name)}?tab=publish`)}>
              Publicar mensagem
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Criar tópico
            </Button>
          </SpaceBetween>
        )}
        columns={[
          { id: 'name', header: 'Nome', sortingField: 'name', cell: (t) => <Link href={topicHref(t.name)} onFollow={follow}>{t.name}</Link> },
          { id: 'type', header: 'Tipo', sortingField: 'type', cell: (t) => (t.type === 'FIFO' ? 'FIFO' : 'Padrão') },
          { id: 'subs', header: 'Assinaturas confirmadas', sortingField: 'subscriptionsConfirmed', cell: (t) => t.subscriptionsConfirmed },
          { id: 'pending', header: 'Pendentes', cell: (t) => t.subscriptionsPending },
          { id: 'arn', header: 'ARN', cell: (t) => t.arn },
        ]}
      />
      <FormModal
        visible={creating}
        title="Criar tópico"
        submitLabel="Criar tópico"
        canSubmit={!nameError}
        onSubmit={async () => {
          await snsApi.createTopic({ name, fifo, displayName: displayName || undefined, contentBasedDeduplication: fifo && dedup });
          notifications.success(`Tópico "${name}" criado.`);
          setName('');
          setDisplayName('');
          topics.reload();
        }}
        onDismiss={() => setCreating(false)}
      >
        <FormField label="Tipo" description="Não é possível alterar o tipo depois de criar o tópico.">
          <Tiles
            value={fifo ? 'fifo' : 'standard'}
            onChange={({ detail }) => {
              const next = detail.value === 'fifo';
              setFifo(next);
              if (next && name && !name.endsWith('.fifo')) setName(`${name}.fifo`);
              if (!next) setName(name.replace(/\.fifo$/, ''));
            }}
            items={[
              { value: 'standard', label: 'Padrão', description: 'Entrega pelo menos uma vez, sem ordem garantida.' },
              { value: 'fifo', label: 'FIFO', description: 'Ordem garantida; só assina filas SQS FIFO.' },
            ]}
          />
        </FormField>
        <FormField label="Nome" errorText={name ? nameError : null}>
          <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder={fifo ? 'meu-topico.fifo' : 'meu-topico'} />
        </FormField>
        <FormField label="Nome de exibição - opcional">
          <Input value={displayName} onChange={({ detail }) => setDisplayName(detail.value)} />
        </FormField>
        {fifo && (
          <Checkbox checked={dedup} onChange={({ detail }) => setDedup(detail.checked)}>
            Desduplicação de mensagens baseada em conteúdo
          </Checkbox>
        )}
      </FormModal>
      <DeleteModal
        visible={toDelete !== null}
        title="Excluir tópico"
        confirmationText="excluir"
        description={<>O tópico <b>{toDelete?.name}</b> e todas as suas assinaturas serão excluídos.</>}
        onConfirm={async () => {
          await snsApi.deleteTopic(toDelete!.name);
          notifications.success(`Tópico "${toDelete!.name}" excluído.`);
          topics.reload();
        }}
        onDismiss={() => setToDelete(null)}
      />
    </>
  );
}
