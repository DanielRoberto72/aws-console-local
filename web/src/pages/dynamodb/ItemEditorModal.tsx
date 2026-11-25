import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import { useEffect, useState } from 'react';
import type { WireItem } from '../../api/dynamodb';
import { errorMessage } from '../../api/http';
import { parseItemText } from './itemDisplay';

interface ItemEditorModalProps {
  /** Item em edição; null cria um item novo. */
  item: WireItem | null;
  visible: boolean;
  keyAttributes: { name: string; type: string }[];
  onSave: (item: WireItem) => Promise<void>;
  onDismiss: () => void;
}

const templateFor = (keys: ItemEditorModalProps['keyAttributes']) =>
  JSON.stringify(Object.fromEntries(keys.map((k) => [k.name, { [k.type]: '' }])), null, 2);

export function ItemEditorModal({ item, visible, keyAttributes, onSave, onDismiss }: ItemEditorModalProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText(item ? JSON.stringify(item, null, 2) : templateFor(keyAttributes));
    setError(undefined);
  }, [visible, item, keyAttributes]);

  const save = async () => {
    const parsed = parseItemText(text, keyAttributes.map((k) => k.name));
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSave(parsed.item);
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
      size="large"
      onDismiss={() => !submitting && onDismiss()}
      header={item ? 'Editar item' : 'Criar item'}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={submitting}>
              {item ? 'Salvar' : 'Criar item'}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <FormField
          label="Atributos (DynamoDB JSON)"
          description='Cada atributo informa o tipo, como {"nome": {"S": "Ana"}, "idade": {"N": "30"}}. Binários em base64.'
          stretch
        >
          <Textarea value={text} onChange={({ detail }) => setText(detail.value)} rows={18} spellcheck={false} ariaLabel="Item em DynamoDB JSON" />
        </FormField>
        {item && <Alert type="info">Salvar substitui o item inteiro (PutItem). Alterar a chave cria um item novo.</Alert>}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  );
}
