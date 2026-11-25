import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '../http/errors.js';
import type { EmulatorInfo } from './emulatorInfo.js';

export function emulatorRoutes(app: FastifyInstance, info: EmulatorInfo): void {
  app.get('/api/emulator', async () => info.status());

  /** Resumo por serviço, para selos na navegação e na página inicial. */
  app.get('/api/emulator/fidelity', async () => {
    const result = await info.fidelity();
    if (result.status !== 'ok') return result;
    const { report, releaseUrl } = result;
    const services = Object.fromEntries(
      Object.entries(report.services).map(([id, s]) => [id, { score: s.score, total: s.total, wire: s.wire, behavioral: s.behavioral, skipped: s.skipped }]),
    );
    return { status: 'ok', version: report.version, scoredAt: report.scoredAt, releaseUrl, services };
  });

  app.get<{ Params: { service: string } }>(
    '/api/emulator/fidelity/:service',
    { schema: { params: { type: 'object', required: ['service'], properties: { service: { type: 'string', maxLength: 64 } } } } },
    async (request) => {
      const result = await info.fidelity();
      if (result.status !== 'ok') return result;
      const service = result.report.services[request.params.service];
      if (!service) throw new NotFoundError(`Sem notas de fidelidade para o serviço ${request.params.service}.`);
      return { status: 'ok', version: result.report.version, scoredAt: result.report.scoredAt, releaseUrl: result.releaseUrl, service };
    },
  );
}
