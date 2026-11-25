import { createHmac } from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
  ListUsersCommand,
  type ExplicitAuthFlowsType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  CancelKeyDeletionCommand,
  CreateAliasCommand,
  CreateKeyCommand,
  DecryptCommand,
  DeleteAliasCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
  EnableKeyCommand,
  EncryptCommand,
  KMSClient,
  ListAliasesCommand,
  ListKeysCommand,
  ScheduleKeyDeletionCommand,
} from '@aws-sdk/client-kms';
import {
  CreateIPSetCommand,
  CreateWebACLCommand,
  DeleteIPSetCommand,
  DeleteWebACLCommand,
  GetIPSetCommand,
  GetWebACLCommand,
  ListIPSetsCommand,
  ListWebACLsCommand,
  WAFV2Client,
} from '@aws-sdk/client-wafv2';
import { BadRequestError, NotFoundError } from '../../http/errors.js';
import type { CatalogContext } from '../context.js';
import { bool, compact, iso, list, message, optStr, paginate, status, str } from '../helpers.js';
import type { CatalogService, Input } from '../types.js';

const AUTH_FLOWS = [
  { value: 'ALLOW_USER_PASSWORD_AUTH', label: 'Usuário e senha (USER_PASSWORD_AUTH)' },
  { value: 'ALLOW_ADMIN_USER_PASSWORD_AUTH', label: 'Administrador (ADMIN_USER_PASSWORD_AUTH)' },
  { value: 'ALLOW_USER_SRP_AUTH', label: 'SRP (USER_SRP_AUTH)' },
  { value: 'ALLOW_REFRESH_TOKEN_AUTH', label: 'Token de atualização' },
];

/** SECRET_HASH exigido quando o cliente do app tem segredo. */
export const secretHash = (clientSecret: string, username: string, clientId: string) =>
  createHmac('sha256', clientSecret).update(username + clientId).digest('base64');

export function cognitoService(ctx: CatalogContext): CatalogService {
  const cognito = () => ctx.client(CognitoIdentityProviderClient);
  const describeClient = async (pool: string, clientId: string) =>
    (await cognito().send(new DescribeUserPoolClientCommand({ UserPoolId: pool, ClientId: clientId }))).UserPoolClient;

  return {
    id: 'cognito',
    name: 'Cognito',
    description: 'Cadastro e login de usuários',
    category: 'Segurança, identidade e conformidade',
    notes:
      'O emulador emite tokens JWT de verdade. Na restauração, os IDs de grupos de usuários e de clientes de app mudam: atualize a configuração das suas apps depois de um reinício.',
    types: [
      {
        key: 'user-pool',
        label: 'Grupos de usuários',
        singular: 'grupo de usuários',
        columns: [
          { key: 'users', label: 'Usuários (estimativa)' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list() {
          const pools = await paginate(async (NextToken) => {
            const page = await cognito().send(new ListUserPoolsCommand({ MaxResults: 60, NextToken }));
            return { items: page.UserPools, next: page.NextToken };
          });
          const rows = [];
          for (const p of pools) {
            const { UserPool } = await cognito().send(new DescribeUserPoolCommand({ UserPoolId: p.Id }));
            rows.push({
              id: p.Id!,
              name: p.Name ?? p.Id!,
              status: status(p.Status ?? 'Enabled'),
              attrs: { users: UserPool?.EstimatedNumberOfUsers ?? 0, createdAt: iso(p.CreationDate), arn: UserPool?.Arn ?? null },
            });
          }
          return rows;
        },
        async describe(id) {
          return (await cognito().send(new DescribeUserPoolCommand({ UserPoolId: id }))).UserPool ?? null;
        },
        create: {
          label: 'Criar grupo de usuários',
          fields: [{ name: 'name', label: 'Nome do grupo de usuários', type: 'text', required: true, pattern: '^[\\w\\s+=,.@-]{1,128}$' }],
          async run(input) {
            const { UserPool } = await cognito().send(
              new CreateUserPoolCommand({ PoolName: str(input, 'name'), UsernameAttributes: undefined, AutoVerifiedAttributes: ['email'] }),
            );
            return { id: UserPool?.Id ?? '' };
          },
        },
        remove: {
          async run(id) {
            await cognito().send(new DeleteUserPoolCommand({ UserPoolId: id }));
          },
        },
        async persist(row) {
          return { name: row.name };
        },
      },
      {
        key: 'client',
        label: 'Clientes de aplicativo',
        singular: 'cliente de aplicativo',
        parent: 'user-pool',
        columns: [
          { key: 'flows', label: 'Fluxos de autenticação' },
          { key: 'secret', label: 'Segredo' },
        ],
        async list(pool) {
          const clients = await paginate(async (NextToken) => {
            const page = await cognito().send(new ListUserPoolClientsCommand({ UserPoolId: pool, MaxResults: 60, NextToken }));
            return { items: page.UserPoolClients, next: page.NextToken };
          });
          const rows = [];
          for (const c of clients) {
            const detail = await describeClient(pool!, c.ClientId!);
            rows.push({
              id: c.ClientId!,
              name: c.ClientName ?? c.ClientId!,
              attrs: { flows: (detail?.ExplicitAuthFlows ?? []).join(', ') || null, secret: detail?.ClientSecret ? 'Sim' : 'Não' },
            });
          }
          return rows;
        },
        async describe(id, pool) {
          return describeClient(pool!, id);
        },
        create: {
          label: 'Criar cliente de aplicativo',
          fields: [
            { name: 'name', label: 'Nome do cliente', type: 'text', required: true },
            { name: 'flows', label: 'Fluxos de autenticação', type: 'multiselect', options: AUTH_FLOWS, default: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'] },
            { name: 'generateSecret', label: 'Gerar segredo do cliente', type: 'boolean' },
          ],
          async run(input, pool) {
            const flows = list(input, 'flows');
            const { UserPoolClient } = await cognito().send(
              new CreateUserPoolClientCommand({
                UserPoolId: pool,
                ClientName: str(input, 'name'),
                ExplicitAuthFlows: (flows.length ? flows : ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']) as ExplicitAuthFlowsType[],
                GenerateSecret: bool(input, 'generateSecret'),
              }),
            );
            return { id: UserPoolClient?.ClientId ?? '' };
          },
        },
        remove: {
          async run(id, pool) {
            await cognito().send(new DeleteUserPoolClientCommand({ UserPoolId: pool, ClientId: id }));
          },
        },
        actions: [
          {
            key: 'InitiateAuth',
            label: 'Testar login',
            submitLabel: 'Entrar',
            description: 'Faz login com usuário e senha (USER_PASSWORD_AUTH) e mostra os tokens emitidos.',
            fields: [
              { name: 'username', label: 'Nome de usuário', type: 'text', required: true },
              { name: 'password', label: 'Senha', type: 'password', required: true },
            ],
            async run(id, input, pool) {
              const client = await describeClient(pool!, id);
              const username = str(input, 'username');
              const params: Record<string, string> = { USERNAME: username, PASSWORD: str(input, 'password') };
              if (client?.ClientSecret) params.SECRET_HASH = secretHash(client.ClientSecret, username, id);
              const result = await cognito().send(new InitiateAuthCommand({ ClientId: id, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: params }));
              return { kind: 'json', value: { ChallengeName: result.ChallengeName, AuthenticationResult: result.AuthenticationResult } };
            },
          },
        ],
        async persist(row, pool) {
          const detail = await describeClient(pool!, row.id);
          return compact({ name: row.name, flows: detail?.ExplicitAuthFlows ?? [], generateSecret: Boolean(detail?.ClientSecret) });
        },
      },
      {
        key: 'user',
        label: 'Usuários',
        singular: 'usuário',
        parent: 'user-pool',
        columns: [
          { key: 'email', label: 'E-mail' },
          { key: 'enabled', label: 'Habilitado' },
          { key: 'createdAt', label: 'Criação' },
        ],
        async list(pool) {
          const users = await paginate(async (PaginationToken) => {
            const page = await cognito().send(new ListUsersCommand({ UserPoolId: pool, PaginationToken }));
            return { items: page.Users, next: page.PaginationToken };
          });
          return users.map((u) => ({
            id: u.Username!,
            name: u.Username!,
            status: status(u.UserStatus),
            attrs: { email: u.Attributes?.find((a) => a.Name === 'email')?.Value ?? null, enabled: u.Enabled ? 'Sim' : 'Não', createdAt: iso(u.UserCreateDate) },
          }));
        },
        create: {
          label: 'Criar usuário',
          fields: [
            { name: 'username', label: 'Nome de usuário', type: 'text', required: true },
            { name: 'email', label: 'E-mail', type: 'text', pattern: '^([^@\\s]+@[^@\\s]+)?$' },
            { name: 'password', label: 'Senha permanente - opcional', type: 'password', description: 'Em branco: o usuário fica com senha temporária e status FORCE_CHANGE_PASSWORD.' },
          ],
          async run(input, pool) {
            const username = str(input, 'username');
            const email = optStr(input, 'email');
            await cognito().send(
              new AdminCreateUserCommand({
                UserPoolId: pool,
                Username: username,
                MessageAction: 'SUPPRESS',
                UserAttributes: email ? [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }] : undefined,
              }),
            );
            const password = optStr(input, 'password');
            if (password) await cognito().send(new AdminSetUserPasswordCommand({ UserPoolId: pool, Username: username, Password: password, Permanent: true }));
            return { id: username };
          },
        },
        remove: {
          async run(id, pool) {
            await cognito().send(new AdminDeleteUserCommand({ UserPoolId: pool, Username: id }));
          },
        },
        actions: [
          {
            key: 'AdminSetUserPassword',
            label: 'Definir senha',
            fields: [{ name: 'password', label: 'Nova senha (permanente)', type: 'password', required: true }],
            mutates: true,
            remembers: true,
            async run(id, input, pool) {
              await cognito().send(new AdminSetUserPasswordCommand({ UserPoolId: pool, Username: id, Password: str(input, 'password'), Permanent: true }));
              return message('Senha definida.');
            },
          },
        ],
        preserve: ['password'],
        async persist(row) {
          return compact({ username: row.id, email: row.attrs.email ? String(row.attrs.email) : undefined });
        },
      },
    ],
  };
}

export function kmsService(ctx: CatalogContext): CatalogService {
  const kms = () => ctx.client(KMSClient);
  const aliases = async () =>
    paginate(async (Marker) => {
      const page = await kms().send(new ListAliasesCommand({ Marker }));
      return { items: page.Aliases, next: page.Truncated ? page.NextMarker : undefined };
    });

  return {
    id: 'kms',
    name: 'Key Management Service',
    description: 'Chaves de criptografia gerenciadas',
    category: 'Segurança, identidade e conformidade',
    notes:
      'Criptografia e descriptografia funcionam de verdade. Na restauração, as chaves são recriadas com material novo: dados criptografados antes do reinício não podem mais ser descriptografados. Use aliases nas suas apps, porque o ID da chave muda.',
    types: [
      {
        key: 'key',
        label: 'Chaves gerenciadas pelo cliente',
        singular: 'chave',
        columns: [
          { key: 'aliases', label: 'Aliases' },
          { key: 'description', label: 'Descrição' },
          { key: 'spec', label: 'Especificação' },
          { key: 'usage', label: 'Uso' },
        ],
        async list() {
          const keys = await paginate(async (Marker) => {
            const page = await kms().send(new ListKeysCommand({ Marker }));
            return { items: page.Keys, next: page.Truncated ? page.NextMarker : undefined };
          });
          const allAliases = await aliases();
          const rows = [];
          for (const key of keys) {
            const { KeyMetadata: m } = await kms().send(new DescribeKeyCommand({ KeyId: key.KeyId }));
            if (m?.KeyManager === 'AWS') continue;
            rows.push({
              id: key.KeyId!,
              name: allAliases.find((a) => a.TargetKeyId === key.KeyId)?.AliasName ?? key.KeyId!,
              status: status(m?.KeyState),
              attrs: {
                aliases: allAliases.filter((a) => a.TargetKeyId === key.KeyId).map((a) => a.AliasName).join(', ') || null,
                description: m?.Description || null,
                spec: m?.KeySpec ?? null,
                usage: m?.KeyUsage ?? null,
                createdAt: iso(m?.CreationDate),
                deletionDate: iso(m?.DeletionDate),
              },
            });
          }
          return rows;
        },
        async describe(id) {
          return (await kms().send(new DescribeKeyCommand({ KeyId: id }))).KeyMetadata ?? null;
        },
        create: {
          label: 'Criar chave',
          fields: [
            { name: 'description', label: 'Descrição', type: 'text' },
            {
              name: 'spec',
              label: 'Tipo de chave',
              type: 'select',
              default: 'SYMMETRIC_DEFAULT',
              options: [
                { value: 'SYMMETRIC_DEFAULT', label: 'Simétrica (AES-256)' },
                { value: 'RSA_2048', label: 'Assimétrica RSA 2048' },
                { value: 'ECC_NIST_P256', label: 'Assimétrica ECC P-256' },
              ],
            },
            {
              name: 'usage',
              label: 'Uso da chave',
              type: 'select',
              default: 'ENCRYPT_DECRYPT',
              options: [
                { value: 'ENCRYPT_DECRYPT', label: 'Criptografar e descriptografar' },
                { value: 'SIGN_VERIFY', label: 'Assinar e verificar' },
              ],
            },
          ],
          async run(input) {
            const { KeyMetadata } = await kms().send(
              new CreateKeyCommand({ Description: optStr(input, 'description'), KeySpec: (str(input, 'spec') || 'SYMMETRIC_DEFAULT') as never, KeyUsage: (str(input, 'usage') || 'ENCRYPT_DECRYPT') as never }),
            );
            return { id: KeyMetadata?.KeyId ?? '' };
          },
        },
        remove: {
          label: 'Programar exclusão',
          warning: 'A KMS não exclui chaves na hora: a chave fica pendente de exclusão por 7 dias, e pode ser recuperada nesse período.',
          async run(id) {
            await kms().send(new ScheduleKeyDeletionCommand({ KeyId: id, PendingWindowInDays: 7 }));
          },
        },
        actions: [
          {
            key: 'Encrypt',
            label: 'Criptografar',
            submitLabel: 'Criptografar',
            fields: [{ name: 'plaintext', label: 'Texto', type: 'textarea', required: true }],
            async run(id, input) {
              const { CiphertextBlob } = await kms().send(new EncryptCommand({ KeyId: id, Plaintext: Buffer.from(str(input, 'plaintext')) }));
              return { kind: 'text', text: Buffer.from(CiphertextBlob ?? new Uint8Array()).toString('base64') };
            },
          },
          {
            key: 'Decrypt',
            label: 'Descriptografar',
            submitLabel: 'Descriptografar',
            fields: [{ name: 'ciphertext', label: 'Texto criptografado (base64)', type: 'textarea', required: true }],
            async run(_id, input) {
              const { Plaintext } = await kms().send(new DecryptCommand({ CiphertextBlob: Buffer.from(str(input, 'ciphertext'), 'base64') }));
              return { kind: 'text', text: Buffer.from(Plaintext ?? new Uint8Array()).toString('utf8') };
            },
          },
          {
            key: 'DisableKey',
            label: 'Desabilitar',
            fields: [],
            mutates: true,
            async run(id) {
              await kms().send(new DisableKeyCommand({ KeyId: id }));
              return message('Chave desabilitada.');
            },
          },
          {
            key: 'EnableKey',
            label: 'Habilitar',
            fields: [],
            mutates: true,
            async run(id) {
              await kms().send(new EnableKeyCommand({ KeyId: id }));
              return message('Chave habilitada.');
            },
          },
          {
            key: 'CancelKeyDeletion',
            label: 'Cancelar exclusão',
            fields: [],
            mutates: true,
            async run(id) {
              await kms().send(new CancelKeyDeletionCommand({ KeyId: id }));
              await kms().send(new EnableKeyCommand({ KeyId: id }));
              return message('Exclusão cancelada e chave habilitada.');
            },
          },
        ],
        async persist(row) {
          if (row.status?.label === 'PendingDeletion') return null;
          return compact({
            description: row.attrs.description ? String(row.attrs.description) : undefined,
            spec: String(row.attrs.spec ?? 'SYMMETRIC_DEFAULT'),
            usage: String(row.attrs.usage ?? 'ENCRYPT_DECRYPT'),
          });
        },
      },
      {
        key: 'alias',
        label: 'Aliases',
        singular: 'alias',
        columns: [{ key: 'key', label: 'Chave' }],
        async list() {
          return (await aliases())
            .filter((a) => a.AliasName && !a.AliasName.startsWith('alias/aws/'))
            .map((a) => ({ id: a.AliasName!, name: a.AliasName!, attrs: { key: a.TargetKeyId ?? null } }));
        },
        create: {
          label: 'Criar alias',
          fields: [
            { name: 'name', label: 'Nome do alias', type: 'text', required: true, pattern: '^alias/[a-zA-Z0-9/_-]+$', default: 'alias/', patternHint: 'Começa com alias/.' },
            { name: 'keyId', label: 'Chave', type: 'select', source: 'kms/key', required: true },
          ],
          async run(input) {
            await kms().send(new CreateAliasCommand({ AliasName: str(input, 'name'), TargetKeyId: str(input, 'keyId') }));
            return { id: str(input, 'name') };
          },
        },
        remove: {
          async run(id) {
            await kms().send(new DeleteAliasCommand({ AliasName: id }));
          },
        },
        async persist(row) {
          return row.attrs.key ? { name: row.id, keyId: String(row.attrs.key) } : null;
        },
      },
    ],
  };
}

const SCOPE = 'REGIONAL' as const;

export function wafService(ctx: CatalogContext): CatalogService {
  const waf = () => ctx.client(WAFV2Client);
  const webAcls = async () => (await waf().send(new ListWebACLsCommand({ Scope: SCOPE }))).WebACLs ?? [];
  const ipSets = async () => (await waf().send(new ListIPSetsCommand({ Scope: SCOPE }))).IPSets ?? [];

  const findById = <T extends { Id?: string }>(items: T[], id: string): T => {
    const item = items.find((i) => i.Id === id);
    if (!item) throw new NotFoundError(`Recurso ${id} não encontrado.`);
    return item;
  };

  return {
    id: 'wafv2',
    name: 'WAF',
    description: 'Firewall de aplicações web',
    category: 'Segurança, identidade e conformidade',
    notes: 'Listas de controle e conjuntos de IPs são registrados (escopo regional), mas o emulador não filtra tráfego.',
    types: [
      {
        key: 'web-acl',
        label: 'ACLs da web',
        singular: 'ACL da web',
        columns: [
          { key: 'description', label: 'Descrição' },
          { key: 'defaultAction', label: 'Ação padrão' },
          { key: 'rules', label: 'Regras' },
        ],
        async list() {
          const rows = [];
          for (const acl of await webAcls()) {
            const { WebACL } = await waf().send(new GetWebACLCommand({ Scope: SCOPE, Id: acl.Id, Name: acl.Name }));
            rows.push({
              id: acl.Id!,
              name: acl.Name ?? acl.Id!,
              attrs: { description: acl.Description || null, defaultAction: WebACL?.DefaultAction?.Block ? 'Bloquear' : 'Permitir', rules: WebACL?.Rules?.length ?? 0 },
            });
          }
          return rows;
        },
        async describe(id) {
          const acl = findById(await webAcls(), id);
          return (await waf().send(new GetWebACLCommand({ Scope: SCOPE, Id: acl.Id, Name: acl.Name }))).WebACL ?? null;
        },
        create: {
          label: 'Criar ACL da web',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[\\w-]{1,128}$' },
            { name: 'description', label: 'Descrição', type: 'text' },
            {
              name: 'defaultAction',
              label: 'Ação padrão',
              type: 'select',
              default: 'allow',
              options: [
                { value: 'allow', label: 'Permitir' },
                { value: 'block', label: 'Bloquear' },
              ],
            },
          ],
          async run(input) {
            const name = str(input, 'name');
            const { Summary } = await waf().send(
              new CreateWebACLCommand({
                Scope: SCOPE,
                Name: name,
                Description: optStr(input, 'description'),
                DefaultAction: str(input, 'defaultAction') === 'block' ? { Block: {} } : { Allow: {} },
                VisibilityConfig: { SampledRequestsEnabled: false, CloudWatchMetricsEnabled: false, MetricName: name.replace(/-/g, '') },
              }),
            );
            return { id: Summary?.Id ?? '' };
          },
        },
        remove: {
          async run(id) {
            const acl = findById(await webAcls(), id);
            await waf().send(new DeleteWebACLCommand({ Scope: SCOPE, Id: acl.Id, Name: acl.Name, LockToken: acl.LockToken }));
          },
        },
        async persist(row): Promise<Input> {
          return compact({
            name: row.name,
            description: row.attrs.description ? String(row.attrs.description) : undefined,
            defaultAction: row.attrs.defaultAction === 'Bloquear' ? 'block' : 'allow',
          });
        },
      },
      {
        key: 'ip-set',
        label: 'Conjuntos de IPs',
        singular: 'conjunto de IPs',
        columns: [
          { key: 'version', label: 'Versão de IP' },
          { key: 'addresses', label: 'Endereços' },
        ],
        async list() {
          const rows = [];
          for (const set of await ipSets()) {
            const { IPSet } = await waf().send(new GetIPSetCommand({ Scope: SCOPE, Id: set.Id, Name: set.Name }));
            rows.push({
              id: set.Id!,
              name: set.Name ?? set.Id!,
              attrs: { version: IPSet?.IPAddressVersion ?? null, addresses: (IPSet?.Addresses ?? []).join(', ') || null, description: set.Description || null },
            });
          }
          return rows;
        },
        create: {
          label: 'Criar conjunto de IPs',
          fields: [
            { name: 'name', label: 'Nome', type: 'text', required: true, pattern: '^[\\w-]{1,128}$' },
            {
              name: 'version',
              label: 'Versão de IP',
              type: 'select',
              default: 'IPV4',
              options: [
                { value: 'IPV4', label: 'IPv4' },
                { value: 'IPV6', label: 'IPv6' },
              ],
            },
            { name: 'addresses', label: 'Endereços IP (CIDR)', type: 'list', required: true, description: 'Um por linha, ex.: 10.0.0.0/24.' },
          ],
          async run(input) {
            const addresses = list(input, 'addresses');
            if (!addresses.length) throw new BadRequestError('Informe ao menos um endereço.');
            const { Summary } = await waf().send(
              new CreateIPSetCommand({ Scope: SCOPE, Name: str(input, 'name'), IPAddressVersion: (str(input, 'version') || 'IPV4') as never, Addresses: addresses }),
            );
            return { id: Summary?.Id ?? '' };
          },
        },
        remove: {
          async run(id) {
            const set = findById(await ipSets(), id);
            await waf().send(new DeleteIPSetCommand({ Scope: SCOPE, Id: set.Id, Name: set.Name, LockToken: set.LockToken }));
          },
        },
        async persist(row) {
          return compact({ name: row.name, version: String(row.attrs.version ?? 'IPV4'), addresses: String(row.attrs.addresses ?? '').split(', ').filter(Boolean) });
        },
      },
    ],
  };
}
