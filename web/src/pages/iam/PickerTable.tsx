import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import type { ReactNode } from 'react';
import { LoadError } from '../../components/ErrorAlert';
import { EmptyState } from '../../components/TableStates';
import { filterCountText, useConsoleCollection } from '../../components/useConsoleCollection';

interface PickerTableProps<T> {
  title: string;
  description?: ReactNode;
  resourceName: string;
  items: readonly T[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  columns: TableProps.ColumnDefinition<T>[];
  trackBy: keyof T & string;
  selected: readonly T[];
  onChange: (selected: T[]) => void;
  filters?: ReactNode;
  defaultSortField?: keyof T & string;
}

/** Tabela de seleção múltipla controlada, usada para escolher políticas, usuários e grupos. */
export function PickerTable<T>(props: PickerTableProps<T>) {
  const { title, resourceName, items, selected, onChange } = props;
  const collection = useConsoleCollection(items ?? [], {
    resourceName,
    empty: <EmptyState title={`Nenhum item em ${resourceName}`} />,
    pageSize: 10,
    defaultSortField: props.defaultSortField,
  });

  if (props.error && !items) return <LoadError error={props.error} onRetry={props.onRetry} />;

  return (
    <Table
      {...collection.collectionProps}
      variant="container"
      selectionType="multi"
      trackBy={props.trackBy}
      selectedItems={[...selected]}
      onSelectionChange={({ detail }) => onChange(detail.selectedItems)}
      header={
        <Header variant="h2" counter={selected.length ? `(${selected.length}/${items?.length ?? 0})` : `(${items?.length ?? 0})`} description={props.description}>
          {title}
        </Header>
      }
      loading={props.loading && !items}
      loadingText={`Carregando ${resourceName}`}
      items={collection.items}
      filter={
        <div className="picker-filters">
          <TextFilter
            {...collection.filterProps}
            filteringPlaceholder={`Filtrar ${resourceName}`}
            countText={filterCountText(collection.filteredItemsCount)}
          />
          {props.filters}
        </div>
      }
      pagination={<Pagination {...collection.paginationProps} />}
      columnDefinitions={props.columns}
    />
  );
}
