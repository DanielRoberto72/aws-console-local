import { useState } from 'react';
import { useNotifications } from '../layout/notifications';

/** Executa uma ação pontual (ex.: ativar regra) com indicador de carga e notificação. */
export function useAction() {
  const notifications = useNotifications();
  const [running, setRunning] = useState(false);

  const run = async (action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> => {
    setRunning(true);
    try {
      await action();
      notifications.success(success);
      return true;
    } catch (err) {
      notifications.failure(failure, err);
      return false;
    } finally {
      setRunning(false);
    }
  };

  return { running, run };
}
