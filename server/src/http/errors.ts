import type { FastifyError, FastifyInstance } from 'fastify';

export interface ApiErrorBody {
  code: string;
  message: string;
}

/** Erro de requisição gerado pela própria API (não pelo emulador). */
export class BadRequestError extends Error {
  constructor(message: string, readonly code = 'BadRequest') {
    super(message);
  }
}

/** Recurso inexistente, detectado pela própria API (ex.: busca por nome). */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

interface AwsLikeError {
  name: string;
  message: string;
  $metadata?: { httpStatusCode?: number };
  $fault?: 'client' | 'server';
}

function isAwsError(err: unknown): err is AwsLikeError {
  return typeof err === 'object' && err !== null && '$metadata' in err;
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * Converte falhas em respostas consistentes: erros de validação e de negócio do
 * emulador chegam à interface com código e mensagem da AWS; falhas técnicas viram
 * 502 (emulador) ou 500 (aplicação) sem expor detalhes internos.
 */
export function toHttpError(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof BadRequestError) return { status: 400, body: { code: err.code, message: err.message } };
  if (err instanceof NotFoundError) return { status: 404, body: { code: 'NotFound', message: err.message } };

  const fastifyErr = err as Partial<FastifyError>;
  if (fastifyErr.validation) {
    return { status: 400, body: { code: 'ValidationError', message: fastifyErr.message ?? 'Requisição inválida' } };
  }
  if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500 && fastifyErr.code) {
    return { status: fastifyErr.statusCode, body: { code: fastifyErr.code, message: fastifyErr.message ?? '' } };
  }

  // Falha de conexão chega embrulhada pelo SDK (com $metadata); trata antes dos erros da AWS.
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'EHOSTUNREACH') {
    return { status: 503, body: { code: 'EmulatorUnavailable', message: 'O emulador não está acessível.' } };
  }

  if (isAwsError(err)) {
    const status = err.$metadata?.httpStatusCode;
    if (err.$fault === 'client' && status && status >= 400 && status < 500) {
      return { status, body: { code: err.name, message: err.message } };
    }
    return { status: 502, body: { code: err.name, message: `O emulador falhou: ${err.message}` } };
  }

  return { status: 500, body: { code: 'InternalError', message: 'Erro interno. Veja os logs do servidor.' } };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    const { status, body } = toHttpError(err);
    if (status >= 500) request.log.error({ err }, 'falha ao processar requisição');
    void reply.status(status).send(body);
  });
}
