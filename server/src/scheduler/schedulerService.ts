import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  GetScheduleCommand,
  ListScheduleGroupsCommand,
  ListSchedulesCommand,
  UpdateScheduleCommand,
  type SchedulerClient,
} from '@aws-sdk/client-scheduler';

export const DEFAULT_GROUP = 'default';

export interface ScheduleDefinition {
  name: string;
  group: string;
  expression: string;
  timezone: string;
  description: string;
  targetArn: string;
  roleArn: string;
  input: string | null;
  state: 'ENABLED' | 'DISABLED';
}

export interface ScheduleSummary {
  name: string;
  group: string;
  state: string;
  targetArn: string;
  createdAt: string | null;
}


export class SchedulerService {
  constructor(
    private readonly scheduler: SchedulerClient,
    /** Papel criado pelo painel quando o usuário não informa um. */
    private readonly defaultRole: () => Promise<string>,
  ) {}

  async listGroups(): Promise<string[]> {
    const groups: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.scheduler.send(new ListScheduleGroupsCommand({ NextToken: token }));
      for (const g of page.ScheduleGroups ?? []) if (g.Name) groups.push(g.Name);
      token = page.NextToken;
    } while (token);
    return groups;
  }

  async createGroup(name: string): Promise<void> {
    await this.scheduler.send(new CreateScheduleGroupCommand({ Name: name }));
  }

  async deleteGroup(name: string): Promise<void> {
    await this.scheduler.send(new DeleteScheduleGroupCommand({ Name: name }));
  }

  async listSchedules(): Promise<ScheduleSummary[]> {
    const schedules: ScheduleSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.scheduler.send(new ListSchedulesCommand({ NextToken: token }));
      for (const s of page.Schedules ?? []) {
        if (!s.Name) continue;
        schedules.push({
          name: s.Name,
          group: s.GroupName ?? DEFAULT_GROUP,
          state: s.State ?? 'ENABLED',
          targetArn: s.Target?.Arn ?? '',
          createdAt: s.CreationDate?.toISOString() ?? null,
        });
      }
      token = page.NextToken;
    } while (token);
    return schedules;
  }

  async getSchedule(group: string, name: string): Promise<ScheduleDefinition & { arn: string; createdAt: string | null }> {
    const s = await this.scheduler.send(new GetScheduleCommand({ GroupName: group, Name: name }));
    return {
      name,
      group,
      arn: s.Arn ?? '',
      expression: s.ScheduleExpression ?? '',
      timezone: s.ScheduleExpressionTimezone ?? 'UTC',
      description: s.Description ?? '',
      targetArn: s.Target?.Arn ?? '',
      roleArn: s.Target?.RoleArn ?? '',
      input: s.Target?.Input ?? null,
      state: s.State === 'DISABLED' ? 'DISABLED' : 'ENABLED',
      createdAt: s.CreationDate?.toISOString() ?? null,
    };
  }

  private toInput(schedule: ScheduleDefinition) {
    return {
      Name: schedule.name,
      GroupName: schedule.group,
      ScheduleExpression: schedule.expression,
      ScheduleExpressionTimezone: schedule.timezone || undefined,
      Description: schedule.description || undefined,
      State: schedule.state,
      FlexibleTimeWindow: { Mode: 'OFF' as const },
      Target: { Arn: schedule.targetArn, RoleArn: schedule.roleArn, Input: schedule.input ?? undefined },
    };
  }

  async createSchedule(schedule: ScheduleDefinition): Promise<void> {
    const roleArn = schedule.roleArn || (await this.defaultRole());
    await this.scheduler.send(new CreateScheduleCommand(this.toInput({ ...schedule, roleArn })));
  }

  /** UpdateSchedule substitui o agendamento inteiro, então parte da definição atual. */
  async setState(group: string, name: string, state: 'ENABLED' | 'DISABLED'): Promise<void> {
    const current = await this.getSchedule(group, name);
    await this.scheduler.send(new UpdateScheduleCommand(this.toInput({ ...current, state })));
  }

  async deleteSchedule(group: string, name: string): Promise<void> {
    await this.scheduler.send(new DeleteScheduleCommand({ GroupName: group, Name: name }));
  }
}
