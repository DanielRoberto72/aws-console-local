import Button from '@cloudscape-design/components/button';
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
import { sfnApi } from '../../api/stepfunctions';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { machineHref, SFN_BREADCRUMB } from './StateMachinesPage';

const NAME = /^[a-zA-Z0-9_-]{1,80}$/;

/** Definição inicial no formato Amazon States Language, como o modelo "em branco" do console. */
export const SAMPLE_DEFINITION = JSON.stringify(
  {
    Comment: 'Exemplo com estados Pass e Choice',
    StartAt: 'Validar',
    States: {
      Validar: { Type: 'Pass', Result: { valido: true }, ResultPath: '$.validacao', Next: 'Decidir' },
      Decidir: {
        Type: 'Choice',
        Choices: [{ Variable: '$.validacao.valido', BooleanEquals: true, Next: 'Sucesso' }],
        Default: 'Falha',
      },
      Sucesso: { Type: 'Succeed' },
      Falha: { Type: 'Fail', Error: 'Invalido', Cause: 'A validação falhou' },
    },
  },
  null,
  2,
);

export function CreateStateMachinePage() {
  useBreadcrumbs([SFN_BREADCRUMB, { text: 'Máquinas de estado', href: '/stepfunctions/state-machines' }, { text: 'Criar', href: '/stepfunctions/create' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [name, setName] = useState('');
  const [type, setType] = useState<'STANDARD' | 'EXPRESS'>('STANDARD');
  const [definition, setDefinition] = useState(SAMPLE_DEFINITION);
  const [roleArn, setRoleArn] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const nameError = NAME.test(name) ? null : 'Até 80 caracteres: letras, números, hifens e sublinhados.';
  const definitionError = jsonError(definition, true);

  const submit = async () => {
    setTouched(true);
    if (nameError || definitionError || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await sfnApi.create({ name, type, definition, roleArn: roleArn.trim() || undefined });
      notifications.success(`Máquina de estado "${name}" criada.`);
      navigate(machineHref(name));
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1">Criar máquina de estado</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/stepfunctions/state-machines')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Configuração</Header>}>
            <SpaceBetween size="l">
              <FormField label="Nome" errorText={touched ? nameError : null}>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
              </FormField>
              <FormField label="Tipo">
                <Tiles
                  value={type}
                  onChange={({ detail }) => setType(detail.value as 'STANDARD' | 'EXPRESS')}
                  items={[
                    { value: 'STANDARD', label: 'Padrão', description: 'Execuções duráveis, com histórico.' },
                    { value: 'EXPRESS', label: 'Expressa', description: 'Execuções curtas e de alto volume.' },
                  ]}
                />
              </FormField>
              <FormField
                label="Papel de execução - opcional"
                description="Em branco, o painel cria (uma vez) o papel aws-console-local-stepfunctions, com permissão para invocar funções Lambda."
              >
                <Input value={roleArn} onChange={({ detail }) => setRoleArn(detail.value)} placeholder="arn:aws:iam::000000000000:role/..." />
              </FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="Amazon States Language (JSON).">Definição</Header>}>
            <FormField errorText={touched ? definitionError : null} stretch>
              <CodeArea value={definition} onChange={setDefinition} rows={22} ariaLabel="Definição da máquina de estado" />
            </FormField>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
