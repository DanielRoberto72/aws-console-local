import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import type { ReactNode } from 'react';
import { LoadError } from './ErrorAlert';
import { filterCountText, useConsoleCollection } from './useConsoleCollection';

interface ResourceTableProps<T> {
  title: string;
  description?: ReactNode;
  resourceName: string;
  items: readonly T[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  columns: TableProps.ColumnDefinition<T>[];
  trackBy: keyof T & string;
  empty: ReactNode;
  /** Ações do cabeçalho, recebendo os itens selecionados. */
  actions: (selected: T[]) => ReactNode;
  /** 'none' para tabelas só de leitura. */
  selectionType?: TableProps.SelectionType | 'none';
  variant?: TableProps.Variant;
  filteringPlaceholder?: string;
  defaultSortField?: keyof T & string;
}

/** Tabela de recursos do console: filtro, ordenação, paginação, seleção e estados de carga. */
export function ResourceTable<T>({
  title,
  description,
  resourceName,
  items,
  loading,
  error,
  onRetry,
  columns,
  trackBy,
  empty,
  actions,
  selectionType = 'single',
  variant = 'full-page',
  filteringPlaceholder,
  defaultSortField,
}: ResourceTableProps<T>) {
  const collection = useConsoleCollection(items ?? [], { resourceName, empty, defaultSortField });
  const selected = [...(collection.collectionProps.selectedItems ?? [])];

  if (error && !items) return <LoadError error={error} onRetry={onRetry} />;

  return (
    <Table
      {...collection.collectionProps}
      variant={variant}
      selectionType={selectionType === 'none' ? undefined : selectionType}
      trackBy={trackBy}
      header={
        <Header
          variant={variant === 'full-page' ? 'awsui-h1-sticky' : 'h2'}
          counter={`(${items?.length ?? 0})`}
          description={description}
          actions={actions(selected)}
        >
          {title}
        </Header>
      }
      loading={loading && !items}
      loadingText={`Carregando ${resourceName}`}
      items={collection.items}
      filter={
        <TextFilter
          {...collection.filterProps}
          filteringPlaceholder={filteringPlaceholder ?? `Encontrar ${resourceName}`}
          countText={filterCountText(collection.filteredItemsCount)}
        />
      }
      pagination={<Pagination {...collection.paginationProps} />}
      columnDefinitions={columns}
    />
  );
}
