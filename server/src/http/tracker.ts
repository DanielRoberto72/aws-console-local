import type { ActivityLog, ServiceName } from '../activity/activityLog.js';

export type Track = <T>(action: string, target: string, run: () => Promise<T>) => Promise<T>;

/** Registra a ação no histórico e pede uma sincronização logo em seguida. */
export function createTracker(activity: ActivityLog, service: ServiceName, onChange: () => void): Track {
  return async (action, target, run) => {
    const result = await activity.track(service, action, target, run);
    onChange();
    return result;
  };
}

export interface RouteDeps {
  activity: ActivityLog;
  onChange: () => void;
}
