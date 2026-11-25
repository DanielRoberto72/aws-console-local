import { describe, expect, it } from 'vitest';
import { BUILT_IN_USER, toDefinitions } from '../src/iam/iamService.js';
import { requirePolicyDocument, trustedEntities, trustPolicyFor } from '../src/iam/policyDocuments.js';
import { oldestNonDefaultVersion } from '../src/iam/policyService.js';

const encoded = (value: unknown) => encodeURIComponent(JSON.stringify(value));
const DOC = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 's3:*', Resource: '*' }] };

describe('trustedEntities', () => {
  it('lista serviços, contas e identidades federadas como o console', () => {
    const policy = JSON.stringify({
      Statement: [
        { Principal: { Service: ['lambda.amazonaws.com', 'states.amazonaws.com'] } },
        { Principal: { AWS: 'arn:aws:iam::123456789012:root', Federated: 'cognito-identity.amazonaws.com' } },
      ],
    });
    expect(trustedEntities(policy)).toEqual([
      'Serviço da AWS: lambda',
      'Serviço da AWS: states',
      'Conta ou entidade: arn:aws:iam::123456789012:root',
      'Identidade federada: cognito-identity.amazonaws.com',
    ]);
  });

  it('aceita declaração única e principal curinga', () => {
    expect(trustedEntities(JSON.stringify({ Statement: { Principal: '*' } }))).toEqual(['Todos (*)']);
    expect(trustedEntities(trustPolicyFor('scheduler.amazonaws.com'))).toEqual(['Serviço da AWS: scheduler']);
  });

  it('devolve lista vazia para documento ilegível', () => {
    expect(trustedEntities('não é json')).toEqual([]);
  });
});

describe('requirePolicyDocument', () => {
  it('rejeita JSON inválido e o que não é objeto', () => {
    expect(() => requirePolicyDocument('{')).toThrow(/não é um JSON válido/);
    expect(() => requirePolicyDocument('[]')).toThrow(/objeto JSON/);
    expect(requirePolicyDocument('{"Version":"2012-10-17"}')).toBe('{"Version":"2012-10-17"}');
  });
});

describe('oldestNonDefaultVersion', () => {
  it('escolhe a versão mais antiga que não é a padrão', () => {
    const versions = [
      { VersionId: 'v3', IsDefaultVersion: false, CreateDate: new Date('2026-01-03') },
      { VersionId: 'v1', IsDefaultVersion: true, CreateDate: new Date('2026-01-01') },
      { VersionId: 'v2', IsDefaultVersion: false, CreateDate: new Date('2026-01-02') },
    ];
    expect(oldestNonDefaultVersion(versions)).toBe('v2');
    expect(oldestNonDefaultVersion([versions[1]!])).toBeUndefined();
  });
});

describe('toDefinitions', () => {
  it('ignora o usuário embutido e as funções vinculadas a serviço, e decodifica os documentos', () => {
    const { policies, groups, users, roles } = toDefinitions({
      policies: [
        {
          PolicyName: 'leitura',
          Path: '/',
          Description: 'só leitura',
          PolicyVersionList: [
            { VersionId: 'v1', IsDefaultVersion: false, Document: encoded({ old: true }) },
            { VersionId: 'v2', IsDefaultVersion: true, Document: encoded(DOC) },
          ],
        },
      ],
      groups: [{ GroupName: 'devs', Path: '/', AttachedManagedPolicies: [{ PolicyName: 'leitura', PolicyArn: 'arn:aws:iam::000000000000:policy/leitura' }] }],
      users: [
        { UserName: BUILT_IN_USER, Path: '/' },
        { UserName: 'ana', Path: '/eng/', GroupList: ['devs'], UserPolicyList: [{ PolicyName: 'extra', PolicyDocument: encoded(DOC) }] },
      ],
      roles: [
        { RoleName: 'app', Path: '/', Description: 'função da app', MaxSessionDuration: 7200, AssumeRolePolicyDocument: encoded({ Statement: [] }) },
        { RoleName: 'AWSServiceRoleForX', Path: '/aws-service-role/x/' },
      ],
    });

    expect(policies).toEqual([{ name: 'leitura', path: '/', description: 'só leitura', document: JSON.stringify(DOC) }]);
    expect(groups[0]).toMatchObject({ name: 'devs', managedPolicyArns: ['arn:aws:iam::000000000000:policy/leitura'], inlinePolicies: {} });
    expect(users).toEqual([
      { name: 'ana', path: '/eng/', groups: ['devs'], managedPolicyArns: [], inlinePolicies: { extra: JSON.stringify(DOC) } },
    ]);
    expect(roles.map((r) => r.name)).toEqual(['app']);
    expect(roles[0]).toMatchObject({ description: 'função da app', maxSessionDuration: 7200, trustPolicy: '{"Statement":[]}' });
  });
});
