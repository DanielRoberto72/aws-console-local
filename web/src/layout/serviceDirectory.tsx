import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { catalogApi, type ServiceMeta, type TypeMeta } from '../api/catalog';
import { useRemote } from '../hooks/useRemote';
import { mergeServices, STATIC_SERVICES, type ServiceEntry } from './services';

interface ServiceDirectory {
  /** Todos os serviços, os com telas próprias e os do catálogo. */
  services: ServiceEntry[];
  catalog: ServiceMeta[];
  catalogLoading: boolean;
  catalogError: unknown;
  reloadCatalog: () => void;
  serviceName: (id: string) => string;
  catalogService: (id: string) => ServiceMeta | undefined;
  typeMeta: (service: string, type: string) => TypeMeta | undefined;
}

const DirectoryContext = createContext<ServiceDirectory | null>(null);

/** Carrega o catálogo do servidor uma vez e o combina com os serviços estáticos. */
export function ServiceDirectoryProvider({ children }: { children: ReactNode }) {
  const meta = useRemote((signal) => catalogApi.meta(signal), []);

  const value = useMemo<ServiceDirectory>(() => {
    const catalog = meta.data?.services ?? [];
    const services = mergeServices(catalog);
    const catalogService = (id: string) => catalog.find((s) => s.id === id);
    return {
      services,
      catalog,
      catalogLoading: meta.loading,
      catalogError: meta.error,
      reloadCatalog: meta.reload,
      serviceName: (id) => services.find((s) => s.id === id)?.name ?? STATIC_SERVICES.find((s) => s.id === id)?.name ?? id,
      catalogService,
      typeMeta: (service, type) => catalogService(service)?.types.find((t) => t.key === type),
    };
  }, [meta.data, meta.loading, meta.error, meta.reload]);

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useServiceDirectory(): ServiceDirectory {
  const context = useContext(DirectoryContext);
  if (!context) throw new Error('useServiceDirectory precisa de ServiceDirectoryProvider');
  return context;
}
