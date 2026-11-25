import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bedrockApi, type ChatMessage, type ConverseResult } from '../../api/bedrock';
import { errorMessage } from '../../api/http';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { BEDROCK_BREADCRUMB } from './ModelsPage';

const DEFAULT_MODEL = 'amazon.nova-2-lite-v1:0';

export function PlaygroundPage() {
  useBreadcrumbs([BEDROCK_BREADCRUMB, { text: 'Playground de chat', href: '/bedrock/playground' }]);
  const [params] = useSearchParams();
  const models = useRemote((signal) => bedrockApi.models(signal), []);
  const [modelId, setModelId] = useState(params.get('model') ?? DEFAULT_MODEL);
  const [system, setSystem] = useState('');
  const [maxTokens, setMaxTokens] = useState('512');
  const [temperature, setTemperature] = useState('0.7');
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [last, setLast] = useState<ConverseResult>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  const textModels = (models.data?.models ?? []).filter((m) => m.outputModalities.includes('TEXT'));
  const maxTokensValue = Number(maxTokens);
  const temperatureValue = Number(temperature);
  const paramsValid = Number.isInteger(maxTokensValue) && maxTokensValue > 0 && temperatureValue >= 0 && temperatureValue <= 1;

  const send = async () => {
    const messages: ChatMessage[] = [...history, { role: 'user', text: prompt }];
    setRunning(true);
    setError(undefined);
    try {
      const result = await bedrockApi.converse({
        modelId,
        messages,
        system: system || undefined,
        maxTokens: maxTokensValue,
        temperature: temperatureValue,
      });
      setHistory([...messages, { role: 'assistant', text: result.text }]);
      setLast(result);
      setPrompt('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <ContentLayout header={<Header variant="h1" description="Teste chamadas Converse com o contrato real da API.">Playground de chat</Header>}>
      <SpaceBetween size="l">
        <Alert type="info" header="Sem inferência real">
          O AWS Emulator não executa modelos de linguagem: a resposta é sempre um texto padrão, com contagem de tokens. Use o
          playground para validar o formato das chamadas, não o conteúdo.
        </Alert>
        <Container header={<Header variant="h2">Configurações</Header>}>
          <ColumnLayout columns={3}>
            <FormField label="Modelo">
              <Select
                selectedOption={{ value: modelId, label: textModels.find((m) => m.id === modelId)?.name ?? modelId, description: modelId }}
                onChange={({ detail }) => setModelId(detail.selectedOption.value!)}
                options={textModels.map((m) => ({ value: m.id, label: m.name, description: `${m.provider} · ${m.id}` }))}
                filteringType="auto"
                statusType={models.loading ? 'loading' : 'finished'}
              />
            </FormField>
            <FormField label="Máximo de tokens">
              <Input value={maxTokens} onChange={({ detail }) => setMaxTokens(detail.value)} inputMode="numeric" />
            </FormField>
            <FormField label="Temperatura" constraintText="0 a 1">
              <Input value={temperature} onChange={({ detail }) => setTemperature(detail.value)} inputMode="decimal" />
            </FormField>
          </ColumnLayout>
          <Box margin={{ top: 'm' }}>
            <FormField label="Prompt do sistema - opcional" stretch>
              <Textarea value={system} onChange={({ detail }) => setSystem(detail.value)} rows={2} />
            </FormField>
          </Box>
        </Container>
        <Container
          header={
            <Header
              variant="h2"
              counter={`(${history.length})`}
              actions={<Button disabled={history.length === 0} onClick={() => { setHistory([]); setLast(undefined); }}>Limpar conversa</Button>}
            >
              Conversa
            </Header>
          }
          footer={
            <form onSubmit={(event) => { event.preventDefault(); if (prompt && paramsValid) void send(); }}>
              <SpaceBetween size="s">
                <Textarea value={prompt} onChange={({ detail }) => setPrompt(detail.value)} rows={3} placeholder="Escreva uma mensagem" ariaLabel="Mensagem" />
                <Box float="right">
                  <Button variant="primary" loading={running} disabled={!prompt || !paramsValid}>
                    Executar
                  </Button>
                </Box>
              </SpaceBetween>
            </form>
          }
        >
          <SpaceBetween size="s">
            {history.length === 0 && <Box color="text-status-inactive">Nenhuma mensagem ainda.</Box>}
            {history.map((m, i) => (
              <Box key={i} padding="s" variant="div">
                <Box variant="awsui-key-label">{m.role === 'user' ? 'Você' : 'Modelo'}</Box>
                <Box variant="p">{m.text}</Box>
              </Box>
            ))}
            {error && <Alert type="error">{error}</Alert>}
            {last && (
              <Box variant="small" color="text-body-secondary">
                Tokens: {last.usage.inputTokens} de entrada, {last.usage.outputTokens} de saída · motivo de parada: {last.stopReason ?? '-'} · {last.latencyMs} ms
              </Box>
            )}
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
