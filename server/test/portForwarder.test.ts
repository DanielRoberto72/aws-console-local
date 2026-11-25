import net from 'node:net';
import type { FastifyBaseLogger } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResourceRow } from '../src/catalog/types.js';
import { choosePort, emulatorPorts, localText, parsePortRange, type Allocation } from '../src/forwarding/endpoints.js';
import { PortForwarder, type AllocationStore } from '../src/forwarding/portForwarder.js';

const at = (iso: string) => new Date(iso);

describe('regras do repasse', () => {
  it('lê a faixa e recusa faixas inválidas', () => {
    expect(parsePortRange('4510-4549')).toEqual({ first: 4510, last: 4549 });
    expect(parsePortRange('')).toBeNull();
    expect(() => parsePortRange('80-90')).toThrow();
    expect(() => parsePortRange('5000-4000')).toThrow();
  });

  it('encontra as portas do emulador e troca pelo endereço local', () => {
    const text = 'amqps://emulator:5671, https://emulator:15671';
    expect(emulatorPorts(text, 'emulator')).toEqual([5671, 15671]);
    expect(localText(text, 'emulator', [4510, 4511])).toBe('amqps://localhost:4510, https://localhost:4511');
    expect(localText(text, 'emulator', [4510, null])).toBeNull();
    expect(emulatorPorts('db.exemplo.com:5432', 'emulator')).toEqual([]);
  });

  it('mantém a porta da chave, usa a menor livre e, com a faixa cheia, a do inativo mais antigo', () => {
    const range = { first: 4510, last: 4512 };
    const allocations: Allocation[] = [
      { key: 'rds/a', port: 4510, lastSeen: at('2026-01-03') },
      { key: 'rds/b', port: 4512, lastSeen: at('2026-01-01') },
    ];
    expect(choosePort(range, allocations, 'rds/a', new Set())).toBe(4510);
    expect(choosePort(range, allocations, 'rds/novo', new Set())).toBe(4511);

    const full = [...allocations, { key: 'rds/c', port: 4511, lastSeen: at('2026-01-02') }];
    expect(choosePort(range, full, 'rds/novo', new Set())).toBe(4512);
    expect(choosePort(range, full, 'rds/novo', new Set(['rds/b']))).toBe(4511);
    expect(choosePort(range, full, 'rds/novo', new Set(['rds/a', 'rds/b', 'rds/c']))).toBeNull();
  });
});

class MemoryStore implements AllocationStore {
  readonly rows = new Map<string, Allocation>();
  async all() {
    return [...this.rows.values()];
  }
  async save(key: string, port: number) {
    for (const [k, a] of this.rows) if (a.port === port && k !== key) this.rows.delete(k);
    this.rows.set(key, { key, port, lastSeen: new Date() });
  }
}

const silent = { info() {}, warn() {}, debug() {} } as unknown as FastifyBaseLogger;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** Servidor que responde com um prefixo, para saber qual "porta do emulador" atendeu. */
async function echoServer(prefix: string): Promise<number> {
  const server = net.createServer((socket) => socket.on('data', (data) => socket.write(`${prefix}:${data}`)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve) => server.close(() => resolve())));
  return (server.address() as net.AddressInfo).port;
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function ask(port: number, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(message));
    socket.once('data', (data) => {
      socket.destroy();
      resolve(String(data));
    });
    socket.once('error', reject);
  });
}

const row = (name: string, endpoint: string | null): ResourceRow => ({ id: name, name, attrs: { endpoint } });

describe('PortForwarder', () => {
  it('repassa para a porta atual e segue a porta nova sem mudar a local', async () => {
    const before = await echoServer('antes');
    const after = await echoServer('depois');
    const local = await freePort();
    const forwarder = new PortForwarder(new MemoryStore(), { first: local, last: local }, '127.0.0.1', '127.0.0.1', silent);
    cleanups.push(() => forwarder.stop());
    const source = { scope: 'rds/db-instance', attr: 'endpoint' };

    const [first] = await forwarder.apply(source, [row('app', `127.0.0.1:${before}`)]);
    expect(first!.attrs.localEndpoint).toBe(`localhost:${local}`);
    expect(await ask(local, 'oi')).toBe('antes:oi');

    // O emulador reiniciou e o banco voltou em outra porta.
    const [second] = await forwarder.apply(source, [row('app', `127.0.0.1:${after}`)]);
    expect(second!.attrs.localEndpoint).toBe(`localhost:${local}`);
    expect(await ask(local, 'oi')).toBe('depois:oi');
  });

  it('fecha o repasse quando o recurso some da lista', async () => {
    const target = await echoServer('x');
    const local = await freePort();
    const forwarder = new PortForwarder(new MemoryStore(), { first: local, last: local }, '127.0.0.1', '127.0.0.1', silent);
    cleanups.push(() => forwarder.stop());
    const source = { scope: 'rds/db-instance', attr: 'endpoint' };

    await forwarder.apply(source, [row('app', `127.0.0.1:${target}`)]);
    const [creating] = await forwarder.apply(source, [row('app', null)]);
    expect(creating!.attrs.localEndpoint).toBeUndefined();
    await expect(ask(local, 'oi')).rejects.toThrow();
  });
});
