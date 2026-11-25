import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import type { ActionResult, FieldSpec, Input } from '../../api/catalog';
import { errorMessage } from '../../api/http';
import { ActionResultView } from './ActionResultView';
import { FieldsForm } from './FieldsForm';
import { formErrors, initialValues, toInput, type FormValues } from './fields';

interface RunFormProps {
  fields: readonly FieldSpec[];
  submitLabel: string;
  run: (input: Input) => Promise<ActionResult>;
  onSuccess?: () => void;
}

/** Formulário que executa uma ação e mostra o resultado logo abaixo, mantendo os campos. */
export function RunForm({ fields, submitLabel, run, onSuccess }: RunFormProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [showErrors, setShowErrors] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setShowErrors(true);
    if (Object.keys(formErrors(fields, values)).length > 0 || running) return;
    setRunning(true);
    setError(undefined);
    setResult(null);
    try {
      setResult(await run(toInput(fields, values)));
      onSuccess?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <SpaceBetween size="m">
        {fields.length > 0 && <FieldsForm fields={fields} values={values} onChange={setValues} showErrors={showErrors} />}
        <Button variant="primary" loading={running}>
          {submitLabel}
        </Button>
        {error && <Alert type="error">{error}</Alert>}
        {result && <ActionResultView result={result} />}
      </SpaceBetween>
    </form>
  );
}

interface ActionModalProps extends RunFormProps {
  visible: boolean;
  title: string;
  description?: string;
  onDismiss: () => void;
}

export function ActionModal({ visible, title, description, onDismiss, ...form }: ActionModalProps) {
  return (
    <Modal
      visible={visible}
      header={title}
      size="large"
      closeAriaLabel="Fechar"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <Button variant="link" onClick={onDismiss}>
            Fechar
          </Button>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {description && <Box variant="p">{description}</Box>}
        {/* A chave recria o formulário a cada abertura, com os valores padrão. */}
        {visible && <RunForm key={title} {...form} />}
      </SpaceBetween>
    </Modal>
  );
}
