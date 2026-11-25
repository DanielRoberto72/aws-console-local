/** Regras puras do repasse de portas: onde estão os endpoints e qual porta local cada um recebe. */

export interface PortRange {
  first: number;
  last: number;
}

export interface Allocation {
  key: string;
  port: number;
  lastSeen: Date;
}

/** "4510-4549" -> faixa; vazio desliga o repasse (ex.: servidor rodando fora do compose). */
export function parsePortRange(raw: string | undefined): PortRange | null {
  if (!raw?.trim()) return null;
  const match = /^(\d+)-(\d+)$/.exec(raw.trim());
  const first = Number(match?.[1]);
  const last = Number(match?.[2]);
  if (!match || first < 1024 || last > 65535 || first > last) {
    throw new Error(`FORWARD_PORTS inválido: "${raw}". Use uma faixa como 4510-4549.`);
  }
  return { first, last };
}

const hostPattern = (host: string) => new RegExp(`\\b${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`, 'g');

/** Portas do emulador citadas no texto do endpoint ("emulator:5432", "amqps://emulator:5671, ..."). */
export function emulatorPorts(text: string, host: string): number[] {
  const pattern = hostPattern(host);
  return [...text.matchAll(pattern)].map((m) => Number(m[1]));
}

/** O mesmo texto com cada porta do emulador trocada pela porta local correspondente. */
export function localText(text: string, host: string, localPorts: (number | null)[]): string | null {
  let index = 0;
  let missing = false;
  const pattern = hostPattern(host);
  const result = text.replace(pattern, (whole) => {
    const local = localPorts[index++];
    if (local === null || local === undefined) {
      missing = true;
      return whole;
    }
    return `localhost:${local}`;
  });
  return missing ? null : result;
}

/**
 * Escolhe a porta local de um endpoint. A mesma chave mantém sempre a mesma porta, para
 * que a string de conexão no Mac não mude quando o emulador reinicia. Com a faixa cheia,
 * reaproveita a porta do endpoint inativo visto há mais tempo.
 */
export function choosePort(range: PortRange, allocations: readonly Allocation[], key: string, activeKeys: ReadonlySet<string>): number | null {
  const own = allocations.find((a) => a.key === key);
  if (own) return own.port;
  const used = new Set(allocations.map((a) => a.port));
  for (let port = range.first; port <= range.last; port++) {
    if (!used.has(port)) return port;
  }
  const reusable = allocations
    .filter((a) => !activeKeys.has(a.key) && a.port >= range.first && a.port <= range.last)
    .sort((a, b) => a.lastSeen.getTime() - b.lastSeen.getTime())[0];
  return reusable?.port ?? null;
}
