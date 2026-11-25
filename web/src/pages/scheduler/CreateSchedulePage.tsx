import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tiles from '@cloudscape-design/components/tiles';
import Toggle from '@cloudscape-design/components/toggle';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { schedulerApi } from '../../api/scheduler';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { TargetSelect } from '../../components/TargetSelect';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { scheduleExpressionError } from './expression';
import { scheduleHref, SCHEDULER_BREADCRUMB } from './SchedulesPage';

const NAME = /^[0-9a-zA-Z\-_.]{1,64}$/;

export function CreateSchedulePage() {
  useBreadcrumbs([SCHEDULER_BREADCRUMB, { text: 'Agendamentos', href: '/scheduler/schedules' }, { text: 'Criar agendamento', href: '/scheduler/create-schedule' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const groups = useRemote((signal) => schedulerApi.groups(signal), []);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('default');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'recurring' | 'once'>('recurring');
  const [expression, setExpression] = useState('rate(1 hour)');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [target, setTarget] = useState('');
  const [input, setInput] = useState('{}');
  const [roleArn, setRoleArn] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const errors = {
    name: NAME.test(name) ? null : 'Até 64 caracteres: letras, números e - _ .',
    expression: scheduleExpressionError(expression, kind),
    target: target ? null : 'Escolha um destino.',
    input: jsonError(input),
  };
  const valid = Object.values(errors).every((e) => !e);

  const changeKind = (next: 'recurring' | 'once') => {
    setKind(next);
    // Sugere um exemplo do tipo escolhido: daqui a uma hora, ou a cada hora.
    const inOneHour = new Date(Date.now() + 3_600_000).toISOString().slice(0, 19);
    setExpression(next === 'once' ? `at(${inOneHour})` : 'rate(1 hour)');
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await schedulerApi.create({
        name,
        group,
        description,
        expression,
        timezone,
        targetArn: target,
        roleArn: roleArn.trim(),
        input: input.trim() || null,
        state: enabled ? 'ENABLED' : 'DISABLED',
      });
      notifications.success(`Agendamento "${name}" criado.`);
      navigate(scheduleHref(group, name));
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1">Criar agendamento</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/scheduler/schedules')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar agendamento
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Nome e descrição do agendamento</Header>}>
            <SpaceBetween size="l">
              <FormField label="Nome do agendamento" errorText={touched ? errors.name : null}>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
              </FormField>
              <FormField label="Descrição - opcional">
                <Input value={description} onChange={({ detail }) => setDescription(detail.value)} />
              </FormField>
              <FormField label="Grupo de agendamentos">
                <Select
                  selectedOption={{ value: group, label: group }}
                  onChange={({ detail }) => setGroup(detail.selectedOption.value!)}
                  options={(groups.data?.groups ?? ['default']).map((g) => ({ value: g, label: g }))}
                />
              </FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Padrão de agendamento</Header>}>
            <SpaceBetween size="l">
              <Tiles
                value={kind}
                onChange={({ detail }) => changeKind(detail.value as 'recurring' | 'once')}
                items={[
                  { value: 'recurring', label: 'Agendamento recorrente', description: 'rate(...) ou cron(...)' },
                  { value: 'once', label: 'Agendamento único', description: 'at(aaaa-mm-ddThh:mm:ss)' },
                ]}
              />
              <FormField label="Expressão" errorText={touched ? errors.expression : null}>
                <Input value={expression} onChange={({ detail }) => setExpression(detail.value)} />
              </FormField>
              <FormField label="Fuso horário">
                <Input value={timezone} onChange={({ detail }) => setTimezone(detail.value)} />
              </FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Destino</Header>}>
            <SpaceBetween size="l">
              <FormField label="Destino" errorText={touched ? errors.target : null}>
                <TargetSelect value={target} onChange={setTarget} />
              </FormField>
              <FormField label="Entrada (JSON)" errorText={errors.input} stretch>
                <CodeArea value={input} onChange={setInput} rows={4} ariaLabel="Entrada do destino" />
              </FormField>
              <FormField
                label="Papel de execução - opcional"
                description="Em branco, o painel cria (uma vez) o papel aws-console-local-scheduler, que o Scheduler pode assumir."
              >
                <Input value={roleArn} onChange={({ detail }) => setRoleArn(detail.value)} placeholder="arn:aws:iam::000000000000:role/..." />
              </FormField>
              <Toggle checked={enabled} onChange={({ detail }) => setEnabled(detail.checked)}>
                Habilitar o agendamento
              </Toggle>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
