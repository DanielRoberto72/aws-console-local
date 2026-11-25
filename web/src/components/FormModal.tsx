import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal, { type ModalProps } from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState, type ReactNode } from 'react';
import { errorMessage } from '../api/http';

interface FormModalProps {
  visible: boolean;
  title: string;
  submitLabel: string;
  /** Falso enquanto o formulário tem erros de validação. */
  canSubmit?: boolean;
  size?: ModalProps.Size;
  onSubmit: () => Promise<void>;
  onDismiss: () => void;
  children: ReactNode;
}

/** Modal de formulário com estados de envio e erro, no padrão do console. */
export function FormModal({ visible, title, submitLabel, canSubmit = true, size, onSubmit, onDismiss, children }: FormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const close = () => {
    if (submitting) return;
    setError(undefined);
    onDismiss();
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit();
      onDismiss();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      size={size}
      onDismiss={close}
      header={title}
      closeAriaLabel="Fechar"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={submitting}>
              {submitLabel}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SpaceBetween size="m">
          {children}
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      </form>
    </Modal>
  );
}
