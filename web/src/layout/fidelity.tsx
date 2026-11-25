import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { emulatorApi, type FidelityOverview, type FidelitySummary } from '../api/emulator';
import { useRemote } from '../hooks/useRemote';

interface Fidelity {
  overview: FidelityOverview | undefined;
  summary: (serviceId: string) => FidelitySummary | undefined;
}

const FidelityContext = createContext<Fidelity | null>(null);

/** Notas de fidelidade da versão do emulador em uso, carregadas uma vez para todo o console. */
export function FidelityProvider({ children }: { children: ReactNode }) {
  const remote = useRemote((signal) => emulatorApi.fidelity(signal), []);
  const value = useMemo<Fidelity>(() => {
    const overview = remote.data;
    return { overview, summary: (id) => (overview?.status === 'ok' ? overview.services[id] : undefined) };
  }, [remote.data]);
  return <FidelityContext.Provider value={value}>{children}</FidelityContext.Provider>;
}

export function useFidelity(): Fidelity {
  const context = useContext(FidelityContext);
  if (!context) throw new Error('useFidelity precisa de FidelityProvider');
  return context;
}
