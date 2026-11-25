import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Grid from '@cloudscape-design/components/grid';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dynamodbApi, type KeyType } from '../../api/dynamodb';
import { errorMessage } from '../../api/http';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { DYNAMODB_BREADCRUMB } from './TablesPage';

const KEY_TYPES = [
  { value: 'S', label: 'String' },
  { value: 'N', label: 'Número' },
  { value: 'B', label: 'Binário' },
] as const;

const TABLE_NAME = /^[a-zA-Z0-9_.-]{3,255}$/;

function KeyField({
  label,
  description,
  name,
  type,
  onName,
  onType,
  error,
}: {
  label: string;
  description: string;
  name: string;
  type: KeyType;
  onName: (value: string) => void;
  onType: (value: KeyType) => void;
  error: string | null;
}) {
  return (
    <FormField label={label} description={description} errorText={error}>
      <Grid gridDefinition={[{ colspan: 8 }, { colspan: 4 }]}>
        <Input value={name} onChange={({ detail }) => onName(detail.value)} placeholder="Nome do atributo" ariaLabel={`${label}: nome`} />
        <Select
          selectedOption={KEY_TYPES.find((t) => t.value === type) ?? null}
          onChange={({ detail }) => onType(detail.selectedOption.value as KeyType)}
          options={[...KEY_TYPES]}
          ariaLabel={`${label}: tipo`}
        />
      </Grid>
    </FormField>
  );
}

export function CreateTablePage() {
  useBreadcrumbs([DYNAMODB_BREADCRUMB, { text: 'Tabelas', href: '/dynamodb/tables' }, { text: 'Criar tabela', href: '/dynamodb/create-table' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [name, setName] = useState('');
  const [pkName, setPkName] = useState('');
  const [pkType, setPkType] = useState<KeyType>('S');
  const [skName, setSkName] = useState('');
  const [skType, setSkType] = useState<KeyType>('S');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const errors = {
    name: TABLE_NAME.test(name) ? null : 'Entre 3 e 255 caracteres: letras, números, sublinhado (_), hífen (-) e ponto (.).',
    pk: pkName.trim() ? null : 'Informe a chave de partição.',
    sk: skName && skName === pkName ? 'Deve ser diferente da chave de partição.' : null,
  };
  const valid = !errors.name && !errors.pk && !errors.sk;

  const submit = async () => {
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await dynamodbApi.createTable({
        name,
        partitionKey: { name: pkName.trim(), type: pkType },
        ...(skName.trim() ? { sortKey: { name: skName.trim(), type: skType } } : {}),
      });
      notifications.success(`Criação da tabela "${name}" iniciada.`);
      navigate('/dynamodb/tables');
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1">Criar tabela</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/dynamodb/tables')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar tabela
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Detalhes da tabela</Header>}>
            <SpaceBetween size="l">
              <FormField label="Nome da tabela" description="Identifica a tabela." errorText={touched ? errors.name : null}>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="Pedidos" autoFocus />
              </FormField>
              <KeyField
                label="Chave de partição"
                description="Parte da chave primária usada para distribuir os itens."
                name={pkName}
                type={pkType}
                onName={setPkName}
                onType={setPkType}
                error={touched ? errors.pk : null}
              />
              <KeyField
                label="Chave de classificação - opcional"
                description="Segunda parte da chave primária, para ordenar itens com a mesma partição."
                name={skName}
                type={skType}
                onName={setSkName}
                onType={setSkType}
                error={touched ? errors.sk : null}
              />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Configurações da tabela</Header>}>
            <FormField label="Modo de capacidade" description="Tabelas criadas pelo painel usam capacidade sob demanda.">
              <Input value="Sob demanda" disabled />
            </FormField>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
