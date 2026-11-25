import {
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
  UpdateSecretCommand,
  type SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export interface SecretSummary {
  name: string;
  arn: string;
  description: string;
  lastChangedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string | null;
}

/** Valor do segredo: texto (o caso comum, incluindo JSON) ou binário em base64. */
export type SecretValue = { kind: 'string'; value: string } | { kind: 'binary'; base64: string };

const iso = (d: Date | undefined) => d?.toISOString() ?? null;

export class SecretsService {
  constructor(private readonly secrets: SecretsManagerClient) {}

  async listSecrets(): Promise<SecretSummary[]> {
    const secrets: SecretSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.secrets.send(new ListSecretsCommand({ NextToken: token, MaxResults: 100 }));
      for (const s of page.SecretList ?? []) {
        if (!s.Name) continue;
        secrets.push({
          name: s.Name,
          arn: s.ARN ?? '',
          description: s.Description ?? '',
          lastChangedAt: iso(s.LastChangedDate),
          lastAccessedAt: iso(s.LastAccessedDate),
          createdAt: iso(s.CreatedDate),
        });
      }
      token = page.NextToken;
    } while (token);
    return secrets;
  }

  async describe(name: string) {
    const s = await this.secrets.send(new DescribeSecretCommand({ SecretId: name }));
    return {
      name: s.Name ?? name,
      arn: s.ARN ?? '',
      description: s.Description ?? '',
      createdAt: iso(s.CreatedDate),
      lastChangedAt: iso(s.LastChangedDate),
      versions: Object.keys(s.VersionIdsToStages ?? {}).length,
    };
  }

  async getValue(name: string): Promise<SecretValue> {
    const result = await this.secrets.send(new GetSecretValueCommand({ SecretId: name }));
    if (result.SecretBinary) return { kind: 'binary', base64: Buffer.from(result.SecretBinary).toString('base64') };
    return { kind: 'string', value: result.SecretString ?? '' };
  }

  async create(name: string, description: string, value: SecretValue): Promise<void> {
    await this.secrets.send(
      new CreateSecretCommand({
        Name: name,
        Description: description || undefined,
        ...(value.kind === 'string' ? { SecretString: value.value } : { SecretBinary: Buffer.from(value.base64, 'base64') }),
      }),
    );
  }

  async putValue(name: string, value: SecretValue): Promise<void> {
    await this.secrets.send(
      new PutSecretValueCommand({
        SecretId: name,
        ...(value.kind === 'string' ? { SecretString: value.value } : { SecretBinary: Buffer.from(value.base64, 'base64') }),
      }),
    );
  }

  async updateDescription(name: string, description: string): Promise<void> {
    await this.secrets.send(new UpdateSecretCommand({ SecretId: name, Description: description }));
  }

  /** Exclusão imediata: no uso local não faz sentido a janela de recuperação de 7 a 30 dias. */
  async delete(name: string): Promise<void> {
    await this.secrets.send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }));
  }
}
