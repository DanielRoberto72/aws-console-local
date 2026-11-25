import { describe, expect, it } from 'vitest';
import { nameError, policyHref, trustPolicyForAccount, trustPolicyForService } from '../src/pages/iam/iamLinks';

describe('nomes do IAM', () => {
  it('aceita os caracteres permitidos e respeita o limite', () => {
    expect(nameError('app-leitura+teste@x.y_z=1,2', 64)).toBeNull();
    expect(nameError('', 64)).toBe('Informe um nome.');
    expect(nameError('com espaço', 64)).toMatch(/apenas letras/);
    expect(nameError('a/b', 64)).toMatch(/apenas letras/);
    expect(nameError('x'.repeat(65), 64)).toBe('Até 64 caracteres.');
  });
});

describe('políticas de confiança', () => {
  it('monta a confiança para um serviço e para uma conta', () => {
    expect(JSON.parse(trustPolicyForService('lambda.amazonaws.com')).Statement[0]).toEqual({
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: 'sts:AssumeRole',
    });
    expect(JSON.parse(trustPolicyForAccount('arn:aws:iam::000000000000:root')).Statement[0].Principal).toEqual({
      AWS: 'arn:aws:iam::000000000000:root',
    });
  });
});

describe('links', () => {
  it('codifica o ARN da política na query string', () => {
    expect(policyHref('arn:aws:iam::aws:policy/ReadOnlyAccess')).toBe('/iam/policy?arn=arn%3Aaws%3Aiam%3A%3Aaws%3Apolicy%2FReadOnlyAccess');
  });
});
