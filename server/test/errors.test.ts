import { describe, expect, it } from 'vitest';
import { BadRequestError, toHttpError } from '../src/http/errors.js';

const awsError = (name: string, status: number, fault: 'client' | 'server') =>
  Object.assign(new Error(`falha ${name}`), { name, $fault: fault, $metadata: { httpStatusCode: status } });

describe('toHttpError', () => {
  it('repassa erros de negócio do emulador com o código da AWS', () => {
    expect(toHttpError(awsError('BucketNotEmpty', 409, 'client'))).toEqual({
      status: 409,
      body: { code: 'BucketNotEmpty', message: 'falha BucketNotEmpty' },
    });
  });

  it('converte falhas do emulador em 502', () => {
    expect(toHttpError(awsError('InternalError', 500, 'server')).status).toBe(502);
  });

  it('indica emulador indisponível mesmo quando o SDK embrulha a falha de conexão', () => {
    const wrapped = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED', $metadata: {} });
    expect(toHttpError(wrapped)).toMatchObject({ status: 503, body: { code: 'EmulatorUnavailable' } });
  });

  it('indica emulador indisponível quando a conexão é recusada', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(toHttpError(err)).toMatchObject({ status: 503, body: { code: 'EmulatorUnavailable' } });
  });

  it('usa 400 para erros da própria API e esconde detalhes de erros inesperados', () => {
    expect(toHttpError(new BadRequestError('ruim')).status).toBe(400);
    expect(toHttpError(new Error('segredo interno'))).toEqual({
      status: 500,
      body: { code: 'InternalError', message: 'Erro interno. Veja os logs do servidor.' },
    });
  });
});
