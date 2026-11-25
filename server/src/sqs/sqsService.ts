import {
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';

export type QueueAttributes = Record<string, string>;

export interface NewQueue {
  name: string;
  fifo: boolean;
  visibilityTimeout?: number;
  messageRetentionPeriod?: number;
  delaySeconds?: number;
  contentBasedDeduplication?: boolean;
}

export interface QueueSummary {
  name: string;
  url: string;
  type: 'Standard' | 'FIFO';
  messagesAvailable: number;
  messagesInFlight: number;
  messagesDelayed: number;
  createdAt: string | null;
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

export const queueNameFromUrl = (url: string) => url.slice(url.lastIndexOf('/') + 1);

const toCount = (value: string | undefined) => Number(value ?? 0) || 0;

export function summarizeQueue(url: string, attributes: QueueAttributes): QueueSummary {
  const created = Number(attributes.CreatedTimestamp);
  return {
    name: queueNameFromUrl(url),
    url,
    type: attributes.FifoQueue === 'true' ? 'FIFO' : 'Standard',
    messagesAvailable: toCount(attributes.ApproximateNumberOfMessages),
    messagesInFlight: toCount(attributes.ApproximateNumberOfMessagesNotVisible),
    messagesDelayed: toCount(attributes.ApproximateNumberOfMessagesDelayed),
    createdAt: Number.isFinite(created) && created > 0 ? new Date(created * 1000).toISOString() : null,
  };
}

export class SqsService {
  constructor(private readonly sqs: SQSClient) {}

  async listQueueUrls(): Promise<string[]> {
    const urls: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.sqs.send(new ListQueuesCommand({ NextToken: token, MaxResults: 1000 }));
      urls.push(...(page.QueueUrls ?? []));
      token = page.NextToken;
    } while (token);
    return urls;
  }

  async attributes(url: string): Promise<QueueAttributes> {
    const { Attributes = {} } = await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['All'] }));
    return Attributes;
  }

  async listQueues(): Promise<QueueSummary[]> {
    const urls = await this.listQueueUrls();
    return Promise.all(urls.map(async (url) => summarizeQueue(url, await this.attributes(url))));
  }

  async urlOf(name: string): Promise<string> {
    const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: name }));
    if (!QueueUrl) throw new Error(`Fila ${name} sem URL`);
    return QueueUrl;
  }

  async getQueue(name: string): Promise<{ summary: QueueSummary; attributes: QueueAttributes }> {
    const url = await this.urlOf(name);
    const attributes = await this.attributes(url);
    return { summary: summarizeQueue(url, attributes), attributes };
  }

  async createQueue(queue: NewQueue): Promise<string> {
    const attributes: QueueAttributes = {};
    if (queue.fifo) attributes.FifoQueue = 'true';
    if (queue.fifo && queue.contentBasedDeduplication) attributes.ContentBasedDeduplication = 'true';
    if (queue.visibilityTimeout !== undefined) attributes.VisibilityTimeout = String(queue.visibilityTimeout);
    if (queue.messageRetentionPeriod !== undefined) attributes.MessageRetentionPeriod = String(queue.messageRetentionPeriod);
    if (queue.delaySeconds !== undefined) attributes.DelaySeconds = String(queue.delaySeconds);
    return this.createQueueWith(queue.name, attributes);
  }

  async createQueueWith(name: string, attributes: QueueAttributes): Promise<string> {
    const { QueueUrl } = await this.sqs.send(new CreateQueueCommand({ QueueName: name, Attributes: attributes }));
    if (!QueueUrl) throw new Error(`Fila ${name} criada sem URL`);
    return QueueUrl;
  }

  async setAttributes(name: string, attributes: QueueAttributes): Promise<void> {
    await this.sqs.send(new SetQueueAttributesCommand({ QueueUrl: await this.urlOf(name), Attributes: attributes }));
  }

  async deleteQueue(name: string): Promise<void> {
    await this.sqs.send(new DeleteQueueCommand({ QueueUrl: await this.urlOf(name) }));
  }

  async purge(name: string): Promise<void> {
    await this.sqs.send(new PurgeQueueCommand({ QueueUrl: await this.urlOf(name) }));
  }

  async send(name: string, message: OutgoingMessage): Promise<string> {
    const { MessageId } = await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: await this.urlOf(name),
        MessageBody: message.body,
        MessageGroupId: message.groupId,
        MessageDeduplicationId: message.deduplicationId,
        DelaySeconds: message.delaySeconds,
      }),
    );
    return MessageId ?? '';
  }

  /** Como no console, receber não exclui: as mensagens ficam invisíveis até o timeout. */
  async receive(name: string, maxMessages: number, waitSeconds: number): Promise<ReceivedMessage[]> {
    const { Messages = [] } = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: await this.urlOf(name),
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitSeconds,
        MessageSystemAttributeNames: ['All'],
      }),
    );
    return Messages.map((m) => {
      const sent = Number(m.Attributes?.SentTimestamp);
      return {
        messageId: m.MessageId ?? '',
        receiptHandle: m.ReceiptHandle ?? '',
        body: m.Body ?? '',
        receiveCount: Number(m.Attributes?.ApproximateReceiveCount ?? 0),
        sentAt: Number.isFinite(sent) && sent > 0 ? new Date(sent).toISOString() : null,
        groupId: m.Attributes?.MessageGroupId ?? null,
      };
    });
  }

  async deleteMessage(name: string, receiptHandle: string): Promise<void> {
    await this.sqs.send(new DeleteMessageCommand({ QueueUrl: await this.urlOf(name), ReceiptHandle: receiptHandle }));
  }
}
