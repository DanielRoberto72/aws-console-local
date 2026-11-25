/**
 * Notas de fidelidade publicadas a cada versão do AWS Emulator (scores.json.gz da release).
 * Cada unidade é um teste que compara o emulador com a AWS: "wire" confere o formato da
 * resposta de uma operação; "behavioral" confere um comportamento (checkId).
 */

export interface ScoreUnit {
  unitId: string;
  kind: string;
  outcome: string;
  services: string[];
  detail?: { operation?: string; checkId?: string };
}

export interface ScoresDocument {
  commit?: string;
  scoredAt?: string;
  units: ScoreUnit[];
}

export interface Tally {
  passed: number;
  failed: number;
}

export interface FailureGroup {
  /** Operação (formato) ou identificador do comportamento verificado. */
  name: string;
  failed: number;
}

export interface ServiceFidelity {
  /** Fração de testes aprovados (0 a 1), sem contar os ignorados. Null sem testes. */
  score: number | null;
  total: Tally;
  wire: Tally;
  behavioral: Tally;
  skipped: number;
  /** Operações cujo formato de resposta difere da AWS, das que mais falham para as que menos. */
  wireFailures: FailureGroup[];
  /** Comportamentos que diferem da AWS. */
  behavioralFailures: FailureGroup[];
}

export interface FidelityReport {
  version: string;
  scoredAt: string | null;
  services: Record<string, ServiceFidelity>;
}

const namespaceOf = (service: string) => service.replace(/^com\.amazonaws\./, '').split('#')[0]!;

const ratio = ({ passed, failed }: Tally) => (passed + failed ? passed / (passed + failed) : null);

function sortedGroups(counts: Map<string, number>): FailureGroup[] {
  return [...counts].map(([name, failed]) => ({ name, failed })).sort((a, b) => b.failed - a.failed || a.name.localeCompare(b.name));
}

/**
 * Agrega as unidades por serviço do console. Um teste que envolve dois namespaces do mesmo
 * serviço (ex.: apigateway e apigatewayv2) conta uma vez; testes entre serviços distintos
 * (ex.: SNS entregando no SQS) contam para cada um deles.
 */
export function aggregateScores(version: string, doc: ScoresDocument, namespaces: Record<string, readonly string[]>): FidelityReport {
  const serviceByNamespace = new Map<string, string[]>();
  for (const [service, list] of Object.entries(namespaces)) {
    for (const ns of list) serviceByNamespace.set(ns, [...(serviceByNamespace.get(ns) ?? []), service]);
  }

  const acc = new Map<string, { wire: Tally; behavioral: Tally; skipped: number; wireFailures: Map<string, number>; behavioralFailures: Map<string, number> }>();
  for (const unit of doc.units) {
    const services = new Set(unit.services.flatMap((s) => serviceByNamespace.get(namespaceOf(s)) ?? []));
    for (const service of services) {
      let entry = acc.get(service);
      if (!entry) {
        entry = { wire: { passed: 0, failed: 0 }, behavioral: { passed: 0, failed: 0 }, skipped: 0, wireFailures: new Map(), behavioralFailures: new Map() };
        acc.set(service, entry);
      }
      const wire = unit.kind === 'wire';
      const tally = wire ? entry.wire : entry.behavioral;
      if (unit.outcome === 'pass') tally.passed++;
      else if (unit.outcome === 'fail') {
        tally.failed++;
        const name = (wire ? unit.detail?.operation : unit.detail?.checkId) ?? unit.unitId;
        const groups = wire ? entry.wireFailures : entry.behavioralFailures;
        groups.set(name, (groups.get(name) ?? 0) + 1);
      } else entry.skipped++;
    }
  }

  const services: Record<string, ServiceFidelity> = {};
  for (const [service, e] of acc) {
    const total = { passed: e.wire.passed + e.behavioral.passed, failed: e.wire.failed + e.behavioral.failed };
    services[service] = {
      score: ratio(total),
      total,
      wire: e.wire,
      behavioral: e.behavioral,
      skipped: e.skipped,
      wireFailures: sortedGroups(e.wireFailures),
      behavioralFailures: sortedGroups(e.behavioralFailures),
    };
  }
  return { version, scoredAt: doc.scoredAt ?? null, services };
}
