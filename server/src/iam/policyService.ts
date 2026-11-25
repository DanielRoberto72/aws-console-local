import {
  CreatePolicyCommand,
  CreatePolicyVersionCommand,
  DeletePolicyCommand,
  DeletePolicyVersionCommand,
  DetachGroupPolicyCommand,
  DetachRolePolicyCommand,
  DetachUserPolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListEntitiesForPolicyCommand,
  ListPoliciesCommand,
  ListPolicyVersionsCommand,
  SetDefaultPolicyVersionCommand,
  type IAMClient,
  type PolicyVersion,
} from '@aws-sdk/client-iam';
import { policyType, type AttachedPolicy, type ManagedPolicyDefinition } from './iamService.js';
import { decodePolicy, requirePolicyDocument } from './policyDocuments.js';

/** A AWS guarda no máximo 5 versões de uma política gerenciada pelo cliente. */
export const MAX_POLICY_VERSIONS = 5;

export interface PolicySummary {
  name: string;
  arn: string;
  path: string;
  type: AttachedPolicy['type'];
  description: string;
  attachments: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PolicyDetailView extends PolicySummary {
  id: string;
  defaultVersion: string;
  document: string;
  versions: { id: string; isDefault: boolean; createdAt: string | null }[];
  entities: { users: string[]; groups: string[]; roles: string[] };
}

const iso = (date: Date | undefined) => date?.toISOString() ?? null;

/**
 * Escolhe a versão a descartar para abrir espaço a uma nova: a mais antiga que não
 * seja a padrão. O console pede essa escolha ao usuário; aqui a regra é fixa.
 */
export function oldestNonDefaultVersion(versions: readonly PolicyVersion[]): string | undefined {
  return [...versions]
    .filter((v) => !v.IsDefaultVersion && v.VersionId)
    .sort((a, b) => (a.CreateDate?.getTime() ?? 0) - (b.CreateDate?.getTime() ?? 0))[0]?.VersionId;
}

/** Políticas gerenciadas: as da AWS (só leitura) e as criadas na conta. */
export class PolicyService {
  constructor(private readonly iam: IAMClient) {}

  async list(): Promise<PolicySummary[]> {
    const policies: PolicySummary[] = [];
    let marker: string | undefined;
    do {
      const page = await this.iam.send(new ListPoliciesCommand({ Scope: 'All', Marker: marker }));
      for (const p of page.Policies ?? []) {
        if (!p.Arn) continue;
        policies.push({
          name: p.PolicyName ?? p.Arn,
          arn: p.Arn,
          path: p.Path ?? '/',
          type: policyType(p.Arn),
          description: p.Description ?? '',
          attachments: p.AttachmentCount ?? 0,
          createdAt: iso(p.CreateDate),
          updatedAt: iso(p.UpdateDate),
        });
      }
      marker = page.IsTruncated ? page.Marker : undefined;
    } while (marker);
    return policies;
  }

  async get(arn: string): Promise<PolicyDetailView> {
    const { Policy } = await this.iam.send(new GetPolicyCommand({ PolicyArn: arn }));
    const defaultVersion = Policy?.DefaultVersionId ?? 'v1';
    const { PolicyVersion: version } = await this.iam.send(new GetPolicyVersionCommand({ PolicyArn: arn, VersionId: defaultVersion }));
    const { Versions = [] } = await this.iam.send(new ListPolicyVersionsCommand({ PolicyArn: arn }));
    const entities = await this.iam.send(new ListEntitiesForPolicyCommand({ PolicyArn: arn }));
    return {
      name: Policy?.PolicyName ?? arn,
      arn,
      id: Policy?.PolicyId ?? '',
      path: Policy?.Path ?? '/',
      type: policyType(arn),
      description: Policy?.Description ?? '',
      attachments: Policy?.AttachmentCount ?? 0,
      createdAt: iso(Policy?.CreateDate),
      updatedAt: iso(Policy?.UpdateDate),
      defaultVersion,
      document: decodePolicy(version?.Document),
      versions: Versions.map((v) => ({ id: v.VersionId ?? '', isDefault: v.IsDefaultVersion ?? false, createdAt: iso(v.CreateDate) })),
      entities: {
        users: (entities.PolicyUsers ?? []).flatMap((u) => (u.UserName ? [u.UserName] : [])),
        groups: (entities.PolicyGroups ?? []).flatMap((g) => (g.GroupName ? [g.GroupName] : [])),
        roles: (entities.PolicyRoles ?? []).flatMap((r) => (r.RoleName ? [r.RoleName] : [])),
      },
    };
  }

  async create(policy: ManagedPolicyDefinition): Promise<string> {
    const { Policy } = await this.iam.send(
      new CreatePolicyCommand({
        PolicyName: policy.name,
        Path: policy.path,
        Description: policy.description || undefined,
        PolicyDocument: requirePolicyDocument(policy.document),
      }),
    );
    return Policy?.Arn ?? '';
  }

  /** Salvar alterações cria uma nova versão padrão, como no console. */
  async update(arn: string, document: string): Promise<void> {
    requirePolicyDocument(document);
    const { Versions = [] } = await this.iam.send(new ListPolicyVersionsCommand({ PolicyArn: arn }));
    if (Versions.length >= MAX_POLICY_VERSIONS) {
      const discard = oldestNonDefaultVersion(Versions);
      if (discard) await this.iam.send(new DeletePolicyVersionCommand({ PolicyArn: arn, VersionId: discard }));
    }
    await this.iam.send(new CreatePolicyVersionCommand({ PolicyArn: arn, PolicyDocument: document, SetAsDefault: true }));
  }

  async setDefaultVersion(arn: string, versionId: string): Promise<void> {
    await this.iam.send(new SetDefaultPolicyVersionCommand({ PolicyArn: arn, VersionId: versionId }));
  }

  async deleteVersion(arn: string, versionId: string): Promise<void> {
    await this.iam.send(new DeletePolicyVersionCommand({ PolicyArn: arn, VersionId: versionId }));
  }

  /** Desanexa de todas as identidades e apaga as versões antigas antes de excluir, como o console. */
  async delete(arn: string): Promise<void> {
    const entities = await this.iam.send(new ListEntitiesForPolicyCommand({ PolicyArn: arn }));
    for (const u of entities.PolicyUsers ?? []) await this.iam.send(new DetachUserPolicyCommand({ UserName: u.UserName, PolicyArn: arn }));
    for (const g of entities.PolicyGroups ?? []) await this.iam.send(new DetachGroupPolicyCommand({ GroupName: g.GroupName, PolicyArn: arn }));
    for (const r of entities.PolicyRoles ?? []) await this.iam.send(new DetachRolePolicyCommand({ RoleName: r.RoleName, PolicyArn: arn }));
    const { Versions = [] } = await this.iam.send(new ListPolicyVersionsCommand({ PolicyArn: arn }));
    for (const v of Versions) {
      if (!v.IsDefaultVersion) await this.iam.send(new DeletePolicyVersionCommand({ PolicyArn: arn, VersionId: v.VersionId }));
    }
    await this.iam.send(new DeletePolicyCommand({ PolicyArn: arn }));
  }
}
