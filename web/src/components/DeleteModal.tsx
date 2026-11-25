import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState, type ReactNode } from 'react';
import { errorMessage } from '../api/http';

interface DeleteModalProps {
  visible: boolean;
  title: string;
  description: ReactNode;
  /** Texto que o usuário precisa digitar para liberar a ação, como no console. */
  confirmationText: string;
  actionLabel?: string;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}

export function DeleteModal({
  visible,
  title,
  description,
  confirmationText,
  actionLabel = 'Excluir',
  onConfirm,
  onDismiss,
}: DeleteModalProps) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const close = () => {
    if (submitting) return;
    setTyped('');
    setError(undefined);
    onDismiss();
  };

  const confirm = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      await onConfirm();
      setTyped('');
      onDismiss();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const matches = typed === confirmationText;

  return (
    <Modal
      visible={visible}
      onDismiss={close}
      header={title}
      closeAriaLabel="Fechar"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirm} disabled={!matches} loading={submitting}>
              {actionLabel}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (matches) void confirm();
        }}
      >
        <SpaceBetween size="m">
          <Box variant="span">{description}</Box>
          <FormField label={<>Para confirmar, digite <i>{confirmationText}</i> no campo.</>}>
            <Input value={typed} onChange={({ detail }) => setTyped(detail.value)} placeholder={confirmationText} ariaRequired />
          </FormField>
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      </form>
    </Modal>
  );
}
