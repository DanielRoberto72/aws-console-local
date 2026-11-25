import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useState } from 'react';
import { errorMessage } from '../../api/http';
import { lambdaApi, type InvocationResult } from '../../api/lambda';
import { CodeArea, jsonError, prettyJson } from '../../components/CodeArea';

const DEFAULT_EVENT = JSON.stringify({ key1: 'value1', key2: 'value2' }, null, 2);

export function TestPanel({ functionName }: { functionName: string }) {
  const [payload, setPayload] = useState(DEFAULT_EVENT);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InvocationResult>();
  const [error, setError] = useState<string>();
  const invalid = jsonError(payload, true);

  const test = async () => {
    setRunning(true);
    setError(undefined);
    try {
      setResult(await lambdaApi.invoke(functionName, payload));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header variant="h2" actions={<Button variant="primary" onClick={test} loading={running} disabled={!!invalid}>Testar</Button>}>
            Evento de teste
          </Header>
        }
      >
        <FormField label="JSON do evento" errorText={invalid} stretch>
          <CodeArea value={payload} onChange={setPayload} rows={10} ariaLabel="JSON do evento de teste" />
        </FormField>
      </Container>

      {error && <Alert type="error" header="Falha ao invocar">{error}</Alert>}

      {result && (
        <Container
          header={
            <Header variant="h2">
              {result.functionError ? (
                <StatusIndicator type="error">Execução da função: falhou ({result.functionError})</StatusIndicator>
              ) : (
                <StatusIndicator>Execução da função: com êxito</StatusIndicator>
              )}
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Box variant="small">
              Status HTTP {result.statusCode} · {result.durationMs} ms
            </Box>
            <ExpandableSection headerText="Resposta" defaultExpanded>
              <pre className="log-output">{prettyJson(result.payload) || '(vazia)'}</pre>
            </ExpandableSection>
            <ExpandableSection headerText="Saída do log" defaultExpanded>
              <pre className="log-output">{result.logs || '(sem logs)'}</pre>
            </ExpandableSection>
          </SpaceBetween>
        </Container>
      )}
    </SpaceBetween>
  );
}
