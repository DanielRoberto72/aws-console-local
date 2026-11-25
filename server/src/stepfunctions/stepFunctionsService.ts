import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  DescribeStateMachineCommand,
  GetExecutionHistoryCommand,
  ListExecutionsCommand,
  ListStateMachinesCommand,
  StartExecutionCommand,
  StopExecutionCommand,
  UpdateStateMachineCommand,
  type SFNClient,
  type StateMachineType,
} from '@aws-sdk/client-sfn';
import { NotFoundError } from '../http/errors.js';

export interface StateMachineDefinition {
  name: string;
  type: 'STANDARD' | 'EXPRESS';
  definition: string;
  roleArn: string;
}


const iso = (d: Date | undefined) => d?.toISOString() ?? null;

export class StepFunctionsService {
  constructor(
    private readonly sfn: SFNClient,
    /** Papel criado pelo painel quando o usuário não informa um. */
    private readonly defaultRole: () => Promise<string>,
  ) {}

  async listStateMachines() {
    const machines: { name: string; arn: string; type: string; createdAt: string | null }[] = [];
    let token: string | undefined;
    do {
      const page = await this.sfn.send(new ListStateMachinesCommand({ nextToken: token }));
      for (const m of page.stateMachines ?? []) {
        if (m.name && m.stateMachineArn) machines.push({ name: m.name, arn: m.stateMachineArn, type: m.type ?? 'STANDARD', createdAt: iso(m.creationDate) });
      }
      token = page.nextToken;
    } while (token);
    return machines;
  }

  async arnOf(name: string): Promise<string> {
    const machine = (await this.listStateMachines()).find((m) => m.name === name);
    if (!machine) throw new NotFoundError(`Máquina de estado ${name} não encontrada.`);
    return machine.arn;
  }

  async describe(name: string) {
    const arn = await this.arnOf(name);
    const m = await this.sfn.send(new DescribeStateMachineCommand({ stateMachineArn: arn }));
    return {
      name,
      arn,
      type: (m.type ?? 'STANDARD') as StateMachineDefinition['type'],
      definition: m.definition ?? '',
      roleArn: m.roleArn ?? '',
      status: m.status ?? null,
      createdAt: iso(m.creationDate),
    };
  }

  async create(machine: StateMachineDefinition): Promise<string> {
    const { stateMachineArn } = await this.sfn.send(
      new CreateStateMachineCommand({
        name: machine.name,
        type: machine.type as StateMachineType,
        definition: machine.definition,
        roleArn: machine.roleArn || (await this.defaultRole()),
      }),
    );
    return stateMachineArn ?? '';
  }

  async update(name: string, definition: string, roleArn: string): Promise<void> {
    await this.sfn.send(
      new UpdateStateMachineCommand({ stateMachineArn: await this.arnOf(name), definition, roleArn: roleArn || undefined }),
    );
  }

  async delete(name: string): Promise<void> {
    await this.sfn.send(new DeleteStateMachineCommand({ stateMachineArn: await this.arnOf(name) }));
  }

  async start(name: string, input: string, executionName?: string): Promise<string> {
    const { executionArn } = await this.sfn.send(
      new StartExecutionCommand({ stateMachineArn: await this.arnOf(name), input, name: executionName }),
    );
    return executionArn ?? '';
  }

  async listExecutions(name: string) {
    const { executions = [] } = await this.sfn.send(
      new ListExecutionsCommand({ stateMachineArn: await this.arnOf(name), maxResults: 100 }),
    );
    return executions.map((e) => ({
      arn: e.executionArn ?? '',
      name: e.name ?? '',
      status: e.status ?? 'UNKNOWN',
      startedAt: iso(e.startDate),
      stoppedAt: iso(e.stopDate),
    }));
  }

  async describeExecution(arn: string) {
    const [e, history] = await Promise.all([
      this.sfn.send(new DescribeExecutionCommand({ executionArn: arn })),
      this.sfn.send(new GetExecutionHistoryCommand({ executionArn: arn, maxResults: 500 })),
    ]);
    return {
      arn,
      name: e.name ?? '',
      status: e.status ?? 'UNKNOWN',
      input: e.input ?? null,
      output: e.output ?? null,
      error: e.error ?? null,
      cause: e.cause ?? null,
      startedAt: iso(e.startDate),
      stoppedAt: iso(e.stopDate),
      events: (history.events ?? []).map((event) => {
        // Cada tipo de evento traz seus detalhes num campo próprio (ex.: taskStateEnteredEventDetails).
        const { id, previousEventId: _prev, timestamp, type, ...details } = event;
        const detail = Object.values(details).find((v) => typeof v === 'object' && v !== null) ?? null;
        return { id: id ?? 0, type: type ?? '', timestamp: iso(timestamp), detail };
      }),
    };
  }

  async stopExecution(arn: string): Promise<void> {
    await this.sfn.send(new StopExecutionCommand({ executionArn: arn }));
  }
}
