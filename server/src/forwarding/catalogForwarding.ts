import type { FastifyBaseLogger } from 'fastify';
import type { CatalogRegistry } from '../catalog/registry.js';
import type { ResourceRow, ResourceType } from '../catalog/types.js';
import { describeError } from '../http/errors.js';
import type { PortForwarder } from './portForwarder.js';

/**
 * Liga o repasse aos tipos do catálogo que declaram `forward`. Além de atualizar ao listar
 * pelo painel, revisa periodicamente: depois de um reinício o emulador devolve os recursos
 * em portas novas, e o repasse precisa acompanhar mesmo sem ninguém abrir a tela.
 */
export class CatalogForwarding {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly registry: CatalogRegistry,
    private readonly forwarder: PortForwarder,
    private readonly intervalMs: number,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Acrescenta `localEndpoint` às linhas de uma lista completa de um tipo com repasse. */
  decorate(serviceId: string, type: ResourceType, rows: ResourceRow[]): Promise<ResourceRow[]> {
    if (!type.forward) return Promise.resolve(rows);
    return this.forwarder.apply({ scope: `${serviceId}/${type.key}`, attr: type.forward }, rows);
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.forwarder.stop();
  }

  private async refresh(): Promise<void> {
    for (const service of this.registry.services) {
      for (const type of service.types) {
        if (!type.forward) continue;
        try {
          await this.decorate(service.id, type, await type.list());
        } catch (err) {
          // Emulador fora do ar: mantém os repasses como estão até a próxima rodada.
          this.log.debug({ type: `${service.id}/${type.key}`, err: describeError(err) }, 'Repasse não atualizado');
        }
      }
    }
  }
}
