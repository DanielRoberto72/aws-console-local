import { request, type Agent } from 'node:https';
import type { AwsClients } from '../aws/clients.js';
import type { IamService } from '../iam/iamService.js';
import type { DeliveryPermissions } from '../permissions/deliveryPermissions.js';

export interface EmulatorResponse {
  status: number;
  contentType: string;
  body: string;
}

/** Dependências compartilhadas pelas definições de serviço do catálogo. */
export interface CatalogContext {
  /** Cliente do SDK configurado para o emulador, criado uma vez por classe. */
  client<T>(ctor: new (config: ReturnType<CatalogContext['config']>) => T): T;
  config(): Record<string, unknown>;
  clients: AwsClients;
  iam: IamService;
  permissions: DeliveryPermissions;
  /** Requisição HTTPS a um endpoint aberto pelo emulador (API Gateway, OpenSearch). */
  fetch(url: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<EmulatorResponse>;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

export function createCatalogContext(deps: {
  config: Record<string, unknown>;
  clients: AwsClients;
  iam: IamService;
  permissions: DeliveryPermissions;
  emulatorEndpoint: string;
  agent: Agent;
}): CatalogContext {
  const cache = new Map<unknown, unknown>();
  return {
    config: () => deps.config,
    client<T>(ctor: new (config: Record<string, unknown>) => T): T {
      if (!cache.has(ctor)) cache.set(ctor, new ctor(deps.config));
      return cache.get(ctor) as T;
    },
    clients: deps.clients,
    iam: deps.iam,
    permissions: deps.permissions,
    fetch: (url, init) => emulatorFetch(url, init, deps.emulatorEndpoint, deps.agent),
  };
}

/**
 * O emulador devolve endereços como 127.0.0.1:porta, válidos só de dentro dele.
 * Aqui o host é trocado pelo do endpoint configurado ("emulator" no compose).
 */
function emulatorFetch(
  location: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
  endpoint: string,
  agent: Agent,
): Promise<EmulatorResponse> {
  const url = new URL(location);
  url.protocol = 'https:';
  url.hostname = new URL(endpoint).hostname;
  return new Promise((resolve, reject) => {
    const req = request(url, { agent, method: init.method, headers: init.headers, timeout: 30_000 }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk);
      });
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, contentType: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks).toString('utf8') }),
      );
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado na requisição ao emulador')));
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
