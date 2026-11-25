import { BadRequestError } from '../http/errors.js';
import type { FieldValue, Input, ResourceRow, StatusTone } from './types.js';

export const iso = (date: Date | string | undefined | null): string | null => {
  if (!date) return null;
  const value = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

/** Valor da tag Name, convenção do console para nomear recursos identificados por ID. */
export const tagValue = (tags: { Key?: string; Value?: string }[] | undefined, key = 'Name'): string | undefined =>
  tags?.find((t) => t.Key === key)?.Value;

/**
 * Recurso criado por outro serviço da AWS (stack do CloudFormation, grupo do Auto Scaling,
 * cluster do EKS). Só a AWS usa tags com o prefixo "aws:", então elas identificam esses casos.
 * Quem criou o recurso o recria na restauração; salvá-lo à parte o duplicaria.
 */
export function managedBy(tags: { Key?: string; Value?: string }[] | undefined): string | undefined {
  const stack = tagValue(tags, 'aws:cloudformation:stack-name');
  if (stack) return `stack ${stack}`;
  const tag = tags?.find((t) => t.Key?.startsWith('aws:'));
  return tag ? `${tag.Key} = ${tag.Value}` : undefined;
}

const TONES: [RegExp, StatusTone][] = [
  [/^(available|active|running|in[-_]?service|in[-_]?use|enabled|succeeded|ok|create_complete|update_complete|completed|issued|insync|deployed|ready|confirmed)$/i, 'success'],
  [/(fail|error|incompatible|inaccessible|rollback|alarm$)/i, 'error'],
  [/^(creating|pending|modifying|starting|updating|rebooting|backing-up|provisioning|in_progress|queued|running_query|create_in_progress|update_in_progress)$/i, 'in-progress'],
  [/^(deleting|shutting-down|stopping|delete_in_progress|pendingdeletion|pending_deletion|terminating)$/i, 'pending'],
  [/^(stopped|terminated|disabled|inactive|deleted|delete_complete|insufficient_data|cancelled)$/i, 'stopped'],
];

export function status(label: string | undefined): ResourceRow['status'] {
  if (!label) return undefined;
  const tone = TONES.find(([pattern]) => pattern.test(label))?.[1] ?? 'info';
  return { label, tone };
}

/** Endereço que o emulador devolve (127.0.0.1 ou 0.0.0.0) visto de dentro do compose. */
export function endpointText(address: string | undefined | null, port: number | string | undefined | null): string | null {
  if (!port) return null;
  const host = !address || address === '0.0.0.0' || address === '127.0.0.1' || address === 'localhost' ? 'emulator' : address;
  return `${host}:${port}`;
}

// ---- Leitura de entradas já validadas pelo schema da rota ----

export const str = (input: Input, name: string): string => {
  const value = input[name];
  return typeof value === 'string' ? value.trim() : value === undefined ? '' : String(value);
};

export const optStr = (input: Input, name: string): string | undefined => str(input, name) || undefined;

export const num = (input: Input, name: string): number | undefined => {
  const value = input[name];
  if (value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new BadRequestError(`${name} precisa ser um número.`);
  return n;
};

export const bool = (input: Input, name: string): boolean => input[name] === true || input[name] === 'true';

export const list = (input: Input, name: string): string[] => {
  const value = input[name];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  return [];
};

export function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError(`${label} não é um JSON válido.`);
  }
}

/** Remove chaves vazias da entrada salva, para não gravar campos que o usuário não preencheu. */
export function compact(input: Record<string, FieldValue | undefined | null>): Input {
  const result: Input = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

export const message = (text: string) => ({ kind: 'message' as const, text });

/** Pagina uma listagem com token até o fim. */
export async function paginate<T>(fetchPage: (token: string | undefined) => Promise<{ items: T[] | undefined; next: string | undefined }>): Promise<T[]> {
  const items: T[] = [];
  let token: string | undefined;
  do {
    const page = await fetchPage(token);
    items.push(...(page.items ?? []));
    token = page.next;
  } while (token);
  return items;
}
