import { encode, json, request } from './http';

export interface QueueSummary {
  name: string;
  url: string;
  type: 'Standard' | 'FIFO';
  messagesAvailable: number;
  messagesInFlight: number;
  messagesDelayed: number;
  createdAt: string | null;
}

export interface NewQueue {
  name: string;
  fifo: boolean;
  visibilityTimeout?: number;
  messageRetentionPeriod?: number;
  delaySeconds?: number;
  contentBasedDeduplication?: boolean;
}

export interface OutgoingMessage {
  body: string;
  groupId?: string;
  deduplicationId?: string;
  delaySeconds?: number;
}

export interface ReceivedMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
  receiveCount: number;
  sentAt: string | null;
  groupId: string | null;
}

const queuePath = (queue: string) => `/api/sqs/queues/${encode(queue)}`;

export const sqsApi = {
  listQueues: (signal?: AbortSignal) => request<{ queues: QueueSummary[] }>('/api/sqs/queues', { signal }),
  createQueue: (queue: NewQueue) => request<{ url: string }>('/api/sqs/queues', { method: 'POST', body: json(queue) }),
  getQueue: (queue: string, signal?: AbortSignal) =>
    request<{ summary: QueueSummary; attributes: Record<string, string> }>(queuePath(queue), { signal }),
  deleteQueue: (queue: string) => request(queuePath(queue), { method: 'DELETE' }),
  purge: (queue: string) => request(`${queuePath(queue)}/purge`, { method: 'POST' }),
  send: (queue: string, message: OutgoingMessage) =>
    request<{ messageId: string }>(`${queuePath(queue)}/messages`, { method: 'POST', body: json(message) }),
  receive: (queue: string, waitSeconds: number) =>
    request<{ messages: ReceivedMessage[] }>(`${queuePath(queue)}/receive`, {
      method: 'POST',
      body: json({ maxMessages: 10, waitSeconds }),
    }),
  deleteMessage: (queue: string, receiptHandle: string) =>
    request(`${queuePath(queue)}/delete-message`, { method: 'POST', body: json({ receiptHandle }) }),
};
