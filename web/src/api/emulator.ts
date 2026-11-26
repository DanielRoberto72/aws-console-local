import { encode, request } from './http';

export interface InstalledVersion {
  version: string;
  releaseDate: string | null;
  commit: string | null;
}

export interface EmulatorVersionStatus {
  installed: InstalledVersion | null;
  latest: { version: string; checkedAt: string } | null;
  latestError: string | null;
  updateAvailable: boolean;
  releasesUrl: string;
}

export interface Tally {
  passed: number;
  failed: number;
}

export interface FidelitySummary {
  score: number | null;
  total: Tally;
  wire: Tally;
  behavioral: Tally;
  skipped: number;
}

export interface FailureGroup {
  name: string;
  failed: number;
}

export interface FidelityDetail extends FidelitySummary {
  wireFailures: FailureGroup[];
  behavioralFailures: FailureGroup[];
}

type Unavailable = { status: 'unavailable'; reason: string };
interface Published {
  status: 'ok';
  version: string;
  scoredAt: string | null;
  releaseUrl: string;
}

export type FidelityOverview = (Published & { services: Record<string, FidelitySummary> }) | Unavailable;
export type ServiceFidelityResponse = (Published & { service: FidelityDetail }) | Unavailable;

export interface ScoreChange {
  service: string;
  before: number | null;
  after: number | null;
}

export type FidelityChange = { status: 'ok'; from: string; to: string; changes: ScoreChange[] } | Unavailable;

export const emulatorApi = {
  fidelityChange: (signal?: AbortSignal) => request<FidelityChange>('/api/emulator/fidelity-change', { signal }),
  status: (signal?: AbortSignal) => request<EmulatorVersionStatus>('/api/emulator', { signal }),
  fidelity: (signal?: AbortSignal) => request<FidelityOverview>('/api/emulator/fidelity', { signal }),
  serviceFidelity: (service: string, signal?: AbortSignal) => request<ServiceFidelityResponse>(`/api/emulator/fidelity/${encode(service)}`, { signal }),
};
