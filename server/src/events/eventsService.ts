import {
  CreateEventBusCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  ListEventBusesCommand,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  type EventBridgeClient,
} from '@aws-sdk/client-eventbridge';
import type { DeliveryPermissions } from '../permissions/deliveryPermissions.js';

export const DEFAULT_BUS = 'default';

export interface BusSummary {
  name: string;
  arn: string;
}

export interface RuleDefinition {
  name: string;
  bus: string;
  description: string;
  eventPattern: string | null;
  scheduleExpression: string | null;
  state: 'ENABLED' | 'DISABLED';
}

export interface RuleTarget {
  id: string;
  arn: string;
  input: string | null;
}

export interface RuleSummary extends RuleDefinition {
  arn: string;
}

export interface OutgoingEvent {
  source: string;
  detailType: string;
  detail: string;
  bus: string;
}

export class EventsService {
  constructor(
    private readonly events: EventBridgeClient,
    private readonly permissions: DeliveryPermissions,
  ) {}

  async listBuses(): Promise<BusSummary[]> {
    const buses: BusSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.events.send(new ListEventBusesCommand({ NextToken: token }));
      for (const b of page.EventBuses ?? []) if (b.Name) buses.push({ name: b.Name, arn: b.Arn ?? '' });
      token = page.NextToken;
    } while (token);
    return buses;
  }

  async createBus(name: string): Promise<void> {
    await this.events.send(new CreateEventBusCommand({ Name: name }));
  }

  async deleteBus(name: string): Promise<void> {
    await this.events.send(new DeleteEventBusCommand({ Name: name }));
  }

  async listRules(bus: string): Promise<RuleSummary[]> {
    const rules: RuleSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.events.send(new ListRulesCommand({ EventBusName: bus, NextToken: token }));
      for (const r of page.Rules ?? []) {
        if (!r.Name) continue;
        rules.push({
          name: r.Name,
          arn: r.Arn ?? '',
          bus,
          description: r.Description ?? '',
          eventPattern: r.EventPattern ?? null,
          scheduleExpression: r.ScheduleExpression ?? null,
          state: r.State === 'DISABLED' ? 'DISABLED' : 'ENABLED',
        });
      }
      token = page.NextToken;
    } while (token);
    return rules;
  }

  async listTargets(bus: string, rule: string): Promise<RuleTarget[]> {
    const { Targets = [] } = await this.events.send(new ListTargetsByRuleCommand({ EventBusName: bus, Rule: rule }));
    return Targets.map((t) => ({ id: t.Id ?? '', arn: t.Arn ?? '', input: t.Input ?? null }));
  }

  async getRule(bus: string, name: string) {
    const r = await this.events.send(new DescribeRuleCommand({ EventBusName: bus, Name: name }));
    return {
      rule: {
        name,
        arn: r.Arn ?? '',
        bus,
        description: r.Description ?? '',
        eventPattern: r.EventPattern ?? null,
        scheduleExpression: r.ScheduleExpression ?? null,
        state: r.State === 'DISABLED' ? 'DISABLED' : 'ENABLED',
      } satisfies RuleSummary,
      targets: await this.listTargets(bus, name),
    };
  }

  async putRule(rule: RuleDefinition): Promise<void> {
    await this.events.send(
      new PutRuleCommand({
        Name: rule.name,
        EventBusName: rule.bus,
        Description: rule.description || undefined,
        EventPattern: rule.eventPattern ?? undefined,
        ScheduleExpression: rule.scheduleExpression ?? undefined,
        State: rule.state,
      }),
    );
  }

  async putTargets(bus: string, rule: string, targets: readonly RuleTarget[]): Promise<void> {
    if (targets.length === 0) return;
    const { Arn: ruleArn } = await this.events.send(new DescribeRuleCommand({ EventBusName: bus, Name: rule }));
    // Como no console: a fila ou função passa a aceitar eventos desta regra.
    if (ruleArn) for (const t of targets) await this.permissions.allow(t.arn, 'events.amazonaws.com', ruleArn);
    const result = await this.events.send(
      new PutTargetsCommand({
        EventBusName: bus,
        Rule: rule,
        Targets: targets.map((t) => ({ Id: t.id, Arn: t.arn, Input: t.input ?? undefined })),
      }),
    );
    const failure = result.FailedEntries?.[0];
    if (failure) throw new Error(`Destino ${failure.TargetId} recusado: ${failure.ErrorMessage ?? failure.ErrorCode}`);
  }

  async removeTargets(bus: string, rule: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.events.send(new RemoveTargetsCommand({ EventBusName: bus, Rule: rule, Ids: [...ids] }));
  }

  /** Como na AWS, a regra só pode ser excluída depois de perder os destinos. */
  async deleteRule(bus: string, name: string): Promise<void> {
    const targets = await this.listTargets(bus, name);
    await this.removeTargets(bus, name, targets.map((t) => t.id));
    await this.events.send(new DeleteRuleCommand({ EventBusName: bus, Name: name }));
  }

  async setEnabled(bus: string, name: string, enabled: boolean): Promise<void> {
    const command = enabled
      ? new EnableRuleCommand({ EventBusName: bus, Name: name })
      : new DisableRuleCommand({ EventBusName: bus, Name: name });
    await this.events.send(command);
  }

  async putEvents(events: readonly OutgoingEvent[]) {
    const result = await this.events.send(
      new PutEventsCommand({
        Entries: events.map((e) => ({ Source: e.source, DetailType: e.detailType, Detail: e.detail, EventBusName: e.bus })),
      }),
    );
    return {
      failed: result.FailedEntryCount ?? 0,
      entries: (result.Entries ?? []).map((e) => ({ eventId: e.EventId ?? null, error: e.ErrorMessage ?? null })),
    };
  }
}
