import Checkbox from '@cloudscape-design/components/checkbox';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Multiselect from '@cloudscape-design/components/multiselect';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import { catalogApi, type FieldOption, type FieldSpec } from '../../api/catalog';
import { errorMessage } from '../../api/http';
import { CodeArea } from '../../components/CodeArea';
import { useRemote } from '../../hooks/useRemote';
import { fieldError, type FormValues } from './fields';

interface FieldsFormProps {
  fields: readonly FieldSpec[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** Mostra os erros de validação (depois da primeira tentativa de envio). */
  showErrors: boolean;
}

/** Formulário gerado a partir dos campos declarados pelo catálogo. */
export function FieldsForm({ fields, values, onChange, showErrors }: FieldsFormProps) {
  const set = (name: string, value: FormValues[string]) => onChange({ ...values, [name]: value });
  return (
    <SpaceBetween size="m">
      {fields.map((field) => (
        <FormField
          key={field.name}
          label={field.required || field.type === 'boolean' ? field.label : `${field.label}${field.label.includes('opcional') ? '' : ' - opcional'}`}
          description={field.description}
          constraintText={field.patternHint}
          errorText={showErrors ? fieldError(field, values[field.name]) : null}
          stretch={field.type === 'code' || field.type === 'textarea'}
        >
          <FieldControl field={field} value={values[field.name]} onChange={(value) => set(field.name, value)} />
        </FormField>
      ))}
    </SpaceBetween>
  );
}

function FieldControl({ field, value, onChange }: { field: FieldSpec; value: FormValues[string] | undefined; onChange: (value: FormValues[string]) => void }) {
  const text = typeof value === 'string' ? value : '';
  switch (field.type) {
    case 'boolean':
      return (
        <Checkbox checked={value === true} onChange={({ detail }) => onChange(detail.checked)}>
          Sim
        </Checkbox>
      );
    case 'select':
    case 'multiselect':
      return <OptionsControl field={field} value={value} onChange={onChange} />;
    case 'code':
      return <CodeArea value={text} onChange={onChange} rows={field.rows ?? 8} ariaLabel={field.label} placeholder={field.placeholder} />;
    case 'textarea':
    case 'list':
      return (
        <Textarea
          value={text}
          onChange={({ detail }) => onChange(detail.value)}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          ariaLabel={field.label}
        />
      );
    default:
      return (
        <Input
          value={text}
          type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
          onChange={({ detail }) => onChange(detail.value)}
          placeholder={field.placeholder}
          ariaLabel={field.label}
        />
      );
  }
}

/** Opções fixas ou carregadas do servidor (recursos do catálogo ou de outros serviços). */
function OptionsControl({ field, value, onChange }: { field: FieldSpec; value: FormValues[string] | undefined; onChange: (value: FormValues[string]) => void }) {
  const remote = useRemote((signal) => (field.source ? catalogApi.options(field.source, signal) : Promise.resolve({ options: [] as FieldOption[] })), [field.source]);
  const options = field.source ? (remote.data?.options ?? []) : (field.options ?? []);
  const status = field.source ? (remote.loading ? 'loading' : remote.error ? 'error' : 'finished') : 'finished';
  const common = {
    options,
    filteringType: options.length > 8 ? ('auto' as const) : ('none' as const),
    statusType: status as 'loading' | 'error' | 'finished',
    loadingText: 'Carregando opções',
    errorText: remote.error ? errorMessage(remote.error) : undefined,
    empty: 'Nenhuma opção disponível',
    ariaLabel: field.label,
  };

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Multiselect
        {...common}
        selectedOptions={selected.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v })}
        onChange={({ detail }) => onChange(detail.selectedOptions.map((o) => o.value!))}
        placeholder="Escolha as opções"
        tokenLimit={3}
      />
    );
  }

  const current = typeof value === 'string' && value ? (options.find((o) => o.value === value) ?? { value, label: value }) : null;
  const withNone = field.required ? options : [{ value: '', label: '(nenhum)' }, ...options];
  return (
    <Select
      {...common}
      options={withNone}
      selectedOption={current}
      onChange={({ detail }) => onChange(detail.selectedOption.value ?? '')}
      placeholder="Escolha uma opção"
    />
  );
}
