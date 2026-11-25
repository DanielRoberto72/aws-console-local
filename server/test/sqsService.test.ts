import { describe, expect, it } from 'vitest';
import { queueNameFromUrl, summarizeQueue } from '../src/sqs/sqsService.js';

describe('summarizeQueue', () => {
  it('extrai tipo, contadores e data de criação dos atributos', () => {
    const url = 'https://127.0.0.1:9297/000000000000/pedidos.fifo';
    expect(
      summarizeQueue(url, {
        FifoQueue: 'true',
        ApproximateNumberOfMessages: '3',
        ApproximateNumberOfMessagesNotVisible: '1',
        CreatedTimestamp: '1700000000',
      }),
    ).toEqual({
      name: 'pedidos.fifo',
      url,
      type: 'FIFO',
      messagesAvailable: 3,
      messagesInFlight: 1,
      messagesDelayed: 0,
      createdAt: '2023-11-14T22:13:20.000Z',
    });
  });

  it('assume fila padrão e zero mensagens sem atributos', () => {
    expect(summarizeQueue('http://x/0/q', {})).toMatchObject({ type: 'Standard', messagesAvailable: 0, createdAt: null });
    expect(queueNameFromUrl('http://x/0/q')).toBe('q');
  });
});
