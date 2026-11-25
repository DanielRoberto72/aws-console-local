import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetSubscriptionAttributesCommand,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  ListTopicsCommand,
  PublishCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  type SNSClient,
} from '@aws-sdk/client-sns';
import { NotFoundError } from '../http/errors.js';
import type { DeliveryPermissions } from '../permissions/deliveryPermissions.js';

export interface TopicSummary {
  name: string;
  arn: string;
  type: 'Standard' | 'FIFO';
  displayName: string;
  subscriptionsConfirmed: number;
  subscriptionsPending: number;
}

export interface SubscriptionSummary {
  arn: string;
  protocol: string;
  endpoint: string;
  pending: boolean;
  attributes: Record<string, string>;
}

export interface NewSubscription {
  protocol: string;
  endpoint: string;
  rawMessageDelivery?: boolean;
  filterPolicy?: string;
}

export const topicNameFromArn = (arn: string) => arn.slice(arn.lastIndexOf(':') + 1);

/** Assinaturas não confirmadas (ex.: e-mail) não têm ARN real. */
const isPending = (arn: string | undefined) => !arn || !arn.startsWith('arn:');

export class SnsService {
  constructor(
    private readonly sns: SNSClient,
    private readonly permissions: DeliveryPermissions,
  ) {}

  async listTopicArns(): Promise<string[]> {
    const arns: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.sns.send(new ListTopicsCommand({ NextToken: token }));
      for (const t of page.Topics ?? []) if (t.TopicArn) arns.push(t.TopicArn);
      token = page.NextToken;
    } while (token);
    return arns;
  }

  async topicAttributes(arn: string): Promise<Record<string, string>> {
    const { Attributes = {} } = await this.sns.send(new GetTopicAttributesCommand({ TopicArn: arn }));
    return Attributes;
  }

  async listTopics(): Promise<TopicSummary[]> {
    const arns = await this.listTopicArns();
    return Promise.all(
      arns.map(async (arn) => {
        const a = await this.topicAttributes(arn);
        return {
          name: topicNameFromArn(arn),
          arn,
          type: a.FifoTopic === 'true' ? 'FIFO' : 'Standard',
          displayName: a.DisplayName ?? '',
          subscriptionsConfirmed: Number(a.SubscriptionsConfirmed ?? 0),
          subscriptionsPending: Number(a.SubscriptionsPending ?? 0),
        } satisfies TopicSummary;
      }),
    );
  }

  async arnOf(name: string): Promise<string> {
    const arn = (await this.listTopicArns()).find((a) => topicNameFromArn(a) === name);
    if (!arn) throw new NotFoundError(`Tópico ${name} não encontrado.`);
    return arn;
  }

  async createTopic(name: string, attributes: Record<string, string>): Promise<string> {
    const { TopicArn } = await this.sns.send(new CreateTopicCommand({ Name: name, Attributes: attributes }));
    return TopicArn ?? '';
  }

  async deleteTopic(name: string): Promise<void> {
    await this.sns.send(new DeleteTopicCommand({ TopicArn: await this.arnOf(name) }));
  }

  async listSubscriptions(topicArn: string): Promise<SubscriptionSummary[]> {
    const subscriptions: SubscriptionSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn, NextToken: token }));
      for (const s of page.Subscriptions ?? []) {
        const pending = isPending(s.SubscriptionArn);
        const attributes = pending
          ? {}
          : ((await this.sns.send(new GetSubscriptionAttributesCommand({ SubscriptionArn: s.SubscriptionArn }))).Attributes ?? {});
        subscriptions.push({ arn: s.SubscriptionArn ?? '', protocol: s.Protocol ?? '', endpoint: s.Endpoint ?? '', pending, attributes });
      }
      token = page.NextToken;
    } while (token);
    return subscriptions;
  }

  async getTopic(name: string) {
    const arn = await this.arnOf(name);
    const [attributes, subscriptions] = await Promise.all([this.topicAttributes(arn), this.listSubscriptions(arn)]);
    return { name, arn, attributes, subscriptions };
  }

  async subscribe(topicArn: string, subscription: NewSubscription): Promise<string> {
    const attributes: Record<string, string> = {};
    if (subscription.rawMessageDelivery) attributes.RawMessageDelivery = 'true';
    if (subscription.filterPolicy) attributes.FilterPolicy = subscription.filterPolicy;
    // Como no console: a fila ou função passa a aceitar mensagens deste tópico.
    await this.permissions.allow(subscription.endpoint, 'sns.amazonaws.com', topicArn);
    const { SubscriptionArn } = await this.sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: subscription.protocol,
        Endpoint: subscription.endpoint,
        Attributes: attributes,
        ReturnSubscriptionArn: true,
      }),
    );
    return SubscriptionArn ?? '';
  }

  async unsubscribe(subscriptionArn: string): Promise<void> {
    await this.sns.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
  }

  async publish(name: string, message: { message: string; subject?: string; groupId?: string; deduplicationId?: string }): Promise<string> {
    const { MessageId } = await this.sns.send(
      new PublishCommand({
        TopicArn: await this.arnOf(name),
        Message: message.message,
        Subject: message.subject,
        MessageGroupId: message.groupId,
        MessageDeduplicationId: message.deduplicationId,
      }),
    );
    return MessageId ?? '';
  }
}
