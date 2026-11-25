import { RETENTION_DAYS } from '../../api/logs';

export const retentionLabel = (days: number | null) => (days ? `${days} ${days === 1 ? 'dia' : 'dias'}` : 'Nunca expira');

export const retentionOptions = [
  { value: '', label: 'Nunca expira' },
  ...RETENTION_DAYS.map((days) => ({ value: String(days), label: retentionLabel(days) })),
];
