const AT = /^at\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)$/;
const RATE = /^rate\(\d+ (minute|minutes|hour|hours|day|days)\)$/;
const CRON = /^cron\(\S+( \S+){5}\)$/;

/** Valida a expressão conforme o tipo de agendamento; null quando válida. */
export function scheduleExpressionError(expression: string, kind: 'recurring' | 'once'): string | null {
  if (kind === 'once') return AT.test(expression) ? null : 'Use at(aaaa-mm-ddThh:mm:ss).';
  if (RATE.test(expression) || CRON.test(expression)) return null;
  return 'Use rate(N minutes|hours|days) ou cron(min hora dia mês dia-da-semana ano).';
}
