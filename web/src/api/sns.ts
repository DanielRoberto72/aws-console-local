import { encode, json, request } from './http';

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

export interface TopicDetail {
  name: string;
  arn: string;
  attributes: Record<string, string>;
  subscriptions: SubscriptionSummary[];
}

export interface NewSubscription {
  protocol: string;
  endpoint: string;
  rawMessageDelivery?: boolean;
  filterPolicy?: string;
}

const topicPath = (name: string) => `/api/sns/topics/${encode(name)}`;

export const snsApi = {
  topics: (signal?: AbortSignal) => request<{ topics: TopicSummary[] }>('/api/sns/topics', { signal }),
  createTopic: (topic: { name: string; fifo: boolean; displayName?: string; contentBasedDeduplication?: boolean }) =>
    request('/api/sns/topics', { method: 'POST', body: json(topic) }),
  topic: (name: string, signal?: AbortSignal) => request<TopicDetail>(topicPath(name), { signal }),
  deleteTopic: (name: string) => request(topicPath(name), { method: 'DELETE' }),
  subscribe: (name: string, subscription: NewSubscription) =>
    request(`${topicPath(name)}/subscriptions`, { method: 'POST', body: json(subscription) }),
  unsubscribe: (subscriptionArn: string) => request('/api/sns/unsubscribe', { method: 'POST', body: json({ subscriptionArn }) }),
  publish: (name: string, message: { message: string; subject?: string; groupId?: string; deduplicationId?: string }) =>
    request<{ messageId: string }>(`${topicPath(name)}/publish`, { method: 'POST', body: json(message) }),
};
