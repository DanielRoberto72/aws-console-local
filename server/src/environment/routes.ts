import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import type { EnvironmentService } from './environmentService.js';

export function environmentRoutes(app: FastifyInstance, environment: EnvironmentService): void {
  app.get('/api/environment', async () => environment.status());

  app.get('/api/environment/export', async (_request, reply) => {
    const { file, filename } = await environment.export();
    return reply.header('content-type', 'application/gzip').header('content-disposition', `attachment; filename="${filename}"`).send(file);
  });

  app.post('/api/environment/import', async (request, reply) => {
    const part = await request.file();
    if (!part) throw new BadRequestError('Nenhum arquivo enviado.');
    await environment.import(await part.toBuffer());
    return reply.status(202).send({ ok: true });
  });

  app.post('/api/environment/reset', async (_request, reply) => {
    await environment.reset();
    return reply.status(202).send({ ok: true });
  });

  app.get('/api/environment/templates', async () => ({ templates: await environment.templates() }));

  app.post<{ Params: { id: string } }>(
    '/api/environment/templates/:id/load',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', maxLength: 64 } } } } },
    async (request, reply) => {
      await environment.loadTemplate(request.params.id);
      return reply.status(202).send({ ok: true });
    },
  );
}
