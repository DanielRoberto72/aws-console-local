import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tiles from '@cloudscape-design/components/tiles';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { sqsApi } from '../../api/sqs';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { parseSeconds, QUEUE_LIMITS, validateQueueName } from './queueForm';
import { SQS_BREADCRUMB } from './QueuesPage';

export function CreateQueuePage() {
  useBreadcrumbs([SQS_BREADCRUMB, { text: 'Filas', href: '/sqs/queues' }, { text: 'Criar fila', href: '/sqs/create-queue' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [fifo, setFifo] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState(String(QUEUE_LIMITS.visibilityTimeout.default));
  const [retention, setRetention] = useState(String(QUEUE_LIMITS.messageRetentionPeriod.default));
  const [delay, setDelay] = useState(String(QUEUE_LIMITS.delaySeconds.default));
  const [dedup, setDedup] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const nameError = validateQueueName(name, fifo);
  const visibilityValue = parseSeconds(visibility, QUEUE_LIMITS.visibilityTimeout);
  const retentionValue = parseSeconds(retention, QUEUE_LIMITS.messageRetentionPeriod);
  const delayValue = parseSeconds(delay, QUEUE_LIMITS.delaySeconds);
  const fieldError = (value: number | string) => (touched && typeof value === 'string' ? value : null);

  const submit = async () => {
    setTouched(true);
    if (nameError || [visibilityValue, retentionValue, delayValue].some((v) => typeof v === 'string') || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await sqsApi.createQueue({
        name,
        fifo,
        visibilityTimeout: visibilityValue as number,
        messageRetentionPeriod: retentionValue as number,
        delaySeconds: delayValue as number,
        ...(fifo ? { contentBasedDeduplication: dedup } : {}),
      });
      notifications.success(`Fila "${name}" criada.`);
      navigate(`/sqs/queues/${encodeURIComponent(name)}`);
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const changeType = (nextFifo: boolean) => {
    setFifo(nextFifo);
    // Ajusta o sufixo ao trocar o tipo, como o console faz.
    if (nextFifo && name && !name.endsWith('.fifo')) setName(`${name}.fifo`);
    if (!nextFifo && name.endsWith('.fifo')) setName(name.replace(/\.fifo$/, ''));
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1">Criar fila</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/sqs/queues')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar fila
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Detalhes</Header>}>
            <SpaceBetween size="l">
              <FormField label="Tipo" description="Não é possível alterar o tipo depois de criar a fila.">
                <Tiles
                  value={fifo ? 'fifo' : 'standard'}
                  onChange={({ detail }) => changeType(detail.value === 'fifo')}
                  items={[
                    { value: 'standard', label: 'Padrão', description: 'Entrega pelo menos uma vez, sem garantia de ordem.' },
                    { value: 'fifo', label: 'FIFO', description: 'Ordem preservada e entrega exatamente uma vez.' },
                  ]}
                />
              </FormField>
              <FormField
                label="Nome"
                constraintText={`Até 80 caracteres: letras, números, hifens e sublinhados.${fifo ? ' Deve terminar com ".fifo".' : ''}`}
                errorText={touched ? nameError : null}
              >
                <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder={fifo ? 'minha-fila.fifo' : 'minha-fila'} autoFocus />
              </FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Configuração</Header>}>
            <SpaceBetween size="l">
              <ColumnLayout columns={3}>
                <FormField label="Tempo limite de visibilidade" constraintText="0 a 43.200 segundos" errorText={fieldError(visibilityValue)}>
                  <Input value={visibility} onChange={({ detail }) => setVisibility(detail.value)} inputMode="numeric" />
                </FormField>
                <FormField label="Período de retenção de mensagens" constraintText="60 a 1.209.600 segundos (padrão: 4 dias)" errorText={fieldError(retentionValue)}>
                  <Input value={retention} onChange={({ detail }) => setRetention(detail.value)} inputMode="numeric" />
                </FormField>
                <FormField label="Atraso na entrega" constraintText="0 a 900 segundos" errorText={fieldError(delayValue)}>
                  <Input value={delay} onChange={({ detail }) => setDelay(detail.value)} inputMode="numeric" />
                </FormField>
              </ColumnLayout>
              {fifo && (
                <Checkbox checked={dedup} onChange={({ detail }) => setDedup(detail.checked)} description="Usa o hash do corpo como ID de desduplicação.">
                  Desduplicação baseada em conteúdo
                </Checkbox>
              )}
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
