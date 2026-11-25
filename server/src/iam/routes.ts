import type { FastifyInstance } from 'fastify';
import { BadRequestError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import { BUILT_IN_USER, type IamService, type IdentityKind } from './iamService.js';
import type { PolicyService } from './policyService.js';

// Regras de nome do IAM: letras, números e +=,.@_- (sem "/", que fica no caminho).
const entityName = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[\\w+=,.@-]+$' } as const;
const iamPath = { type: 'string', maxLength: 512, pattern: '^/([\\x21-\\x7E]*/)?$' } as const;
const document = { type: 'string', minLength: 2, maxLength: 131072 } as const;
const arnList = { type: 'array', maxItems: 20, items: { type: 'string', minLength: 20, maxLength: 2048 } } as const;
const nameList = { type: 'array', maxItems: 50, items: entityName } as const;
const nameParams = { type: 'object', required: ['name'], properties: { name: entityName } } as const;
const arnField = { type: 'string', minLength: 20, maxLength: 2048 } as const;

const KINDS: Record<string, IdentityKind> = { users: 'user', groups: 'group', roles: 'role' };

function identityKind(segment: string): IdentityKind {
  const kind = KINDS[segment];
  if (!kind) throw new BadRequestError(`Tipo de identidade desconhecido: ${segment}`);
  return kind;
}

export function iamRoutes(app: FastifyInstance, deps: RouteDeps & { iam: IamService; policies: PolicyService }): void {
  const { iam, policies } = deps;
  const track = createTracker(deps.activity, 'iam', deps.onChange);

  app.get('/api/iam/summary', async () => ({ summary: await iam.summary() }));

  // ---- Usuários ----

  app.get('/api/iam/users', async () => ({ users: await iam.listUsers() }));

  app.post<{ Body: { name: string; path?: string; groups?: string[]; policyArns?: string[] } }>(
    '/api/iam/users',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { ...entityName, maxLength: 64 }, path: iamPath, groups: nameList, policyArns: arnList },
        },
      },
    },
    async (request, reply) => {
      const { name, path = '/', groups = [], policyArns = [] } = request.body;
      await track('CreateUser', name, () => iam.createUser({ name, path, groups, managedPolicyArns: policyArns, inlinePolicies: {} }));
      return reply.status(201).send({ name });
    },
  );

  app.get<{ Params: { name: string } }>('/api/iam/users/:name', { schema: { params: nameParams } }, async (request) =>
    iam.getUser(request.params.name),
  );

  app.post<{ Params: { name: string } }>('/api/iam/users/:name/delete', { schema: { params: nameParams } }, async (request) => {
    const { name } = request.params;
    if (name === BUILT_IN_USER) throw new BadRequestError('O usuário embutido do emulador não pode ser excluído.');
    await track('DeleteUser', name, () => iam.deleteUser(name));
    return { ok: true };
  });

  app.post<{ Params: { name: string }; Body: { groups: string[] } }>(
    '/api/iam/users/:name/groups',
    { schema: { params: nameParams, body: { type: 'object', required: ['groups'], properties: { groups: { ...nameList, minItems: 1 } } } } },
    async (request) => {
      const { name } = request.params;
      await track('AddUserToGroup', name, () => iam.addUserToGroups(name, request.body.groups));
      return { ok: true };
    },
  );

  app.post<{ Params: { name: string }; Body: { group: string } }>(
    '/api/iam/users/:name/groups/remove',
    { schema: { params: nameParams, body: { type: 'object', required: ['group'], properties: { group: entityName } } } },
    async (request) => {
      const { name } = request.params;
      await track('RemoveUserFromGroup', name, () => iam.removeUserFromGroup(name, request.body.group));
      return { ok: true };
    },
  );

  // ---- Chaves de acesso ----

  const accessKeyBody = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 16, maxLength: 128 } } } as const;

  app.post<{ Params: { name: string } }>('/api/iam/users/:name/access-keys', { schema: { params: nameParams } }, async (request, reply) => {
    const { name } = request.params;
    // Só o ID entra no histórico; o segredo aparece uma única vez, nesta resposta.
    const key = await track('CreateAccessKey', name, () => iam.createAccessKey(name));
    return reply.status(201).send(key);
  });

  app.put<{ Params: { name: string }; Body: { id: string; status: 'Active' | 'Inactive' } }>(
    '/api/iam/users/:name/access-keys',
    {
      schema: {
        params: nameParams,
        body: { ...accessKeyBody, required: ['id', 'status'], properties: { ...accessKeyBody.properties, status: { enum: ['Active', 'Inactive'] } } },
      },
    },
    async (request) => {
      const { name } = request.params;
      const { id, status } = request.body;
      await track('UpdateAccessKey', `${name}/${id}`, () => iam.setAccessKeyStatus(name, id, status));
      return { ok: true };
    },
  );

  app.post<{ Params: { name: string }; Body: { id: string } }>(
    '/api/iam/users/:name/access-keys/delete',
    { schema: { params: nameParams, body: accessKeyBody } },
    async (request) => {
      const { name } = request.params;
      await track('DeleteAccessKey', `${name}/${request.body.id}`, () => iam.deleteAccessKey(name, request.body.id));
      return { ok: true };
    },
  );

  // ---- Grupos ----

  app.get('/api/iam/groups', async () => ({ groups: await iam.listGroups() }));

  app.post<{ Body: { name: string; path?: string; users?: string[]; policyArns?: string[] } }>(
    '/api/iam/groups',
    {
      schema: {
        body: { type: 'object', required: ['name'], properties: { name: entityName, path: iamPath, users: nameList, policyArns: arnList } },
      },
    },
    async (request, reply) => {
      const { name, path = '/', users = [], policyArns = [] } = request.body;
      await track('CreateGroup', name, () => iam.createGroup({ name, path, managedPolicyArns: policyArns, inlinePolicies: {} }, users));
      return reply.status(201).send({ name });
    },
  );

  app.get<{ Params: { name: string } }>('/api/iam/groups/:name', { schema: { params: nameParams } }, async (request) =>
    iam.getGroup(request.params.name),
  );

  app.post<{ Params: { name: string } }>('/api/iam/groups/:name/delete', { schema: { params: nameParams } }, async (request) => {
    const { name } = request.params;
    await track('DeleteGroup', name, () => iam.deleteGroup(name));
    return { ok: true };
  });

  app.post<{ Params: { name: string }; Body: { users: string[] } }>(
    '/api/iam/groups/:name/users',
    { schema: { params: nameParams, body: { type: 'object', required: ['users'], properties: { users: { ...nameList, minItems: 1 } } } } },
    async (request) => {
      const { name } = request.params;
      await track('AddUserToGroup', name, async () => {
        for (const user of request.body.users) await iam.addUserToGroups(user, [name]);
      });
      return { ok: true };
    },
  );

  app.post<{ Params: { name: string }; Body: { user: string } }>(
    '/api/iam/groups/:name/users/remove',
    { schema: { params: nameParams, body: { type: 'object', required: ['user'], properties: { user: entityName } } } },
    async (request) => {
      const { name } = request.params;
      await track('RemoveUserFromGroup', name, () => iam.removeUserFromGroup(request.body.user, name));
      return { ok: true };
    },
  );

  // ---- Funções ----

  app.get('/api/iam/roles', async () => ({ roles: await iam.listRoles() }));

  app.post<{ Body: { name: string; path?: string; description?: string; trustPolicy: string; maxSessionDuration?: number; policyArns?: string[] } }>(
    '/api/iam/roles',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'trustPolicy'],
          properties: {
            name: { ...entityName, maxLength: 64 },
            path: iamPath,
            description: { type: 'string', maxLength: 1000 },
            trustPolicy: document,
            maxSessionDuration: { type: 'integer', minimum: 3600, maximum: 43200 },
            policyArns: arnList,
          },
        },
      },
    },
    async (request, reply) => {
      const { name, path = '/', description = '', trustPolicy, maxSessionDuration, policyArns = [] } = request.body;
      const arn = await track('CreateRole', name, () =>
        iam.createRole({ name, path, description, trustPolicy, maxSessionDuration, managedPolicyArns: policyArns, inlinePolicies: {} }),
      );
      return reply.status(201).send({ name, arn });
    },
  );

  app.get<{ Params: { name: string } }>('/api/iam/roles/:name', { schema: { params: nameParams } }, async (request) =>
    iam.getRole(request.params.name),
  );

  app.put<{ Params: { name: string }; Body: { description: string; maxSessionDuration: number } }>(
    '/api/iam/roles/:name',
    {
      schema: {
        params: nameParams,
        body: {
          type: 'object',
          required: ['description', 'maxSessionDuration'],
          properties: { description: { type: 'string', maxLength: 1000 }, maxSessionDuration: { type: 'integer', minimum: 3600, maximum: 43200 } },
        },
      },
    },
    async (request) => {
      const { name } = request.params;
      await track('UpdateRole', name, () => iam.updateRole(name, request.body.description, request.body.maxSessionDuration));
      return { ok: true };
    },
  );

  app.put<{ Params: { name: string }; Body: { document: string } }>(
    '/api/iam/roles/:name/trust',
    { schema: { params: nameParams, body: { type: 'object', required: ['document'], properties: { document } } } },
    async (request) => {
      const { name } = request.params;
      await track('UpdateAssumeRolePolicy', name, () => iam.updateTrustPolicy(name, request.body.document));
      return { ok: true };
    },
  );

  app.post<{ Params: { name: string } }>('/api/iam/roles/:name/delete', { schema: { params: nameParams } }, async (request) => {
    const { name } = request.params;
    await track('DeleteRole', name, () => iam.deleteRole(name));
    return { ok: true };
  });

  // ---- Permissões de usuários, grupos e funções ----

  const identityParams = {
    type: 'object',
    required: ['kind', 'name'],
    properties: { kind: { enum: Object.keys(KINDS) }, name: entityName },
  } as const;
  type IdentityParams = { kind: string; name: string };

  app.post<{ Params: IdentityParams; Body: { arns: string[] } }>(
    '/api/iam/:kind/:name/policies/attach',
    { schema: { params: identityParams, body: { type: 'object', required: ['arns'], properties: { arns: { ...arnList, minItems: 1 } } } } },
    async (request) => {
      const { kind, name } = request.params;
      await track('AttachPolicy', name, () => iam.attachPolicies(identityKind(kind), name, request.body.arns));
      return { ok: true };
    },
  );

  app.post<{ Params: IdentityParams; Body: { arn: string } }>(
    '/api/iam/:kind/:name/policies/detach',
    { schema: { params: identityParams, body: { type: 'object', required: ['arn'], properties: { arn: arnField } } } },
    async (request) => {
      const { kind, name } = request.params;
      await track('DetachPolicy', name, () => iam.detachPolicy(identityKind(kind), name, request.body.arn));
      return { ok: true };
    },
  );

  app.put<{ Params: IdentityParams; Body: { policyName: string; document: string } }>(
    '/api/iam/:kind/:name/inline',
    {
      schema: {
        params: identityParams,
        body: { type: 'object', required: ['policyName', 'document'], properties: { policyName: entityName, document } },
      },
    },
    async (request) => {
      const { kind, name } = request.params;
      const { policyName, document: doc } = request.body;
      await track('PutInlinePolicy', `${name}/${policyName}`, () => iam.putInlinePolicy(identityKind(kind), name, policyName, doc));
      return { ok: true };
    },
  );

  app.post<{ Params: IdentityParams; Body: { policyName: string } }>(
    '/api/iam/:kind/:name/inline/delete',
    { schema: { params: identityParams, body: { type: 'object', required: ['policyName'], properties: { policyName: entityName } } } },
    async (request) => {
      const { kind, name } = request.params;
      const { policyName } = request.body;
      await track('DeleteInlinePolicy', `${name}/${policyName}`, () => iam.deleteInlinePolicy(identityKind(kind), name, policyName));
      return { ok: true };
    },
  );

  // ---- Políticas gerenciadas (o ARN tem "/", por isso vai na query ou no corpo) ----

  const arnQuery = { type: 'object', required: ['arn'], properties: { arn: arnField } } as const;
  const versionBody = {
    type: 'object',
    required: ['arn', 'versionId'],
    properties: { arn: arnField, versionId: { type: 'string', pattern: '^v[0-9]+$' } },
  } as const;

  app.get('/api/iam/policies', async () => ({ policies: await policies.list() }));

  app.post<{ Body: { name: string; path?: string; description?: string; document: string } }>(
    '/api/iam/policies',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'document'],
          properties: { name: entityName, path: iamPath, description: { type: 'string', maxLength: 1000 }, document },
        },
      },
    },
    async (request, reply) => {
      const { name, path = '/', description = '', document: doc } = request.body;
      const arn = await track('CreatePolicy', name, () => policies.create({ name, path, description, document: doc }));
      return reply.status(201).send({ arn });
    },
  );

  app.get<{ Querystring: { arn: string } }>('/api/iam/policies/detail', { schema: { querystring: arnQuery } }, async (request) =>
    policies.get(request.query.arn),
  );

  app.put<{ Body: { arn: string; document: string } }>(
    '/api/iam/policies',
    { schema: { body: { type: 'object', required: ['arn', 'document'], properties: { arn: arnField, document } } } },
    async (request) => {
      const { arn, document: doc } = request.body;
      await track('CreatePolicyVersion', arn, () => policies.update(arn, doc));
      return { ok: true };
    },
  );

  app.post<{ Body: { arn: string; versionId: string } }>('/api/iam/policies/default-version', { schema: { body: versionBody } }, async (request) => {
    const { arn, versionId } = request.body;
    await track('SetDefaultPolicyVersion', `${arn} ${versionId}`, () => policies.setDefaultVersion(arn, versionId));
    return { ok: true };
  });

  app.post<{ Body: { arn: string; versionId: string } }>('/api/iam/policies/delete-version', { schema: { body: versionBody } }, async (request) => {
    const { arn, versionId } = request.body;
    await track('DeletePolicyVersion', `${arn} ${versionId}`, () => policies.deleteVersion(arn, versionId));
    return { ok: true };
  });

  app.post<{ Body: { arn: string } }>('/api/iam/policies/delete', { schema: { body: arnQuery } }, async (request) => {
    const { arn } = request.body;
    await track('DeletePolicy', arn, () => policies.delete(arn));
    return { ok: true };
  });
}
