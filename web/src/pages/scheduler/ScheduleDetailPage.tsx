import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { schedulerApi } from '../../api/scheduler';
import { CodeArea, prettyJson } from '../../components/CodeArea';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { useAction } from '../../hooks/useAction';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { scheduleHref, SCHEDULER_BREADCRUMB, ScheduleState } from './SchedulesPage';

export function ScheduleDetailPage() {
  const { group = 'default', name = '' } = useParams();
  const navigate = useNavigate();
  const notifications = useNotifications();
  useBreadcrumbs([SCHEDULER_BREADCRUMB, { text: 'Agendamentos', href: '/scheduler/schedules' }, { text: name, href: scheduleHref(group, name) }]);
  const schedule = useRemote((signal) => schedulerApi.get(group, name, signal), [group, name]);
  const toggle = useAction();
  const [deleting, setDeleting] = useState(false);

  if (schedule.error) return <LoadError error={schedule.error} onRetry={schedule.reload} />;
  if (!schedule.data) return <Spinner size="large" />;
  const s = schedule.data;
  const enabled = s.state === 'ENABLED';

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleting(true)}>Excluir</Button>
              <Button
                loading={toggle.running}
                onClick={() =>
                  toggle
                    .run(() => schedulerApi.setEnabled(group, name, !enabled), enabled ? 'Agendamento desabilitado.' : 'Agendamento habilitado.', 'Falha ao alterar o agendamento')
                    .then(schedule.reload)
                }
              >
                {enabled ? 'Desabilitar' : 'Habilitar'}
              </Button>
            </SpaceBetween>
          }
        >
          {name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Detalhes do agendamento</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Status', value: <ScheduleState state={s.state} /> },
              { label: 'Grupo', value: s.group },
              { label: 'Expressão', value: s.expression },
              { label: 'Fuso horário', value: s.timezone },
              { label: 'Criação', value: formatDate(s.createdAt) },
              { label: 'Descrição', value: s.description || '-' },
              { label: 'ARN', value: s.arn },
              { label: 'Destino', value: s.targetArn },
              { label: 'Papel de execução', value: s.roleArn },
            ]}
          />
        </Container>
        <Container header={<Header variant="h2">Entrada enviada ao destino</Header>}>
          <CodeArea value={prettyJson(s.input) || '(nenhuma)'} readOnly rows={5} ariaLabel="Entrada do destino" />
        </Container>
      </SpaceBetween>
      <DeleteModal
        visible={deleting}
        title="Excluir agendamento"
        confirmationText="excluir"
        description={<>O agendamento <b>{name}</b> será excluído.</>}
        onConfirm={async () => {
          await schedulerApi.remove(group, name);
          notifications.success(`Agendamento "${name}" excluído.`);
          navigate('/scheduler/schedules');
        }}
        onDismiss={() => setDeleting(false)}
      />
    </ContentLayout>
  );
}
