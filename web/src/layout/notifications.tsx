import type { FlashbarProps } from '@cloudscape-design/components/flashbar';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/http';

interface Notifications {
  items: FlashbarProps.MessageDefinition[];
  success: (content: ReactNode) => void;
  info: (content: ReactNode) => void;
  failure: (header: string, err: unknown) => void;
}

const NotificationsContext = createContext<Notifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  const push = useCallback((item: Omit<FlashbarProps.MessageDefinition, 'id' | 'dismissible' | 'onDismiss'>) => {
    const id = crypto.randomUUID();
    const dismiss = () => setItems((current) => current.filter((i) => i.id !== id));
    setItems((current) => [{ ...item, id, dismissible: true, dismissLabel: 'Fechar', onDismiss: dismiss }, ...current].slice(0, 5));
    // Sucessos e avisos informativos somem sozinhos; erros ficam até o usuário fechar.
    if (item.type !== 'error') setTimeout(dismiss, 6_000);
  }, []);

  const value = useMemo<Notifications>(
    () => ({
      items,
      success: (content) => push({ type: 'success', content }),
      info: (content) => push({ type: 'info', content }),
      failure: (header, err) => push({ type: 'error', header, content: errorMessage(err) }),
    }),
    [items, push],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): Notifications {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications precisa de NotificationsProvider');
  return context;
}
