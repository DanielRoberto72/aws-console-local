import type { Agent } from 'node:https';
import {
  AddPermissionCommand,
  CreateFunctionCommand,
  GetPolicyCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
  ListFunctionsCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
  type FunctionConfiguration,
  type LambdaClient,
  type Runtime,
} from '@aws-sdk/client-lambda';
import { downloadFromEmulator } from '../aws/emulatorDownload.js';
import { readEditableSources, zipSources, type SourceFile } from './codeArchive.js';

export interface FunctionSummary {
  name: string;
  arn: string;
  runtime: string | null;
  handler: string | null;
  memorySize: number | null;
  timeout: number | null;
  codeSize: number;
  lastModified: string | null;
  state: string | null;
  description: string;
}

export interface FunctionSettings {
  handler: string;
  runtime: string;
  role: string;
  memorySize: number;
  timeout: number;
  description: string;
  environment: Record<string, string>;
}

export type FunctionCode = { files: SourceFile[] } | { zipBase64: string };

export interface InvocationResult {
  statusCode: number;
  functionError: string | null;
  payload: string;
  logs: string;
  durationMs: number;
}

/** Permissão de invocação concedida a um serviço (ex.: SNS, EventBridge). */
export interface InvokePermission {
  sid: string;
  principal: string;
  sourceArn: string | null;
}

export function summarizeFunction(f: FunctionConfiguration): FunctionSummary {
  return {
    name: f.FunctionName ?? '',
    arn: f.FunctionArn ?? '',
    runtime: f.Runtime ?? null,
    handler: f.Handler ?? null,
    memorySize: f.MemorySize ?? null,
    timeout: f.Timeout ?? null,
    codeSize: f.CodeSize ?? 0,
    lastModified: f.LastModified ? new Date(f.LastModified).toISOString() : null,
    state: f.State ?? null,
    description: f.Description ?? '',
  };
}

function toZip(code: FunctionCode): Uint8Array {
  return 'files' in code ? zipSources(code.files) : Buffer.from(code.zipBase64, 'base64');
}

export class LambdaService {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly endpoint: string,
    private readonly agent: Agent,
    /** Papel criado pelo painel quando o usuário não informa um. */
    private readonly defaultRole: () => Promise<string>,
  ) {}

  async listConfigurations(): Promise<FunctionConfiguration[]> {
    const functions: FunctionConfiguration[] = [];
    let marker: string | undefined;
    do {
      const page = await this.lambda.send(new ListFunctionsCommand({ Marker: marker }));
      functions.push(...(page.Functions ?? []));
      marker = page.NextMarker;
    } while (marker);
    return functions;
  }

  async listFunctions(): Promise<FunctionSummary[]> {
    return (await this.listConfigurations()).map(summarizeFunction);
  }

  async getFunction(name: string) {
    const result = await this.lambda.send(new GetFunctionCommand({ FunctionName: name }));
    const config = result.Configuration ?? {};
    let code: ReturnType<typeof readEditableSources> = { files: [], skipped: [] };
    if (result.Code?.Location) code = readEditableSources(await this.downloadCode(result.Code.Location));
    return {
      summary: summarizeFunction(config),
      role: config.Role ?? '',
      environment: config.Environment?.Variables ?? {},
      logGroup: config.LoggingConfig?.LogGroup ?? `/aws/lambda/${name}`,
      codeSha256: config.CodeSha256 ?? null,
      files: code.files,
      skippedFiles: code.skipped,
    };
  }

  async getConfigurationAndCodeLocation(name: string) {
    const result = await this.lambda.send(new GetFunctionCommand({ FunctionName: name }));
    return { config: result.Configuration ?? {}, location: result.Code?.Location };
  }

  downloadCode(location: string): Promise<Buffer> {
    return downloadFromEmulator(location, this.endpoint, this.agent);
  }

  async createFunction(name: string, settings: FunctionSettings, code: FunctionCode): Promise<void> {
    const role = settings.role || (await this.defaultRole());
    await this.createFromZip(name, { ...settings, role }, toZip(code));
  }

  async createFromZip(name: string, settings: FunctionSettings, zip: Uint8Array): Promise<void> {
    await this.lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: settings.runtime as Runtime,
        Handler: settings.handler,
        Role: settings.role,
        MemorySize: settings.memorySize,
        Timeout: settings.timeout,
        Description: settings.description,
        Environment: { Variables: settings.environment },
        Code: { ZipFile: zip },
      }),
    );
    await waitUntilFunctionActiveV2({ client: this.lambda, maxWaitTime: 60, minDelay: 1, maxDelay: 2 }, { FunctionName: name });
  }

  async updateCode(name: string, code: FunctionCode): Promise<void> {
    await this.lambda.send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile: toZip(code) }));
    await waitUntilFunctionUpdatedV2({ client: this.lambda, maxWaitTime: 60, minDelay: 1, maxDelay: 2 }, { FunctionName: name });
  }

  async updateConfiguration(name: string, settings: Omit<FunctionSettings, 'runtime' | 'role'> & { role?: string }): Promise<void> {
    await this.lambda.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: name,
        Handler: settings.handler,
        MemorySize: settings.memorySize,
        Timeout: settings.timeout,
        Description: settings.description,
        Environment: { Variables: settings.environment },
        ...(settings.role ? { Role: settings.role } : {}),
      }),
    );
    await waitUntilFunctionUpdatedV2({ client: this.lambda, maxWaitTime: 60, minDelay: 1, maxDelay: 2 }, { FunctionName: name });
  }

  async deleteFunction(name: string): Promise<void> {
    await this.lambda.send(new DeleteFunctionCommand({ FunctionName: name }));
  }

  /** Permissões de serviços sobre a função; só as concedidas a serviços são consideradas. */
  async invokePermissions(name: string): Promise<InvokePermission[]> {
    try {
      const { Policy } = await this.lambda.send(new GetPolicyCommand({ FunctionName: name }));
      const statements = (JSON.parse(Policy ?? '{}').Statement ?? []) as Record<string, any>[];
      return statements.flatMap((s) => {
        const principal = s.Principal?.Service;
        if (typeof principal !== 'string') return [];
        const sourceArn = s.Condition?.ArnLike?.['AWS:SourceArn'] ?? s.Condition?.ArnEquals?.['AWS:SourceArn'] ?? null;
        return [{ sid: String(s.Sid), principal, sourceArn }];
      });
    } catch (err) {
      if ((err as Error).name === 'ResourceNotFoundException') return [];
      throw err;
    }
  }

  async addInvokePermission(name: string, permission: InvokePermission): Promise<void> {
    try {
      await this.lambda.send(
        new AddPermissionCommand({
          FunctionName: name,
          StatementId: permission.sid,
          Action: 'lambda:InvokeFunction',
          Principal: permission.principal,
          SourceArn: permission.sourceArn ?? undefined,
        }),
      );
    } catch (err) {
      if ((err as Error).name !== 'ResourceConflictException') throw err;
    }
  }

  async invoke(name: string, payload: string): Promise<InvocationResult> {
    const started = Date.now();
    const result = await this.lambda.send(
      new InvokeCommand({ FunctionName: name, Payload: Buffer.from(payload), LogType: 'Tail' }),
    );
    return {
      statusCode: result.StatusCode ?? 0,
      functionError: result.FunctionError ?? null,
      payload: result.Payload ? Buffer.from(result.Payload).toString('utf8') : '',
      logs: result.LogResult ? Buffer.from(result.LogResult, 'base64').toString('utf8') : '',
      durationMs: Date.now() - started,
    };
  }
}
