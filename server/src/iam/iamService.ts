import {
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  AttachRolePolicyCommand,
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  CreateGroupCommand,
  CreateRoleCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  DeleteGroupCommand,
  DeleteGroupPolicyCommand,
  DeleteLoginProfileCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DeleteUserCommand,
  DeleteUserPolicyCommand,
  DetachGroupPolicyCommand,
  DetachRolePolicyCommand,
  DetachUserPolicyCommand,
  GetAccessKeyLastUsedCommand,
  GetAccountAuthorizationDetailsCommand,
  GetAccountSummaryCommand,
  GetGroupCommand,
  GetGroupPolicyCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  GetUserCommand,
  GetUserPolicyCommand,
  ListAccessKeysCommand,
  ListAttachedGroupPoliciesCommand,
  ListAttachedRolePoliciesCommand,
  ListAttachedUserPoliciesCommand,
  ListRolesCommand,
  ListGroupPoliciesCommand,
  ListGroupsForUserCommand,
  ListRolePoliciesCommand,
  ListUserPoliciesCommand,
  PutGroupPolicyCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
  RemoveUserFromGroupCommand,
  UpdateAccessKeyCommand,
  UpdateAssumeRolePolicyCommand,
  UpdateRoleCommand,
  type AttachedPolicy as SdkAttachedPolicy,
  type EntityType,
  type GroupDetail,
  type IAMClient,
  type ManagedPolicyDetail,
  type RoleDetail,
  type UserDetail,
} from '@aws-sdk/client-iam';
import { decodePolicy, requirePolicyDocument, trustedEntities, trustPolicyFor } from './policyDocuments.js';

/** Identidades do IAM que recebem políticas: usuários, grupos e funções. */
export type IdentityKind = 'user' | 'group' | 'role';

/**
 * Usuário embutido no emulador: é a identidade de todas as chamadas (a autenticação
 * está desligada). Aparece no painel, mas não é salvo nem pode ser excluído.
 */
export const BUILT_IN_USER = 'emulator';

export interface AttachedPolicy {
  name: string;
  arn: string;
  type: 'aws' | 'customer';
}

export interface InlinePolicy {
  name: string;
  document: string;
}

export interface AccessKey {
  id: string;
  status: 'Active' | 'Inactive';
  createdAt: string | null;
  lastUsedAt: string | null;
  lastUsedService: string | null;
}

export interface UserSummary {
  name: string;
  arn: string;
  path: string;
  groups: string[];
  policies: number;
  accessKeys: AccessKey[];
  createdAt: string | null;
  builtIn: boolean;
}

export interface GroupSummary {
  name: string;
  arn: string;
  path: string;
  users: number;
  policies: number;
  createdAt: string | null;
}

export interface RoleSummary {
  name: string;
  arn: string;
  path: string;
  description: string;
  trustedEntities: string[];
  createdAt: string | null;
  lastUsedAt: string | null;
}

interface IdentityPolicies {
  attached: AttachedPolicy[];
  inline: InlinePolicy[];
}

export interface UserDetailView extends IdentityPolicies {
  name: string;
  arn: string;
  id: string;
  path: string;
  createdAt: string | null;
  builtIn: boolean;
  groups: string[];
  accessKeys: AccessKey[];
}

export interface GroupDetailView extends IdentityPolicies {
  name: string;
  arn: string;
  id: string;
  path: string;
  createdAt: string | null;
  users: { name: string; arn: string; createdAt: string | null }[];
}

export interface RoleDetailView extends IdentityPolicies {
  name: string;
  arn: string;
  id: string;
  path: string;
  description: string;
  createdAt: string | null;
  maxSessionDuration: number;
  trustPolicy: string;
  trustedEntities: string[];
  lastUsedAt: string | null;
  lastUsedRegion: string | null;
}

/** Definições salvas no banco e usadas para recriar as identidades. */
export interface UserDefinition {
  name: string;
  path: string;
  groups: string[];
  managedPolicyArns: string[];
  inlinePolicies: Record<string, string>;
}

export interface GroupDefinition {
  name: string;
  path: string;
  managedPolicyArns: string[];
  inlinePolicies: Record<string, string>;
}

export interface RoleDefinition {
  name: string;
  path: string;
  description: string;
  trustPolicy: string;
  inlinePolicies: Record<string, string>;
  managedPolicyArns: string[];
  maxSessionDuration?: number;
}

export interface ManagedPolicyDefinition {
  name: string;
  path: string;
  description: string;
  document: string;
}

/** A visão da conta não traz descrição nem duração de sessão das funções; o serviço completa. */
export type RoleRecord = RoleDetail & { Description?: string; MaxSessionDuration?: number };

export interface AuthorizationDetails {
  users: UserDetail[];
  groups: GroupDetail[];
  roles: RoleRecord[];
  policies: ManagedPolicyDetail[];
}

const iso = (date: Date | undefined) => date?.toISOString() ?? null;

export const policyType = (arn: string): AttachedPolicy['type'] => (arn.startsWith('arn:aws:iam::aws:policy/') ? 'aws' : 'customer');

const toAttached = (policies: SdkAttachedPolicy[] | undefined): AttachedPolicy[] =>
  (policies ?? []).flatMap((p) => (p.PolicyArn ? [{ name: p.PolicyName ?? p.PolicyArn, arn: p.PolicyArn, type: policyType(p.PolicyArn) }] : []));

const toInlineRecord = (policies: { PolicyName?: string; PolicyDocument?: string }[] | undefined): Record<string, string> =>
  Object.fromEntries((policies ?? []).flatMap((p) => (p.PolicyName ? [[p.PolicyName, decodePolicy(p.PolicyDocument)]] : [])));

const isNoSuchEntity = (err: unknown) => (err as Error).name === 'NoSuchEntityException';

/** Operações de política que existem para as três identidades, com comandos diferentes. */
interface IdentityPolicyOps {
  attach(name: string, arn: string): Promise<unknown>;
  detach(name: string, arn: string): Promise<unknown>;
  put(name: string, policyName: string, document: string): Promise<unknown>;
  remove(name: string, policyName: string): Promise<unknown>;
  listInline(name: string): Promise<string[]>;
  getInline(name: string, policyName: string): Promise<string | undefined>;
  listAttached(name: string): Promise<SdkAttachedPolicy[] | undefined>;
}

export class IamService {
  private readonly ops: Record<IdentityKind, IdentityPolicyOps>;

  constructor(private readonly iam: IAMClient) {
    this.ops = {
      user: {
        attach: (UserName, PolicyArn) => iam.send(new AttachUserPolicyCommand({ UserName, PolicyArn })),
        detach: (UserName, PolicyArn) => iam.send(new DetachUserPolicyCommand({ UserName, PolicyArn })),
        put: (UserName, PolicyName, PolicyDocument) => iam.send(new PutUserPolicyCommand({ UserName, PolicyName, PolicyDocument })),
        remove: (UserName, PolicyName) => iam.send(new DeleteUserPolicyCommand({ UserName, PolicyName })),
        listInline: async (UserName) => (await iam.send(new ListUserPoliciesCommand({ UserName }))).PolicyNames ?? [],
        getInline: async (UserName, PolicyName) => (await iam.send(new GetUserPolicyCommand({ UserName, PolicyName }))).PolicyDocument,
        listAttached: async (UserName) => (await iam.send(new ListAttachedUserPoliciesCommand({ UserName }))).AttachedPolicies,
      },
      group: {
        attach: (GroupName, PolicyArn) => iam.send(new AttachGroupPolicyCommand({ GroupName, PolicyArn })),
        detach: (GroupName, PolicyArn) => iam.send(new DetachGroupPolicyCommand({ GroupName, PolicyArn })),
        put: (GroupName, PolicyName, PolicyDocument) => iam.send(new PutGroupPolicyCommand({ GroupName, PolicyName, PolicyDocument })),
        remove: (GroupName, PolicyName) => iam.send(new DeleteGroupPolicyCommand({ GroupName, PolicyName })),
        listInline: async (GroupName) => (await iam.send(new ListGroupPoliciesCommand({ GroupName }))).PolicyNames ?? [],
        getInline: async (GroupName, PolicyName) => (await iam.send(new GetGroupPolicyCommand({ GroupName, PolicyName }))).PolicyDocument,
        listAttached: async (GroupName) => (await iam.send(new ListAttachedGroupPoliciesCommand({ GroupName }))).AttachedPolicies,
      },
      role: {
        attach: (RoleName, PolicyArn) => iam.send(new AttachRolePolicyCommand({ RoleName, PolicyArn })),
        detach: (RoleName, PolicyArn) => iam.send(new DetachRolePolicyCommand({ RoleName, PolicyArn })),
        put: (RoleName, PolicyName, PolicyDocument) => iam.send(new PutRolePolicyCommand({ RoleName, PolicyName, PolicyDocument })),
        remove: (RoleName, PolicyName) => iam.send(new DeleteRolePolicyCommand({ RoleName, PolicyName })),
        listInline: async (RoleName) => (await iam.send(new ListRolePoliciesCommand({ RoleName }))).PolicyNames ?? [],
        getInline: async (RoleName, PolicyName) => (await iam.send(new GetRolePolicyCommand({ RoleName, PolicyName }))).PolicyDocument,
        listAttached: async (RoleName) => (await iam.send(new ListAttachedRolePoliciesCommand({ RoleName }))).AttachedPolicies,
      },
    };
  }

  // ---- Conta ----

  async summary(): Promise<Record<string, number>> {
    const { SummaryMap = {} } = await this.iam.send(new GetAccountSummaryCommand({}));
    return SummaryMap;
  }

  /** Visão completa da conta numa só consulta paginada, como o IAM oferece para auditoria. */
  async authorizationDetails(filter: EntityType[]): Promise<AuthorizationDetails> {
    const result: AuthorizationDetails = { users: [], groups: [], roles: [], policies: [] };
    let marker: string | undefined;
    do {
      const page = await this.iam.send(new GetAccountAuthorizationDetailsCommand({ Filter: filter, Marker: marker }));
      result.users.push(...(page.UserDetailList ?? []));
      result.groups.push(...(page.GroupDetailList ?? []));
      result.roles.push(...(page.RoleDetailList ?? []));
      result.policies.push(...(page.Policies ?? []));
      marker = page.IsTruncated ? page.Marker : undefined;
    } while (marker);
    if (filter.includes('Role')) await this.completeRoles(result.roles);
    return result;
  }

  private async completeRoles(roles: RoleRecord[]): Promise<void> {
    const byName = new Map(roles.map((r) => [r.RoleName, r]));
    let marker: string | undefined;
    do {
      const page = await this.iam.send(new ListRolesCommand({ Marker: marker }));
      for (const role of page.Roles ?? []) {
        const record = byName.get(role.RoleName);
        if (!record) continue;
        record.Description = role.Description;
        record.MaxSessionDuration = role.MaxSessionDuration;
      }
      marker = page.IsTruncated ? page.Marker : undefined;
    } while (marker);
  }

  // ---- Políticas de identidades (gerenciadas anexadas e em linha) ----

  async attachPolicies(kind: IdentityKind, name: string, arns: readonly string[]): Promise<void> {
    for (const arn of arns) await this.ops[kind].attach(name, arn);
  }

  detachPolicy(kind: IdentityKind, name: string, arn: string): Promise<unknown> {
    return this.ops[kind].detach(name, arn);
  }

  putInlinePolicy(kind: IdentityKind, name: string, policyName: string, document: string): Promise<unknown> {
    return this.ops[kind].put(name, policyName, requirePolicyDocument(document));
  }

  deleteInlinePolicy(kind: IdentityKind, name: string, policyName: string): Promise<unknown> {
    return this.ops[kind].remove(name, policyName);
  }

  private async policiesOf(kind: IdentityKind, name: string): Promise<IdentityPolicies> {
    const ops = this.ops[kind];
    const inline: InlinePolicy[] = [];
    for (const policyName of await ops.listInline(name)) {
      inline.push({ name: policyName, document: decodePolicy(await ops.getInline(name, policyName)) });
    }
    return { attached: toAttached(await ops.listAttached(name)), inline };
  }

  /** Remove todas as políticas da identidade: a AWS exige isso antes de excluí-la. */
  private async clearPolicies(kind: IdentityKind, name: string): Promise<void> {
    const ops = this.ops[kind];
    for (const policyName of await ops.listInline(name)) await ops.remove(name, policyName);
    for (const policy of (await ops.listAttached(name)) ?? []) if (policy.PolicyArn) await ops.detach(name, policy.PolicyArn);
  }

  // ---- Usuários ----

  async listUsers(): Promise<UserSummary[]> {
    const { users } = await this.authorizationDetails(['User']);
    const summaries: UserSummary[] = [];
    for (const user of users) {
      const name = user.UserName!;
      summaries.push({
        name,
        arn: user.Arn ?? '',
        path: user.Path ?? '/',
        groups: user.GroupList ?? [],
        policies: (user.AttachedManagedPolicies?.length ?? 0) + (user.UserPolicyList?.length ?? 0),
        accessKeys: await this.accessKeys(name, false),
        createdAt: iso(user.CreateDate),
        builtIn: name === BUILT_IN_USER,
      });
    }
    return summaries;
  }

  async getUser(name: string): Promise<UserDetailView> {
    const { User } = await this.iam.send(new GetUserCommand({ UserName: name }));
    const { Groups = [] } = await this.iam.send(new ListGroupsForUserCommand({ UserName: name }));
    return {
      name,
      arn: User?.Arn ?? '',
      id: User?.UserId ?? '',
      path: User?.Path ?? '/',
      createdAt: iso(User?.CreateDate),
      builtIn: name === BUILT_IN_USER,
      groups: Groups.flatMap((g) => (g.GroupName ? [g.GroupName] : [])),
      accessKeys: await this.accessKeys(name, true),
      ...(await this.policiesOf('user', name)),
    };
  }

  async createUser(user: UserDefinition): Promise<void> {
    await this.iam.send(new CreateUserCommand({ UserName: user.name, Path: user.path }));
    for (const group of user.groups) await this.iam.send(new AddUserToGroupCommand({ GroupName: group, UserName: user.name }));
    await this.attachPolicies('user', user.name, user.managedPolicyArns);
    for (const [policyName, document] of Object.entries(user.inlinePolicies)) await this.ops.user.put(user.name, policyName, document);
  }

  /** Exclui o usuário e tudo o que o prende, como faz o console. */
  async deleteUser(name: string): Promise<void> {
    for (const key of await this.accessKeys(name, false)) {
      await this.iam.send(new DeleteAccessKeyCommand({ UserName: name, AccessKeyId: key.id }));
    }
    try {
      await this.iam.send(new DeleteLoginProfileCommand({ UserName: name }));
    } catch (err) {
      if (!isNoSuchEntity(err)) throw err;
    }
    const { Groups = [] } = await this.iam.send(new ListGroupsForUserCommand({ UserName: name }));
    for (const group of Groups) await this.iam.send(new RemoveUserFromGroupCommand({ GroupName: group.GroupName, UserName: name }));
    await this.clearPolicies('user', name);
    await this.iam.send(new DeleteUserCommand({ UserName: name }));
  }

  async addUserToGroups(user: string, groups: readonly string[]): Promise<void> {
    for (const group of groups) await this.iam.send(new AddUserToGroupCommand({ GroupName: group, UserName: user }));
  }

  async removeUserFromGroup(user: string, group: string): Promise<void> {
    await this.iam.send(new RemoveUserFromGroupCommand({ GroupName: group, UserName: user }));
  }

  // ---- Chaves de acesso ----

  private async accessKeys(user: string, withLastUse: boolean): Promise<AccessKey[]> {
    const { AccessKeyMetadata = [] } = await this.iam.send(new ListAccessKeysCommand({ UserName: user }));
    const keys: AccessKey[] = [];
    for (const key of AccessKeyMetadata) {
      if (!key.AccessKeyId) continue;
      const lastUsed = withLastUse
        ? (await this.iam.send(new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId }))).AccessKeyLastUsed
        : undefined;
      keys.push({
        id: key.AccessKeyId,
        status: key.Status === 'Inactive' ? 'Inactive' : 'Active',
        createdAt: iso(key.CreateDate),
        lastUsedAt: iso(lastUsed?.LastUsedDate),
        lastUsedService: lastUsed?.ServiceName && lastUsed.ServiceName !== 'N/A' ? lastUsed.ServiceName : null,
      });
    }
    return keys;
  }

  /** O segredo só existe nesta resposta: a AWS não permite recuperá-lo depois. */
  async createAccessKey(user: string): Promise<{ accessKeyId: string; secretAccessKey: string }> {
    const { AccessKey } = await this.iam.send(new CreateAccessKeyCommand({ UserName: user }));
    return { accessKeyId: AccessKey?.AccessKeyId ?? '', secretAccessKey: AccessKey?.SecretAccessKey ?? '' };
  }

  async setAccessKeyStatus(user: string, accessKeyId: string, status: AccessKey['status']): Promise<void> {
    await this.iam.send(new UpdateAccessKeyCommand({ UserName: user, AccessKeyId: accessKeyId, Status: status }));
  }

  async deleteAccessKey(user: string, accessKeyId: string): Promise<void> {
    await this.iam.send(new DeleteAccessKeyCommand({ UserName: user, AccessKeyId: accessKeyId }));
  }

  // ---- Grupos ----

  async listGroups(): Promise<GroupSummary[]> {
    const { users, groups } = await this.authorizationDetails(['User', 'Group']);
    return groups.map((group) => ({
      name: group.GroupName!,
      arn: group.Arn ?? '',
      path: group.Path ?? '/',
      users: users.filter((u) => u.GroupList?.includes(group.GroupName!)).length,
      policies: (group.AttachedManagedPolicies?.length ?? 0) + (group.GroupPolicyList?.length ?? 0),
      createdAt: iso(group.CreateDate),
    }));
  }

  async getGroup(name: string): Promise<GroupDetailView> {
    const { Group, Users = [] } = await this.iam.send(new GetGroupCommand({ GroupName: name }));
    return {
      name,
      arn: Group?.Arn ?? '',
      id: Group?.GroupId ?? '',
      path: Group?.Path ?? '/',
      createdAt: iso(Group?.CreateDate),
      users: Users.map((u) => ({ name: u.UserName ?? '', arn: u.Arn ?? '', createdAt: iso(u.CreateDate) })),
      ...(await this.policiesOf('group', name)),
    };
  }

  async createGroup(group: GroupDefinition, users: readonly string[] = []): Promise<void> {
    await this.iam.send(new CreateGroupCommand({ GroupName: group.name, Path: group.path }));
    await this.attachPolicies('group', group.name, group.managedPolicyArns);
    for (const [policyName, document] of Object.entries(group.inlinePolicies)) await this.ops.group.put(group.name, policyName, document);
    for (const user of users) await this.iam.send(new AddUserToGroupCommand({ GroupName: group.name, UserName: user }));
  }

  async deleteGroup(name: string): Promise<void> {
    const { Users = [] } = await this.iam.send(new GetGroupCommand({ GroupName: name }));
    for (const user of Users) await this.iam.send(new RemoveUserFromGroupCommand({ GroupName: name, UserName: user.UserName }));
    await this.clearPolicies('group', name);
    await this.iam.send(new DeleteGroupCommand({ GroupName: name }));
  }

  // ---- Funções ----

  async listRoles(): Promise<RoleSummary[]> {
    const { roles } = await this.authorizationDetails(['Role']);
    return roles.map((role) => ({
      name: role.RoleName!,
      arn: role.Arn ?? '',
      path: role.Path ?? '/',
      description: role.Description ?? '',
      trustedEntities: trustedEntities(decodePolicy(role.AssumeRolePolicyDocument)),
      createdAt: iso(role.CreateDate),
      lastUsedAt: iso(role.RoleLastUsed?.LastUsedDate),
    }));
  }

  async getRole(name: string): Promise<RoleDetailView> {
    const { Role } = await this.iam.send(new GetRoleCommand({ RoleName: name }));
    const trustPolicy = decodePolicy(Role?.AssumeRolePolicyDocument);
    return {
      name,
      arn: Role?.Arn ?? '',
      id: Role?.RoleId ?? '',
      path: Role?.Path ?? '/',
      description: Role?.Description ?? '',
      createdAt: iso(Role?.CreateDate),
      maxSessionDuration: Role?.MaxSessionDuration ?? 3600,
      trustPolicy,
      trustedEntities: trustedEntities(trustPolicy),
      lastUsedAt: iso(Role?.RoleLastUsed?.LastUsedDate),
      lastUsedRegion: Role?.RoleLastUsed?.Region ?? null,
      ...(await this.policiesOf('role', name)),
    };
  }

  async createRole(role: RoleDefinition): Promise<string> {
    const { Role } = await this.iam.send(
      new CreateRoleCommand({
        RoleName: role.name,
        Path: role.path,
        Description: role.description || undefined,
        MaxSessionDuration: role.maxSessionDuration,
        AssumeRolePolicyDocument: requirePolicyDocument(role.trustPolicy, 'A política de confiança'),
      }),
    );
    for (const [policyName, document] of Object.entries(role.inlinePolicies)) await this.ops.role.put(role.name, policyName, document);
    await this.attachPolicies('role', role.name, role.managedPolicyArns);
    return Role?.Arn ?? '';
  }

  async updateTrustPolicy(name: string, trustPolicy: string): Promise<void> {
    await this.iam.send(
      new UpdateAssumeRolePolicyCommand({ RoleName: name, PolicyDocument: requirePolicyDocument(trustPolicy, 'A política de confiança') }),
    );
  }

  async updateRole(name: string, description: string, maxSessionDuration: number): Promise<void> {
    await this.iam.send(new UpdateRoleCommand({ RoleName: name, Description: description, MaxSessionDuration: maxSessionDuration }));
  }

  async deleteRole(name: string): Promise<void> {
    await this.clearPolicies('role', name);
    await this.iam.send(new DeleteRoleCommand({ RoleName: name }));
  }

  /**
   * Garante um papel de serviço criado pelo painel, como o console da AWS faz ao
   * oferecer "criar um novo papel". Devolve o ARN, criando o papel só se não existir.
   */
  async ensureServiceRole(name: string, servicePrincipal: string, actions: string[]): Promise<string> {
    try {
      const { Role } = await this.iam.send(new GetRoleCommand({ RoleName: name }));
      if (Role?.Arn) return Role.Arn;
    } catch (err) {
      if (!isNoSuchEntity(err)) throw err;
    }
    const statement = { Effect: 'Allow', Action: actions, Resource: '*' };
    return this.createRole({
      name,
      path: '/service-role/',
      description: 'Criado pelo Console AWS local',
      trustPolicy: trustPolicyFor(servicePrincipal),
      inlinePolicies: { permissoes: JSON.stringify({ Version: '2012-10-17', Statement: [statement] }) },
      managedPolicyArns: [],
    });
  }
}

/** Converte a visão da conta nas definições que a restauração recria. */
export function toDefinitions(details: AuthorizationDetails) {
  const policies: ManagedPolicyDefinition[] = details.policies.map((p) => ({
    name: p.PolicyName!,
    path: p.Path ?? '/',
    description: p.Description ?? '',
    document: decodePolicy(p.PolicyVersionList?.find((v) => v.IsDefaultVersion)?.Document),
  }));
  const groups: GroupDefinition[] = details.groups.map((g) => ({
    name: g.GroupName!,
    path: g.Path ?? '/',
    managedPolicyArns: toAttached(g.AttachedManagedPolicies).map((p) => p.arn),
    inlinePolicies: toInlineRecord(g.GroupPolicyList),
  }));
  const users: UserDefinition[] = details.users
    .filter((u) => u.UserName !== BUILT_IN_USER)
    .map((u) => ({
      name: u.UserName!,
      path: u.Path ?? '/',
      groups: u.GroupList ?? [],
      managedPolicyArns: toAttached(u.AttachedManagedPolicies).map((p) => p.arn),
      inlinePolicies: toInlineRecord(u.UserPolicyList),
    }));
  // Funções vinculadas a serviço (/aws-service-role/) são criadas pela própria AWS.
  const roles: RoleDefinition[] = details.roles
    .filter((r) => !r.Path?.startsWith('/aws-service-role/'))
    .map((r) => ({
      name: r.RoleName!,
      path: r.Path ?? '/',
      description: r.Description ?? '',
      maxSessionDuration: r.MaxSessionDuration,
      trustPolicy: decodePolicy(r.AssumeRolePolicyDocument),
      inlinePolicies: toInlineRecord(r.RolePolicyList),
      managedPolicyArns: toAttached(r.AttachedManagedPolicies).map((p) => p.arn),
    }));
  return { policies, groups, users, roles };
}

/** Papéis padrão que o painel cria quando o usuário não informa um. */
export const SERVICE_ROLES = {
  lambda: {
    name: 'aws-console-local-lambda',
    principal: 'lambda.amazonaws.com',
    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'sqs:*', 'sns:Publish', 'dynamodb:*', 's3:*', 'secretsmanager:GetSecretValue', 'ssm:GetParameter*', 's3vectors:*', 'bedrock:InvokeModel'],
  },
  scheduler: {
    name: 'aws-console-local-scheduler',
    principal: 'scheduler.amazonaws.com',
    actions: ['lambda:InvokeFunction', 'sqs:SendMessage', 'sns:Publish', 'states:StartExecution', 'events:PutEvents'],
  },
  stepfunctions: {
    name: 'aws-console-local-stepfunctions',
    principal: 'states.amazonaws.com',
    actions: ['lambda:InvokeFunction', 'sqs:SendMessage', 'sns:Publish', 'dynamodb:*', 'events:PutEvents', 'states:StartExecution'],
  },
  eks: {
    name: 'aws-console-local-eks',
    principal: 'eks.amazonaws.com',
    actions: ['ec2:*', 'elasticloadbalancing:*', 'iam:CreateServiceLinkedRole'],
  },
  firehose: {
    name: 'aws-console-local-firehose',
    principal: 'firehose.amazonaws.com',
    actions: ['s3:*', 'kinesis:*', 'lambda:InvokeFunction', 'logs:PutLogEvents'],
  },
} as const;

export type ServiceRoleKind = keyof typeof SERVICE_ROLES;

export function ensureDefaultRole(iam: IamService, kind: ServiceRoleKind): Promise<string> {
  const role = SERVICE_ROLES[kind];
  return iam.ensureServiceRole(role.name, role.principal, [...role.actions]);
}
