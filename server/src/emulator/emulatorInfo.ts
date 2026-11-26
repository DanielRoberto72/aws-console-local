import { gunzipSync } from 'node:zlib';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/pool.js';
import type { EmulatorControl } from '../environment/emulatorControl.js';
import { describeError } from '../http/errors.js';
import { aggregateScores, compareReports, type FidelityReport, type ScoreChange, type ScoresDocument } from './fidelity.js';
import { SERVICE_NAMESPACES } from './serviceNamespaces.js';
import { compareVersions, normalizeVersion, type InstalledVersion } from './versions.js';

/** Mesmo canal do emulator/Dockerfile: a URL sempre aponta para o pacote mais recente. */
const PACKAGE_URL = 'https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest';
const RELEASES_URL = 'https://github.com/aws/aws-emulator/releases';
const LATEST_TTL_MS = 60 * 60_000;
/** Depois de uma falha de rede, espera antes de tentar de novo (o console consulta a cada página). */
const RETRY_AFTER_MS = 10 * 60_000;
const MAX_SCORES_BYTES = 50 * 1024 * 1024;
const MAX_SCORES_JSON_BYTES = 500 * 1024 * 1024;

export interface LatestVersion {
  version: string;
  checkedAt: string;
}

export interface EmulatorVersionStatus {
  installed: InstalledVersion | null;
  latest: LatestVersion | null;
  latestError: string | null;
  updateAvailable: boolean;
  releasesUrl: string;
}

type Unavailable = { status: 'unavailable'; reason: string };
export type FidelityResult = { status: 'ok'; report: FidelityReport; releaseUrl: string } | Unavailable;
export type FidelityChangeResult = { status: 'ok'; from: string; to: string; changes: ScoreChange[] } | Unavailable;

class UnavailableError extends Error {}

const releaseUrl = (version: string) => `${RELEASES_URL}/tag/v${version}`;
const packageArch = () => (process.arch === 'arm64' ? 'aarch64' : 'x86_64');

/**
 * Versão do emulador em uso, versão mais recente publicada e notas de fidelidade.
 * Tudo que vem da internet é opcional: sem rede, o console só deixa de mostrar a informação.
 */
export class EmulatorInfo {
  private latestCache: { value: LatestVersion | null; error: string | null; until: number } | null = null;
  private readonly reports = new Map<string, FidelityReport>();
  private readonly failures = new Map<string, { reason: string; until: number }>();
  private readonly inFlight = new Map<string, Promise<FidelityReport>>();

  constructor(
    private readonly db: Db,
    private readonly control: EmulatorControl,
    private readonly log: FastifyBaseLogger,
  ) {}

  installed(): Promise<InstalledVersion | null> {
    return this.control.installedVersion();
  }

  async status(): Promise<EmulatorVersionStatus> {
    const [installed, latest] = await Promise.all([this.installed(), this.latest()]);
    return {
      installed,
      latest: latest.value,
      latestError: latest.error,
      updateAvailable: Boolean(installed && latest.value && compareVersions(installed.version, latest.value.version) < 0),
      releasesUrl: RELEASES_URL,
    };
  }

  async fidelity(): Promise<FidelityResult> {
    const installed = await this.installed();
    if (!installed) return { status: 'unavailable', reason: 'A versão do emulador em uso não é conhecida (o app roda fora do Docker Compose?).' };
    return this.fidelityOf(installed.version);
  }

  /** O que muda nas notas ao atualizar para a versão mais recente; só baixa se houver atualização. */
  async fidelityChange(): Promise<FidelityChangeResult> {
    const status = await this.status();
    if (!status.updateAvailable || !status.installed || !status.latest) return { status: 'unavailable', reason: 'Não há versão mais recente do emulador.' };
    const [before, after] = await Promise.all([this.fidelityOf(status.installed.version), this.fidelityOf(status.latest.version)]);
    if (before.status !== 'ok') return before;
    if (after.status !== 'ok') return after;
    return { status: 'ok', from: before.report.version, to: after.report.version, changes: compareReports(before.report, after.report) };
  }

  private async fidelityOf(version: string): Promise<FidelityResult> {
    const failure = this.failures.get(version);
    if (failure && failure.until > Date.now()) return { status: 'unavailable', reason: failure.reason };
    try {
      return { status: 'ok', report: await this.report(version), releaseUrl: releaseUrl(version) };
    } catch (err) {
      const reason = err instanceof UnavailableError ? err.message : `Não foi possível baixar as notas da versão ${version}: ${describeError(err)}`;
      this.log.warn({ version, err: describeError(err) }, 'Notas de fidelidade indisponíveis');
      this.failures.set(version, { reason, until: Date.now() + RETRY_AFTER_MS });
      return { status: 'unavailable', reason };
    }
  }

  private async latest(): Promise<{ value: LatestVersion | null; error: string | null }> {
    if (this.latestCache && this.latestCache.until > Date.now()) return this.latestCache;
    try {
      // HEAD: o metadado do pacote traz a versão sem baixar os ~190 MB.
      const response = await fetch(`${PACKAGE_URL}/aws-emulator-${packageArch()}.rpm`, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
      const version = normalizeVersion(response.headers.get('x-amz-meta-package-version'));
      if (!response.ok || !version) throw new Error(`resposta HTTP ${response.status} sem versão do pacote`);
      this.latestCache = { value: { version, checkedAt: new Date().toISOString() }, error: null, until: Date.now() + LATEST_TTL_MS };
    } catch (err) {
      this.latestCache = { value: null, error: `Não foi possível consultar a versão mais recente: ${describeError(err)}`, until: Date.now() + RETRY_AFTER_MS };
    }
    return this.latestCache;
  }

  private report(version: string): Promise<FidelityReport> {
    const cached = this.reports.get(version);
    if (cached) return Promise.resolve(cached);
    let pending = this.inFlight.get(version);
    if (!pending) {
      pending = this.loadReport(version).finally(() => this.inFlight.delete(version));
      this.inFlight.set(version, pending);
    }
    return pending;
  }

  /** O arquivo bruto fica no banco: a agregação é refeita se o mapeamento de serviços mudar. */
  private async loadReport(version: string): Promise<FidelityReport> {
    const { rows } = await this.db.query<{ document: Buffer }>('SELECT document FROM emulator_scores WHERE version = $1', [version]);
    let gzipped = rows[0]?.document;
    if (!gzipped) {
      gzipped = await this.download(version);
      await this.db.query('INSERT INTO emulator_scores (version, document) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING', [version, gzipped]);
    }
    const doc = JSON.parse(gunzipSync(gzipped, { maxOutputLength: MAX_SCORES_JSON_BYTES }).toString('utf8')) as ScoresDocument;
    if (!Array.isArray(doc.units)) throw new Error('arquivo de notas em formato desconhecido');
    const report = aggregateScores(version, doc, SERVICE_NAMESPACES);
    this.reports.set(version, report);
    return report;
  }

  private async download(version: string): Promise<Buffer> {
    const response = await fetch(`${RELEASES_URL}/download/v${version}/scores.json.gz`, { signal: AbortSignal.timeout(60_000) });
    if (response.status === 404) throw new UnavailableError(`A versão ${version} do emulador não publicou notas de fidelidade.`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_SCORES_BYTES) throw new Error('arquivo de notas maior que o esperado');
    return body;
  }
}
