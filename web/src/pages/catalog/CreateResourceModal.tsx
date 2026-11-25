import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { catalogApi, type CreateResult, type TypeMeta } from '../../api/catalog';
import { FormModal } from '../../components/FormModal';
import { useNotifications } from '../../layout/notifications';
import { FieldsForm } from './FieldsForm';
import { formErrors, initialValues, toInput, type FormValues } from './fields';

interface CreateResourceModalProps {
  service: string;
  type: TypeMeta;
  parentId?: string;
  visible: boolean;
  onDismiss: () => void;
  onCreated: (result: CreateResult) => void;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function CreateResourceModal({ service, type, parentId, visible, onDismiss, onCreated }: CreateResourceModalProps) {
  const notifications = useNotifications();
  const fields = type.create?.fields ?? [];
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [showErrors, setShowErrors] = useState(false);
  const [revealed, setRevealed] = useState<CreateResult['reveal'] | null>(null);
  const valid = Object.keys(formErrors(fields, values)).length === 0;

  const reset = () => {
    setValues(initialValues(fields));
    setShowErrors(false);
  };

  return (
    <>
      <FormModal
        visible={visible}
        title={type.create?.label ?? `Criar ${type.singular}`}
        submitLabel={type.create?.label ?? 'Criar'}
        size="large"
        onSubmit={async () => {
          setShowErrors(true);
          if (!valid) throw new Error('Corrija os campos destacados.');
          const result = await catalogApi.create(service, type.key, toInput(fields, values), parentId);
          notifications.success(`${capitalize(type.singular)} "${result.id}" criado(a).`);
          if (result.reveal) setRevealed(result.reveal);
          reset();
          onCreated(result);
        }}
        onDismiss={onDismiss}
      >
        <FieldsForm fields={fields} values={values} onChange={setValues} showErrors={showErrors} />
      </FormModal>
      <Modal
        visible={revealed !== null}
        header={revealed?.label}
        closeAriaLabel="Fechar"
        onDismiss={() => setRevealed(null)}
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setRevealed(null)}>
              Concluído
            </Button>
          </Box>
        }
      >
        {revealed && (
          <SpaceBetween size="m">
            <Alert type="warning">{revealed.warning}</Alert>
            <CopyToClipboard variant="button" textToCopy={revealed.value} copyButtonText="Copiar" copySuccessText="Copiado" copyErrorText="Falha ao copiar" />
            <pre className="log-output">{revealed.value}</pre>
          </SpaceBetween>
        )}
      </Modal>
    </>
  );
}
