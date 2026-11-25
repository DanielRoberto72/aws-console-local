import { useCallback, useEffect, useRef, useState } from 'react';

export interface Remote<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

/**
 * Carrega um recurso remoto, cancelando a requisição anterior quando as dependências
 * mudam ou o componente é desmontado (evita respostas fora de ordem).
 */
export function useRemote<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): Remote<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, loading, error, reload };
}

/** Recarrega periodicamente enquanto a página estiver aberta e o polling estiver ativo. */
export function usePolling(reload: () => void, intervalMs: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [reload, intervalMs, enabled]);
}
