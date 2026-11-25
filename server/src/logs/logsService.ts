import {
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DeleteRetentionPolicyCommand,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  PutRetentionPolicyCommand,
  type CloudWatchLogsClient,
} from '@aws-sdk/client-cloudwatch-logs';

export interface LogGroupSummary {
  name: string;
  arn: string | null;
  retentionDays: number | null;
  storedBytes: number;
  createdAt: string | null;
}

export interface LogStreamSummary {
  name: string;
  lastEventAt: string | null;
  createdAt: string | null;
}

export interface LogEvent {
  timestamp: string | null;
  message: string;
}

const toIso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);

export class LogsService {
  constructor(private readonly logs: CloudWatchLogsClient) {}

  async listGroups(): Promise<LogGroupSummary[]> {
    const groups: LogGroupSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.logs.send(new DescribeLogGroupsCommand({ nextToken: token }));
      for (const g of page.logGroups ?? []) {
        if (!g.logGroupName) continue;
        groups.push({
          name: g.logGroupName,
          arn: g.arn ?? null,
          retentionDays: g.retentionInDays ?? null,
          storedBytes: g.storedBytes ?? 0,
          createdAt: toIso(g.creationTime),
        });
      }
      token = page.nextToken;
    } while (token);
    return groups;
  }

  async createGroup(name: string, retentionDays: number | null): Promise<void> {
    await this.logs.send(new CreateLogGroupCommand({ logGroupName: name }));
    if (retentionDays) await this.setRetention(name, retentionDays);
  }

  async setRetention(name: string, retentionDays: number | null): Promise<void> {
    if (retentionDays) await this.logs.send(new PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: retentionDays }));
    else await this.logs.send(new DeleteRetentionPolicyCommand({ logGroupName: name }));
  }

  async deleteGroup(name: string): Promise<void> {
    await this.logs.send(new DeleteLogGroupCommand({ logGroupName: name }));
  }

  async listStreams(group: string): Promise<LogStreamSummary[]> {
    const { logStreams = [] } = await this.logs.send(
      new DescribeLogStreamsCommand({ logGroupName: group, orderBy: 'LastEventTime', descending: true, limit: 50 }),
    );
    return logStreams.map((s) => ({
      name: s.logStreamName ?? '',
      lastEventAt: toIso(s.lastEventTimestamp),
      createdAt: toIso(s.creationTime),
    }));
  }

  async getEvents(group: string, stream: string): Promise<LogEvent[]> {
    const { events = [] } = await this.logs.send(
      new GetLogEventsCommand({ logGroupName: group, logStreamName: stream, startFromHead: false, limit: 500 }),
    );
    return events.map((e) => ({ timestamp: toIso(e.timestamp), message: e.message ?? '' }));
  }
}
