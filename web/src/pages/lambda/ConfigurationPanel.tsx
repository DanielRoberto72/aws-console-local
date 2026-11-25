import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { lambdaApi, type FunctionDetail } from '../../api/lambda';
import { useAction } from '../../hooks/useAction';
import { parseIntInRange } from './validation';

interface EnvVar {
  key: string;
  value: string;
}

const ENV_KEY = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function ConfigurationPanel({ fn, onSaved }: { fn: FunctionDetail; onSaved: () => void }) {
  const save = useAction();
  const [handler, setHandler] = useState(fn.summary.handler ?? '');
  const [memory, setMemory] = useState(String(fn.summary.memorySize ?? 128));
  const [timeout, setTimeoutValue] = useState(String(fn.summary.timeout ?? 3));
  const [description, setDescription] = useState(fn.summary.description);
  const [env, setEnv] = useState<EnvVar[]>(Object.entries(fn.environment).map(([key, value]) => ({ key, value })));

  const memoryValue = parseIntInRange(memory, 128, 10240, 'MB');
  const timeoutValue = parseIntInRange(timeout, 1, 900, 'segundos');
  const keyError = (key: string, index: number) => {
    if (!ENV_KEY.test(key)) return 'Comece com letra; use letras, números e sublinhado.';
    if (env.findIndex((e) => e.key === key) !== index) return 'Chave repetida.';
    return null;
  };
  const valid =
    !!handler.trim() && typeof memoryValue === 'number' && typeof timeoutValue === 'number' && env.every((e, i) => !keyError(e.key, i));

  const submit = () =>
    save.run(
      async () => {
        await lambdaApi.updateConfiguration(fn.summary.name, {
          handler: handler.trim(),
          memorySize: memoryValue as number,
          timeout: timeoutValue as number,
          description,
          environment: Object.fromEntries(env.map((e) => [e.key, e.value])),
        });
        onSaved();
      },
      'Configuração salva.',
      'Falha ao salvar a configuração',
    );

  return (
    <Container
      header={
        <Header variant="h2" actions={<Button variant="primary" onClick={submit} disabled={!valid} loading={save.running}>Salvar</Button>}>
          Configuração geral e variáveis de ambiente
        </Header>
      }
    >
      <SpaceBetween size="l">
        <ColumnLayout columns={3}>
          <FormField label="Manipulador" errorText={handler.trim() ? null : 'Obrigatório.'}>
            <Input value={handler} onChange={({ detail }) => setHandler(detail.value)} />
          </FormField>
          <FormField label="Memória (MB)" errorText={typeof memoryValue === 'string' ? memoryValue : null}>
            <Input value={memory} onChange={({ detail }) => setMemory(detail.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Tempo limite (segundos)" errorText={typeof timeoutValue === 'string' ? timeoutValue : null}>
            <Input value={timeout} onChange={({ detail }) => setTimeoutValue(detail.value)} inputMode="numeric" />
          </FormField>
        </ColumnLayout>
        <FormField label="Descrição">
          <Input value={description} onChange={({ detail }) => setDescription(detail.value)} />
        </FormField>
        <FormField label="Variáveis de ambiente">
          <AttributeEditor
            items={env}
            onAddButtonClick={() => setEnv((all) => [...all, { key: '', value: '' }])}
            onRemoveButtonClick={({ detail }) => setEnv((all) => all.filter((_, i) => i !== detail.itemIndex))}
            addButtonText="Adicionar variável"
            removeButtonText="Remover"
            empty="Nenhuma variável de ambiente."
            definition={[
              {
                label: 'Chave',
                control: (item, index) => (
                  <Input value={item.key} onChange={({ detail }) => setEnv((all) => all.map((e, i) => (i === index ? { ...e, key: detail.value } : e)))} />
                ),
                errorText: (item, index) => (item.key || index < env.length ? keyError(item.key, index) : null),
              },
              {
                label: 'Valor',
                control: (item, index) => (
                  <Input value={item.value} onChange={({ detail }) => setEnv((all) => all.map((e, i) => (i === index ? { ...e, value: detail.value } : e)))} />
                ),
              },
            ]}
          />
        </FormField>
      </SpaceBetween>
    </Container>
  );
}
