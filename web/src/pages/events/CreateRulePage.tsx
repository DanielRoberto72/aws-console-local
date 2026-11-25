import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tiles from '@cloudscape-design/components/tiles';
import Toggle from '@cloudscape-design/components/toggle';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { eventsApi } from '../../api/events';
import { errorMessage } from '../../api/http';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { TargetSelect } from '../../components/TargetSelect';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { DEFAULT_BUS, EVENTS_BREADCRUMB } from './BusesPage';
import { ruleHref } from './RulesPage';

const RULE_NAME = /^[.\-_A-Za-z0-9]{1,64}$/;
const DEFAULT_PATTERN = JSON.stringify({ source: ['minha.aplicacao'], 'detail-type': ['PedidoCriado'] }, null, 2);

export function CreateRulePage() {
  const bus = useSearchParams()[0].get('bus') ?? DEFAULT_BUS;
  useBreadcrumbs([EVENTS_BREADCRUMB, { text: 'Regras', href: '/events/rules' }, { text: 'Criar regra', href: '/events/create-rule' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'pattern' | 'schedule'>('pattern');
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [schedule, setSchedule] = useState('rate(5 minutes)');
  const [enabled, setEnabled] = useState(true);
  const [target, setTarget] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const errors = {
    name: RULE_NAME.test(name) ? null : 'Até 64 caracteres: letras, números e . - _',
    pattern: kind === 'pattern' ? jsonError(pattern, true) : null,
    schedule: kind === 'schedule' && !/^(rate|cron)\(.+\)$/.test(schedule) ? 'Use rate(...) ou cron(...).' : null,
  };
  const valid = !errors.name && !errors.pattern && !errors.schedule;

  const submit = async () => {
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await eventsApi.createRule(bus, {
        name,
        description,
        eventPattern: kind === 'pattern' ? pattern : null,
        scheduleExpression: kind === 'schedule' ? schedule : null,
        state: enabled ? 'ENABLED' : 'DISABLED',
        targets: target ? [{ id: 'destino-1', arn: target, input: null }] : [],
      });
      notifications.success(`Regra "${name}" criada.`);
      navigate(ruleHref(bus, name));
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1" description={`Barramento: ${bus}`}>Criar regra</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate(`/events/rules?bus=${encodeURIComponent(bus)}`)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar regra
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Detalhe da regra</Header>}>
            <SpaceBetween size="l">
              <FormField label="Nome" errorText={touched ? errors.name : null}>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
              </FormField>
              <FormField label="Descrição - opcional">
                <Input value={description} onChange={({ detail }) => setDescription(detail.value)} />
              </FormField>
              <Toggle checked={enabled} onChange={({ detail }) => setEnabled(detail.checked)}>
                Habilitar a regra no barramento selecionado
              </Toggle>
              <FormField label="Tipo de regra">
                <Tiles
                  value={kind}
                  onChange={({ detail }) => setKind(detail.value as 'pattern' | 'schedule')}
                  items={[
                    { value: 'pattern', label: 'Regra com um padrão de evento', description: 'Reage a eventos que correspondem ao padrão.' },
                    { value: 'schedule', label: 'Agendamento', description: 'Executa em intervalos regulares.' },
                  ]}
                />
              </FormField>
              {kind === 'pattern' ? (
                <FormField label="Padrão de evento" errorText={touched ? errors.pattern : null} stretch>
                  <CodeArea value={pattern} onChange={setPattern} rows={8} ariaLabel="Padrão de evento" />
                </FormField>
              ) : (
                <FormField label="Expressão de agendamento" constraintText="rate(5 minutes) ou cron(0 12 * * ? *)" errorText={touched ? errors.schedule : null}>
                  <Input value={schedule} onChange={({ detail }) => setSchedule(detail.value)} />
                </FormField>
              )}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="O painel concede à regra a permissão de entregar no destino.">Destino - opcional</Header>}>
            <FormField label="Destino">
              <TargetSelect value={target} onChange={setTarget} />
            </FormField>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
