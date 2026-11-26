import { describe, expect, it } from 'vitest';
import { CATALOG_SERVICE_IDS } from '../src/catalog/ids.js';
import { aggregateScores, compareReports, type FidelityReport, type ServiceFidelity, type ScoreUnit } from '../src/emulator/fidelity.js';
import { SERVICE_NAMESPACES } from '../src/emulator/serviceNamespaces.js';
import { compareVersions, normalizeVersion, parseVersionOutput } from '../src/emulator/versions.js';

describe('versões do emulador', () => {
  it('lê a saída de --version', () => {
    expect(parseVersionOutput('Version: 1.0.589\nRelease date: 2026.11.23\nCommit: 84da19b\n')).toEqual({
      version: '1.0.589',
      releaseDate: '2026.11.23',
      commit: '84da19b',
    });
    expect(parseVersionOutput('qualquer coisa')).toBeNull();
  });

  it('normaliza o formato do pacote e do RPM e compara numericamente', () => {
    expect(normalizeVersion('1.0.609.1')).toBe('1.0.609');
    expect(normalizeVersion('1.0.589-1')).toBe('1.0.589');
    expect(normalizeVersion('v1.0.10')).toBe('1.0.10');
    expect(normalizeVersion(null)).toBeNull();
    expect(compareVersions('1.0.589', '1.0.609')).toBeLessThan(0);
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.609', '1.0.609')).toBe(0);
  });
});

const unit = (unitId: string, kind: string, outcome: string, services: string[], detail: ScoreUnit['detail'] = {}): ScoreUnit => ({
  unitId,
  kind,
  outcome,
  services: services.map((s) => `com.amazonaws.${s}#Api`),
  detail,
});

describe('aggregateScores', () => {
  const namespaces = { apigateway: ['apigatewayv2', 'apigateway'], sqs: ['sqs'], sns: ['sns'] };

  it('conta aprovados e falhas por tipo, sem contar os ignorados na nota', () => {
    const report = aggregateScores('1.0.1', {
      scoredAt: '2026-11-25T00:00:00Z',
      units: [
        unit('a', 'wire', 'pass', ['sqs']),
        unit('b', 'wire', 'fail', ['sqs'], { operation: 'SendMessage' }),
        unit('c', 'wire', 'fail', ['sqs'], { operation: 'SendMessage' }),
        unit('d', 'behavioral', 'pass', ['sqs']),
        unit('e', 'behavioral', 'fail', ['sqs'], { checkId: 'fifo-dedup' }),
        unit('f', 'behavioral', 'skipped', ['sqs']),
      ],
    }, namespaces);
    const sqs = report.services.sqs!;
    expect(sqs.wire).toEqual({ passed: 1, failed: 2 });
    expect(sqs.behavioral).toEqual({ passed: 1, failed: 1 });
    expect(sqs.skipped).toBe(1);
    expect(sqs.score).toBeCloseTo(2 / 5);
    expect(sqs.wireFailures).toEqual([{ name: 'SendMessage', failed: 2 }]);
    expect(sqs.behavioralFailures).toEqual([{ name: 'fifo-dedup', failed: 1 }]);
    expect(report.scoredAt).toBe('2026-11-25T00:00:00Z');
  });

  it('conta uma vez por serviço do console e uma vez para cada serviço envolvido', () => {
    const report = aggregateScores('1.0.1', {
      units: [
        unit('v1-v2', 'behavioral', 'pass', ['apigateway', 'apigatewayv2']),
        unit('sns-sqs', 'behavioral', 'fail', ['sns', 'sqs'], {}),
        unit('outro', 'wire', 'pass', ['ec2']),
      ],
    }, namespaces);
    expect(report.services.apigateway!.behavioral).toEqual({ passed: 1, failed: 0 });
    expect(report.services.sns!.behavioralFailures).toEqual([{ name: 'sns-sqs', failed: 1 }]);
    expect(report.services.sqs!.behavioral.failed).toBe(1);
    expect(report.services.ec2).toBeUndefined();
  });
});

describe('SERVICE_NAMESPACES', () => {
  it('cobre todos os serviços do catálogo', () => {
    for (const id of CATALOG_SERVICE_IDS) expect(SERVICE_NAMESPACES[id], id).toBeDefined();
  });
});

describe('compareReports', () => {
  const report = (version: string, scores: Record<string, number | null>): FidelityReport => ({
    version,
    scoredAt: null,
    services: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { score } as ServiceFidelity])),
  });

  it('lista só as notas que mudam, das que mais melhoram para as que mais pioram', () => {
    const changes = compareReports(
      report('1.0.1', { rds: 0.74, s3: 0.9, sqs: 0.95, kms: 0.5 }),
      report('1.0.2', { rds: 0.77, s3: 0.902, sqs: 0.9, kms: 0.6, eks: 0.8 }),
    );
    expect(changes).toEqual([
      { service: 'eks', before: null, after: 0.8 },
      { service: 'kms', before: 0.5, after: 0.6 },
      { service: 'rds', before: 0.74, after: 0.77 },
      { service: 'sqs', before: 0.95, after: 0.9 },
    ]);
  });
});
