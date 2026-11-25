import { useCollection } from '@cloudscape-design/collection-hooks';
import Button from '@cloudscape-design/components/button';
import type { ReactNode } from 'react';
import { EmptyState } from './TableStates';

interface Options<T> {
  resourceName: string;
  empty: ReactNode;
  pageSize?: number;
  defaultSortField?: keyof T & string;
}

/** Filtro, ordenação, paginação e seleção no padrão das tabelas do console. */
export function useConsoleCollection<T>(items: readonly T[], { resourceName, empty, pageSize = 20, defaultSortField }: Options<T>) {
  const collection = useCollection(items, {
    filtering: {
      empty,
      noMatch: (
        <EmptyState
          title="Nenhuma correspondência"
          subtitle={`Nenhum resultado de ${resourceName} para o filtro.`}
          action={<Button onClick={() => collection.actions.setFiltering('')}>Limpar filtro</Button>}
        />
      ),
    },
    pagination: { pageSize },
    sorting: defaultSortField ? { defaultState: { sortingColumn: { sortingField: defaultSortField } } } : {},
    selection: {},
  });
  return collection;
}

export const filterCountText = (count: number | undefined) => `${count ?? 0} ${count === 1 ? 'correspondência' : 'correspondências'}`;
