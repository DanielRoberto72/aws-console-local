import net from 'node:net';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/pool.js';
import { describeError } from '../http/errors.js';
import type { ResourceRow } from '../catalog/types.js';
import { choosePort, emulatorPorts, localText, type Allocation, type PortRange } from './endpoints.js';

/** Onde ficam as portas já atribuídas; separado para testar o repasse sem Postgres. */
export interface AllocationStore {
  all(): Promise<Allocation[]>;
  save(key: string, port: number): Promise<void>;
}

export class PgAllocationStore implements AllocationStore {
  constructor(private readonly db: Db) {}

  async all(): Promise<Allocation[]> {
    const { rows } = await this.db.query<{ key: string; local_port: number; last_seen: Date }>('SELECT key, local_port, last_seen FROM port_forwards');
    return rows.map((r) => ({ key: r.key, port: r.local_port, lastSeen: r.last_seen }));
  }

  /** A porta pode ter sido de outra chave (reaproveitada): a linha antiga sai na mesma transação. */
  async save(key: string, port: number): Promise<void> {
    await this.db.query(
      `WITH freed AS (DELETE FROM port_forwards WHERE local_port = $2 AND key <> $1)
       INSERT INTO port_forwards (key, local_port, last_seen) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET local_port = EXCLUDED.local_port, last_seen = now()`,
      [key, port],
    );
  }
}

interface Listener {
  server: net.Server;
  targetPort: number;
  sockets: Set<net.Socket>;
}

export interface ForwardSource {
  /** "serviço/tipo", prefixo das chaves dos endpoints desse tipo. */
  scope: string;
  /** Atributo da linha com o endpoint visto pela rede do compose. */
  attr: string;
}

/**
 * Repasse TCP de portas fixas no app para as portas que o emulador sorteia para bancos,
 * caches e brokers. Assim o Mac conecta sempre em localhost:<porta fixa>, mesmo depois
 * de o emulador reiniciar e o recurso voltar em outra porta.
 */
export class PortForwarder {
  private readonly listeners = new Map<string, Listener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: AllocationStore,
    private readonly range: PortRange,
    private readonly targetHost: string,
    private readonly listenHost: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Garante o repasse dos endpoints das linhas e acrescenta `localEndpoint` a cada uma.
   * As linhas são a lista completa do tipo: endpoints que sumiram têm o repasse fechado.
   */
  apply(source: ForwardSource, rows: ResourceRow[]): Promise<ResourceRow[]> {
    // Lista do painel e atualização periódica podem rodar juntas; a atribuição é serial.
    const run = this.queue.then(() => this.applyNow(source, rows));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async stop(): Promise<void> {
    await Promise.all([...this.listeners.keys()].map((key) => this.close(key)));
  }

  private async applyNow({ scope, attr }: ForwardSource, rows: ResourceRow[]): Promise<ResourceRow[]> {
    const wanted = new Map<string, number>();
    const perRow = rows.map((row) => {
      const text = row.attrs[attr];
      const ports = typeof text === 'string' ? emulatorPorts(text, this.targetHost) : [];
      const keys = ports.map((port, i) => {
        const key = `${scope}/${row.name}${i ? `#${i}` : ''}`;
        wanted.set(key, port);
        return key;
      });
      return { row, text, keys };
    });

    for (const key of this.listeners.keys()) {
      if (key.startsWith(`${scope}/`) && !wanted.has(key)) await this.close(key);
    }

    const localPorts = new Map<string, number | null>();
    if (wanted.size) {
      const allocations = await this.store.all();
      for (const [key, targetPort] of wanted) {
        localPorts.set(key, await this.ensure(key, targetPort, allocations));
      }
    }

    return perRow.map(({ row, text, keys }) => {
      if (typeof text !== 'string' || !keys.length) return row;
      const local = localText(text, this.targetHost, keys.map((k) => localPorts.get(k) ?? null));
      return { ...row, attrs: { ...row.attrs, localEndpoint: local } };
    });
  }

  private async ensure(key: string, targetPort: number, allocations: Allocation[]): Promise<number | null> {
    const port = choosePort(this.range, allocations, key, new Set(this.listeners.keys()));
    if (port === null) {
      this.log.warn({ key }, 'Sem porta livre para repasse; aumente FORWARD_PORTS');
      return null;
    }
    const previous = allocations.find((a) => a.port === port && a.key !== key);
    // Porta reaproveitada de um endpoint inativo: o repasse antigo dele precisa sair.
    if (previous) await this.close(previous.key);
    // Salvar sempre renova last_seen, que decide quem perde a porta quando a faixa enche.
    await this.store.save(key, port);
    const others = allocations.filter((a) => a.port !== port && a.key !== key);
    allocations.splice(0, allocations.length, ...others, { key, port, lastSeen: new Date() });

    const current = this.listeners.get(key);
    if (current) {
      // O emulador reiniciou e o recurso voltou em outra porta: novas conexões seguem a porta nova.
      current.targetPort = targetPort;
      return port;
    }
    return (await this.open(key, port, targetPort)) ? port : null;
  }

  private open(key: string, port: number, targetPort: number): Promise<boolean> {
    const listener: Listener = { server: net.createServer(), targetPort, sockets: new Set() };
    listener.server.on('connection', (client) => {
      const upstream = net.connect(listener.targetPort, this.targetHost);
      listener.sockets.add(client).add(upstream);
      client.pipe(upstream).pipe(client);
      const end = () => {
        client.destroy();
        upstream.destroy();
        listener.sockets.delete(client);
        listener.sockets.delete(upstream);
      };
      client.on('error', end);
      upstream.on('error', end);
      client.on('close', end);
      upstream.on('close', end);
    });
    return new Promise((resolve) => {
      listener.server.once('error', (err) => {
        this.log.warn({ key, port, err: describeError(err) }, 'Falha ao abrir porta de repasse');
        resolve(false);
      });
      listener.server.listen(port, this.listenHost, () => {
        this.listeners.set(key, listener);
        this.log.info({ key, port, targetPort }, 'Repasse aberto');
        resolve(true);
      });
    });
  }

  private close(key: string): Promise<void> {
    const listener = this.listeners.get(key);
    if (!listener) return Promise.resolve();
    this.listeners.delete(key);
    // O recurso sumiu ou perdeu a porta: as conexões abertas apontariam para o lugar errado.
    for (const socket of listener.sockets) socket.destroy();
    return new Promise((resolve) => listener.server.close(() => resolve()));
  }
}
