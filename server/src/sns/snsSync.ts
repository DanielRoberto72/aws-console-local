import type { Queryable } from '../db/pool.js';
import type { ResourceStore, StoredResource } from '../db/resourceStore.js';
import type { SyncAdapter } from '../sync/syncAdapter.js';
import type { SnsService } from './snsService.js';

/** Atributos de tópico que podem ser definidos na criação. */
const TOPIC_ATTRIBUTES = ['DisplayName', 'FifoTopic', 'ContentBasedDeduplication', 'Policy', 'DeliveryPolicy', 'KmsMasterKeyId'];
/** Atributos de assinatura que podem ser definidos ao assinar. */
const SUBSCRIPTION_ATTRIBUTES = ['RawMessageDelivery', 'FilterPolicy', 'FilterPolicyScope', 'RedrivePolicy', 'DeliveryPolicy'];

const pick = (source: Record<string, string>, names: string[]) =>
  Object.fromEntries(names.filter((n) => source[n] !== undefined).map((n) => [n, source[n]!]));

interface SavedSubscription {
  topic: string;
  protocol: string;
  endpoint: string;
  attributes: Record<string, string>;
}

/**
 * Tópicos são gravados antes das assinaturas; como os ARNs são determinísticos
 * (conta e região fixas), as assinaturas apontam para os mesmos destinos ao restaurar.
 */
export class SnsSync implements SyncAdapter {
  readonly service = 'sns' as const;

  constructor(
    private readonly sns: SnsService,
    private readonly store: ResourceStore,
  ) {}

  async snapshot(tx: Queryable): Promise<void> {
    const topics: StoredResource[] = [];
    const subscriptions: StoredResource<SavedSubscription>[] = [];
    for (const arn of await this.sns.listTopicArns()) {
      const topic = arn.slice(arn.lastIndexOf(':') + 1);
      topics.push({ type: 'topic', name: topic, data: pick(await this.sns.topicAttributes(arn), TOPIC_ATTRIBUTES) });
      for (const s of await this.sns.listSubscriptions(arn)) {
        if (s.pending) continue;
        subscriptions.push({
          type: 'subscription',
          name: `${topic}|${s.protocol}|${s.endpoint}`,
          data: { topic, protocol: s.protocol, endpoint: s.endpoint, attributes: pick(s.attributes, SUBSCRIPTION_ATTRIBUTES) },
        });
      }
    }
    await this.store.replace(tx, 'sns', [...topics, ...subscriptions]);
  }

  async restore(db: Queryable): Promise<void> {
    const arns = new Map<string, string>();
    // CreateTopic é idempotente com os mesmos atributos.
    for (const { name, data } of await this.store.list<Record<string, string>>(db, 'sns', 'topic')) {
      arns.set(name, await this.sns.createTopic(name, data));
    }
    for (const { data } of await this.store.list<SavedSubscription>(db, 'sns', 'subscription')) {
      const topicArn = arns.get(data.topic);
      if (!topicArn) continue;
      await this.sns.subscribe(topicArn, {
        protocol: data.protocol,
        endpoint: data.endpoint,
        rawMessageDelivery: data.attributes.RawMessageDelivery === 'true',
        filterPolicy: data.attributes.FilterPolicy,
      });
    }
  }
}
