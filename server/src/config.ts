import { parsePortRange, type PortRange } from './forwarding/endpoints.js';

export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  emulatorEndpoint: string;
  region: string;
  syncIntervalMs: number;
  /** Faixa de portas fixas para repassar bancos e caches do emulador ao host; null desliga. */
  forwardPorts: PortRange | null;
  /** Pasta compartilhada com o container do emulador: versão em uso e pedidos de reinício. */
  emulatorInfoDir: string | undefined;
  /** Pasta com o build do frontend; ausente em desenvolvimento (o Vite serve a interface). */
  webDistDir: string | undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} deve ser um inteiro positivo`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: positiveInt(env, 'PORT', 8080),
    databaseUrl: required(env, 'DATABASE_URL'),
    emulatorEndpoint: env.EMULATOR_ENDPOINT ?? 'https://127.0.0.1:9297',
    // O emulador atende uma única região por instância.
    region: env.AWS_REGION ?? 'us-east-1',
    syncIntervalMs: positiveInt(env, 'SYNC_INTERVAL_MS', 15_000),
    forwardPorts: parsePortRange(env.FORWARD_PORTS),
    emulatorInfoDir: env.EMULATOR_INFO_DIR || undefined,
    webDistDir: env.WEB_DIST_DIR || undefined,
  };
}
