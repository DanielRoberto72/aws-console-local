import { describe, expect, it } from 'vitest';
import { SCHEDULE_EXPRESSION } from '../src/scheduler/routes.js';

describe('expressão do EventBridge Scheduler', () => {
  it.each(['at(2026-12-01T09:00:00)', 'rate(5 minutes)', 'rate(1 day)', 'cron(0 12 * * ? *)'])('aceita %s', (expression) => {
    expect(SCHEDULE_EXPRESSION.test(expression)).toBe(true);
  });

  it.each(['rate(5 minutos)', 'at(2026-12-01 09:00)', 'todo dia', 'rate()'])('recusa %s', (expression) => {
    expect(SCHEDULE_EXPRESSION.test(expression)).toBe(false);
  });
});
