import {
  DeleteParameterCommand,
  DescribeParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  type ParameterType,
  type SSMClient,
} from '@aws-sdk/client-ssm';

export type ParameterKind = 'String' | 'StringList' | 'SecureString';

export interface ParameterSummary {
  name: string;
  type: ParameterKind;
  version: number;
  description: string;
  lastModified: string | null;
  tier: string;
}

export interface ParameterInput {
  name: string;
  type: ParameterKind;
  value: string;
  description: string;
}

export class SsmService {
  constructor(private readonly ssm: SSMClient) {}

  async listParameters(): Promise<ParameterSummary[]> {
    const parameters: ParameterSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.ssm.send(new DescribeParametersCommand({ NextToken: token, MaxResults: 50 }));
      for (const p of page.Parameters ?? []) {
        if (!p.Name) continue;
        parameters.push({
          name: p.Name,
          type: (p.Type ?? 'String') as ParameterKind,
          version: p.Version ?? 1,
          description: p.Description ?? '',
          lastModified: p.LastModifiedDate?.toISOString() ?? null,
          tier: p.Tier ?? 'Standard',
        });
      }
      token = page.NextToken;
    } while (token);
    return parameters;
  }

  /** Valor descriptografado: o painel é local e mostra o valor só quando pedido. */
  async getParameter(name: string) {
    const { Parameter } = await this.ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    return {
      name: Parameter?.Name ?? name,
      type: (Parameter?.Type ?? 'String') as ParameterKind,
      value: Parameter?.Value ?? '',
      version: Parameter?.Version ?? 1,
      arn: Parameter?.ARN ?? '',
      lastModified: Parameter?.LastModifiedDate?.toISOString() ?? null,
    };
  }

  async putParameter(input: ParameterInput, overwrite: boolean): Promise<number> {
    const { Version } = await this.ssm.send(
      new PutParameterCommand({
        Name: input.name,
        Type: input.type as ParameterType,
        Value: input.value,
        Description: input.description || undefined,
        Overwrite: overwrite,
      }),
    );
    return Version ?? 1;
  }

  async deleteParameter(name: string): Promise<void> {
    await this.ssm.send(new DeleteParameterCommand({ Name: name }));
  }
}
