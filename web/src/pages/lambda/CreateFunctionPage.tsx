import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { lambdaApi } from '../../api/lambda';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { functionHref, LAMBDA_BREADCRUMB } from './FunctionsPage';
import { RUNTIMES } from './runtimes';
import { parseIntInRange } from './validation';

const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export function CreateFunctionPage() {
  useBreadcrumbs([LAMBDA_BREADCRUMB, { text: 'Funções', href: '/lambda/functions' }, { text: 'Criar função', href: '/lambda/create-function' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState(RUNTIMES[0]!.runtime);
  const [memory, setMemory] = useState('128');
  const [timeout, setTimeoutValue] = useState('3');
  const [role, setRole] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const template = RUNTIMES.find((r) => r.runtime === runtime)!;
  const memoryValue = parseIntInRange(memory, 128, 10240, 'MB');
  const timeoutValue = parseIntInRange(timeout, 1, 900, 'segundos');
  const nameError = NAME.test(name) ? null : 'Até 64 caracteres: letras, números, hifens e sublinhados.';
  const shown = (error: string | null) => (touched ? error : null);
  const fieldError = (value: number | string) => (typeof value === 'string' ? value : null);

  const submit = async () => {
    setTouched(true);
    if (nameError || typeof memoryValue === 'string' || typeof timeoutValue === 'string' || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await lambdaApi.create({
        name,
        runtime,
        handler: template.handler,
        memorySize: memoryValue,
        timeout: timeoutValue,
        role: role.trim() || undefined,
        code: { files: template.files },
      });
      notifications.success(`Função "${name}" criada.`);
      navigate(functionHref(name));
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1" description="Comece com um exemplo simples de código e edite depois.">Criar função</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/lambda/functions')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar função
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Informações básicas</Header>}>
            <SpaceBetween size="l">
              <FormField label="Nome da função" constraintText="Letras, números, hifens e sublinhados." errorText={shown(nameError)}>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="minha-funcao" autoFocus />
              </FormField>
              <FormField label="Runtime" description={`Manipulador inicial: ${template.handler}`}>
                <Select
                  selectedOption={{ value: template.runtime, label: template.label }}
                  onChange={({ detail }) => setRuntime(detail.selectedOption.value!)}
                  options={RUNTIMES.map((r) => ({ value: r.runtime, label: r.label }))}
                />
              </FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Configurações</Header>}>
            <SpaceBetween size="l">
              <ColumnLayout columns={2}>
                <FormField label="Memória (MB)" constraintText="128 a 10.240" errorText={shown(fieldError(memoryValue))}>
                  <Input value={memory} onChange={({ detail }) => setMemory(detail.value)} inputMode="numeric" />
                </FormField>
                <FormField label="Tempo limite (segundos)" constraintText="1 a 900" errorText={shown(fieldError(timeoutValue))}>
                  <Input value={timeout} onChange={({ detail }) => setTimeoutValue(detail.value)} inputMode="numeric" />
                </FormField>
              </ColumnLayout>
              <FormField
                label="Papel de execução - opcional"
                description="Em branco, o painel cria (uma vez) o papel aws-console-local-lambda com permissões básicas."
              >
                <Input value={role} onChange={({ detail }) => setRole(detail.value)} placeholder="arn:aws:iam::000000000000:role/..." />
              </FormField>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
