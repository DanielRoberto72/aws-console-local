import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import RadioGroup from '@cloudscape-design/components/radio-group';
import { useEffect, useState } from 'react';
import { ssmApi, type ParameterDetail, type ParameterKind } from '../../api/ssm';
import { CodeArea } from '../../components/CodeArea';
import { FormModal } from '../../components/FormModal';

const PARAMETER_NAME = /^[a-zA-Z0-9_.\-/]{1,2048}$/;

interface ParameterFormModalProps {
  visible: boolean;
  /** Parâmetro em edição; null cria um novo. */
  existing: ParameterDetail | null;
  onSaved: (name: string) => void;
  onDismiss: () => void;
}

/** Criação e edição compartilham o formulário, como no console (o nome só muda na criação). */
export function ParameterFormModal({ visible, existing, onSaved, onDismiss }: ParameterFormModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ParameterKind>('String');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(existing?.name ?? '');
    setType(existing?.type ?? 'String');
    setValue(existing?.value ?? '');
    setDescription('');
  }, [visible, existing]);

  const nameError = name && !PARAMETER_NAME.test(name) ? 'Use letras, números e _ . - /' : null;

  return (
    <FormModal
      visible={visible}
      title={existing ? 'Editar parâmetro' : 'Criar parâmetro'}
      submitLabel={existing ? 'Salvar alterações' : 'Criar parâmetro'}
      size="medium"
      canSubmit={!!name && !nameError && value.length > 0}
      onSubmit={async () => {
        const input = { name, type, value, description: description || undefined };
        if (existing) await ssmApi.update(input);
        else await ssmApi.create(input);
        onSaved(name);
      }}
      onDismiss={onDismiss}
    >
      <FormField label="Nome" description="Use / para hierarquias, como /minha-app/prod/url." errorText={nameError}>
        <Input value={name} onChange={({ detail }) => setName(detail.value)} disabled={!!existing} placeholder="/minha-app/prod/url" />
      </FormField>
      <FormField label="Descrição - opcional">
        <Input value={description} onChange={({ detail }) => setDescription(detail.value)} />
      </FormField>
      <FormField label="Tipo">
        <RadioGroup
          value={type}
          onChange={({ detail }) => setType(detail.value as ParameterKind)}
          items={[
            { value: 'String', label: 'String', description: 'Qualquer texto.' },
            { value: 'StringList', label: 'StringList', description: 'Valores separados por vírgula.' },
            { value: 'SecureString', label: 'SecureString', description: 'Valor criptografado com KMS.' },
          ]}
        />
      </FormField>
      <FormField label="Valor" constraintText="Até 4 KB no nível padrão." stretch>
        <CodeArea value={value} onChange={setValue} rows={5} ariaLabel="Valor do parâmetro" />
      </FormField>
    </FormModal>
  );
}
