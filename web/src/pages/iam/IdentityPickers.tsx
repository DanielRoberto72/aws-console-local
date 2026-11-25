import { iamApi, type GroupSummary, type UserSummary } from '../../api/iam';
import { formatDate } from '../../components/format';
import { useRemote } from '../../hooks/useRemote';
import { PickerTable } from './PickerTable';

interface PickerProps<T> {
  selected: readonly T[];
  onChange: (selected: T[]) => void;
  /** Nomes que não aparecem para seleção (ex.: grupos de que o usuário já faz parte). */
  exclude?: readonly string[];
  title: string;
}

export function GroupPicker({ selected, onChange, exclude = [], title }: PickerProps<GroupSummary>) {
  const groups = useRemote((signal) => iamApi.listGroups(signal), []);
  return (
    <PickerTable
      title={title}
      resourceName="grupos"
      items={groups.data?.groups.filter((g) => !exclude.includes(g.name))}
      loading={groups.loading}
      error={groups.error}
      onRetry={groups.reload}
      trackBy="name"
      defaultSortField="name"
      selected={selected}
      onChange={onChange}
      columns={[
        { id: 'name', header: 'Nome do grupo', sortingField: 'name', cell: (g) => g.name },
        { id: 'users', header: 'Usuários', sortingField: 'users', cell: (g) => g.users },
        { id: 'policies', header: 'Políticas', sortingField: 'policies', cell: (g) => g.policies },
        { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (g) => formatDate(g.createdAt) },
      ]}
    />
  );
}

export function UserPicker({ selected, onChange, exclude = [], title }: PickerProps<UserSummary>) {
  const users = useRemote((signal) => iamApi.listUsers(signal), []);
  return (
    <PickerTable
      title={title}
      resourceName="usuários"
      items={users.data?.users.filter((u) => !exclude.includes(u.name))}
      loading={users.loading}
      error={users.error}
      onRetry={users.reload}
      trackBy="name"
      defaultSortField="name"
      selected={selected}
      onChange={onChange}
      columns={[
        { id: 'name', header: 'Nome do usuário', sortingField: 'name', cell: (u) => u.name },
        { id: 'groups', header: 'Grupos', cell: (u) => u.groups.length },
        { id: 'created', header: 'Criação', sortingField: 'createdAt', cell: (u) => (u.builtIn ? 'Embutido no emulador' : formatDate(u.createdAt)) },
      ]}
    />
  );
}
