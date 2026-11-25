import Select from '@cloudscape-design/components/select';
import { useState } from 'react';
import { iamApi, type PolicySummary, type PolicyType } from '../../api/iam';
import { useRemote } from '../../hooks/useRemote';
import { POLICY_TYPE_LABELS } from './iamLinks';
import { PickerTable } from './PickerTable';

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'aws', label: POLICY_TYPE_LABELS.aws },
  { value: 'customer', label: POLICY_TYPE_LABELS.customer },
];

interface PolicyPickerProps {
  selected: readonly PolicySummary[];
  onChange: (selected: PolicySummary[]) => void;
  /** Políticas já anexadas, que não aparecem para nova seleção. */
  exclude?: readonly string[];
  title?: string;
}

/** Escolha de políticas de permissões, como a tabela do console ao anexar políticas. */
export function PolicyPicker({ selected, onChange, exclude = [], title = 'Políticas de permissões' }: PolicyPickerProps) {
  const policies = useRemote((signal) => iamApi.listPolicies(signal), []);
  const [type, setType] = useState<'all' | PolicyType>('all');
  const items = policies.data?.policies.filter((p) => !exclude.includes(p.arn) && (type === 'all' || p.type === type));
  const typeOption = TYPE_OPTIONS.find((o) => o.value === type)!;

  return (
    <PickerTable
      title={title}
      resourceName="políticas"
      items={items}
      loading={policies.loading}
      error={policies.error}
      onRetry={policies.reload}
      trackBy="arn"
      defaultSortField="name"
      selected={selected}
      onChange={onChange}
      filters={
        <Select
          selectedOption={typeOption}
          options={TYPE_OPTIONS}
          onChange={({ detail }) => setType(detail.selectedOption.value as typeof type)}
          ariaLabel="Filtrar por tipo"
        />
      }
      columns={[
        { id: 'name', header: 'Nome da política', sortingField: 'name', cell: (p) => p.name },
        { id: 'type', header: 'Tipo', sortingField: 'type', cell: (p) => POLICY_TYPE_LABELS[p.type] },
        { id: 'attachments', header: 'Entidades anexadas', sortingField: 'attachments', cell: (p) => p.attachments },
      ]}
    />
  );
}
