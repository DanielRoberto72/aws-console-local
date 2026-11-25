import { encode, json, request } from './http';

export type PolicyType = 'aws' | 'customer';
/** Identidades que recebem políticas, no formato usado nas rotas. */
export type IdentityKind = 'users' | 'groups' | 'roles';

export interface AttachedPolicy {
  name: string;
  arn: string;
  type: PolicyType;
}

export interface InlinePolicy {
  name: string;
  document: string;
}

export interface IdentityPolicies {
  attached: AttachedPolicy[];
  inline: InlinePolicy[];
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

export interface UserDetail extends IdentityPolicies {
  name: string;
  arn: string;
  id: string;
  path: string;
  createdAt: string | null;
  builtIn: boolean;
  groups: string[];
  accessKeys: AccessKey[];
}

export interface GroupSummary {
  name: string;
  arn: string;
  path: string;
  users: number;
  policies: number;
  createdAt: string | null;
}

export interface GroupDetail extends IdentityPolicies {
  name: string;
  arn: string;
  id: string;
  path: string;
  createdAt: string | null;
  users: { name: string; arn: string; createdAt: string | null }[];
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

export interface RoleDetail extends IdentityPolicies {
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

export interface PolicySummary {
  name: string;
  arn: string;
  path: string;
  type: PolicyType;
  description: string;
  attachments: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PolicyDetail extends PolicySummary {
  id: string;
  defaultVersion: string;
  document: string;
  versions: { id: string; isDefault: boolean; createdAt: string | null }[];
  entities: { users: string[]; groups: string[]; roles: string[] };
}

export interface NewRole {
  name: string;
  path?: string;
  description?: string;
  trustPolicy: string;
  maxSessionDuration?: number;
  policyArns: string[];
}

const post = (path: string, body?: unknown) => request(path, { method: 'POST', body: body === undefined ? undefined : json(body) });
const put = (path: string, body: unknown) => request(path, { method: 'PUT', body: json(body) });

export const iamApi = {
  summary: (signal?: AbortSignal) => request<{ summary: Record<string, number> }>('/api/iam/summary', { signal }),

  listUsers: (signal?: AbortSignal) => request<{ users: UserSummary[] }>('/api/iam/users', { signal }),
  user: (name: string, signal?: AbortSignal) => request<UserDetail>(`/api/iam/users/${encode(name)}`, { signal }),
  createUser: (input: { name: string; path?: string; groups: string[]; policyArns: string[] }) => post('/api/iam/users', input),
  deleteUser: (name: string) => post(`/api/iam/users/${encode(name)}/delete`),
  addUserToGroups: (name: string, groups: string[]) => post(`/api/iam/users/${encode(name)}/groups`, { groups }),
  removeUserFromGroup: (name: string, group: string) => post(`/api/iam/users/${encode(name)}/groups/remove`, { group }),

  createAccessKey: (user: string) =>
    request<{ accessKeyId: string; secretAccessKey: string }>(`/api/iam/users/${encode(user)}/access-keys`, { method: 'POST' }),
  setAccessKeyStatus: (user: string, id: string, status: AccessKey['status']) => put(`/api/iam/users/${encode(user)}/access-keys`, { id, status }),
  deleteAccessKey: (user: string, id: string) => post(`/api/iam/users/${encode(user)}/access-keys/delete`, { id }),

  listGroups: (signal?: AbortSignal) => request<{ groups: GroupSummary[] }>('/api/iam/groups', { signal }),
  group: (name: string, signal?: AbortSignal) => request<GroupDetail>(`/api/iam/groups/${encode(name)}`, { signal }),
  createGroup: (input: { name: string; path?: string; users: string[]; policyArns: string[] }) => post('/api/iam/groups', input),
  deleteGroup: (name: string) => post(`/api/iam/groups/${encode(name)}/delete`),
  addUsersToGroup: (name: string, users: string[]) => post(`/api/iam/groups/${encode(name)}/users`, { users }),
  removeUserFromGroupOf: (name: string, user: string) => post(`/api/iam/groups/${encode(name)}/users/remove`, { user }),

  listRoles: (signal?: AbortSignal) => request<{ roles: RoleSummary[] }>('/api/iam/roles', { signal }),
  role: (name: string, signal?: AbortSignal) => request<RoleDetail>(`/api/iam/roles/${encode(name)}`, { signal }),
  createRole: (input: NewRole) => request<{ name: string; arn: string }>('/api/iam/roles', { method: 'POST', body: json(input) }),
  updateRole: (name: string, description: string, maxSessionDuration: number) =>
    put(`/api/iam/roles/${encode(name)}`, { description, maxSessionDuration }),
  updateTrustPolicy: (name: string, document: string) => put(`/api/iam/roles/${encode(name)}/trust`, { document }),
  deleteRole: (name: string) => post(`/api/iam/roles/${encode(name)}/delete`),

  attachPolicies: (kind: IdentityKind, name: string, arns: string[]) => post(`/api/iam/${kind}/${encode(name)}/policies/attach`, { arns }),
  detachPolicy: (kind: IdentityKind, name: string, arn: string) => post(`/api/iam/${kind}/${encode(name)}/policies/detach`, { arn }),
  putInlinePolicy: (kind: IdentityKind, name: string, policyName: string, document: string) =>
    put(`/api/iam/${kind}/${encode(name)}/inline`, { policyName, document }),
  deleteInlinePolicy: (kind: IdentityKind, name: string, policyName: string) =>
    post(`/api/iam/${kind}/${encode(name)}/inline/delete`, { policyName }),

  listPolicies: (signal?: AbortSignal) => request<{ policies: PolicySummary[] }>('/api/iam/policies', { signal }),
  policy: (arn: string, signal?: AbortSignal) => request<PolicyDetail>(`/api/iam/policies/detail?arn=${encode(arn)}`, { signal }),
  createPolicy: (input: { name: string; path?: string; description: string; document: string }) =>
    request<{ arn: string }>('/api/iam/policies', { method: 'POST', body: json(input) }),
  updatePolicy: (arn: string, document: string) => put('/api/iam/policies', { arn, document }),
  setDefaultVersion: (arn: string, versionId: string) => post('/api/iam/policies/default-version', { arn, versionId }),
  deleteVersion: (arn: string, versionId: string) => post('/api/iam/policies/delete-version', { arn, versionId }),
  deletePolicy: (arn: string) => post('/api/iam/policies/delete', { arn }),
};
