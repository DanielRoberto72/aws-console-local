import { BadRequestError } from '../http/errors.js';

/** Documentos de política vêm URL-encoded da API do IAM. */
export const decodePolicy = (document: string | undefined): string => (document ? decodeURIComponent(document) : '{}');

/** Garante que o documento é um objeto JSON antes de enviá-lo ao IAM. */
export function requirePolicyDocument(document: string, label = 'O documento da política'): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    throw new BadRequestError(`${label} não é um JSON válido.`, 'MalformedPolicyDocument');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestError(`${label} precisa ser um objeto JSON.`, 'MalformedPolicyDocument');
  }
  return document;
}

export const trustPolicyFor = (servicePrincipal: string): string =>
  JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: servicePrincipal }, Action: 'sts:AssumeRole' }],
  });

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)]);

/**
 * Entidades confiáveis de uma política de confiança, no formato da coluna do console
 * ("Serviço da AWS: lambda"). Documentos ilegíveis resultam em lista vazia.
 */
export function trustedEntities(trustPolicy: string): string[] {
  let statements: unknown;
  try {
    statements = (JSON.parse(trustPolicy) as { Statement?: unknown }).Statement;
  } catch {
    return [];
  }
  const entities: string[] = [];
  for (const statement of Array.isArray(statements) ? statements : [statements]) {
    const principal = (statement as { Principal?: unknown } | undefined)?.Principal;
    if (principal === '*') entities.push('Todos (*)');
    if (typeof principal !== 'object' || principal === null) continue;
    const p = principal as Record<string, unknown>;
    for (const service of asList(p.Service)) entities.push(`Serviço da AWS: ${service.replace(/\.amazonaws\.com$/, '')}`);
    for (const aws of asList(p.AWS)) entities.push(`Conta ou entidade: ${aws}`);
    for (const federated of asList(p.Federated)) entities.push(`Identidade federada: ${federated}`);
  }
  return entities;
}
