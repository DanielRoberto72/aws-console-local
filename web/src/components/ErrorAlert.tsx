import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import { errorMessage } from '../api/http';

/** Falha ao carregar dados, com opção de tentar de novo. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Alert type="error" header="Não foi possível carregar" action={<Button onClick={onRetry}>Tentar novamente</Button>}>
      {errorMessage(error)}
    </Alert>
  );
}
