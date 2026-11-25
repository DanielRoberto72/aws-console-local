/** Limites do SQS para os campos do formulário de criação. */
export const QUEUE_LIMITS = {
  visibilityTimeout: { min: 0, max: 43_200, default: 30 },
  messageRetentionPeriod: { min: 60, max: 1_209_600, default: 345_600 },
  delaySeconds: { min: 0, max: 900, default: 0 },
} as const;

export function validateQueueName(name: string, fifo: boolean): string | null {
  const base = fifo ? name.replace(/\.fifo$/, '') : name;
  if (!name) return 'Informe o nome da fila.';
  if (fifo && !name.endsWith('.fifo')) return 'O nome de uma fila FIFO deve terminar com ".fifo".';
  if (!fifo && name.endsWith('.fifo')) return 'Só filas FIFO podem terminar com ".fifo".';
  if (name.length > 80) return 'O nome pode ter no máximo 80 caracteres.';
  if (!/^[a-zA-Z0-9_-]+$/.test(base)) return 'Use apenas letras, números, hifens (-) e sublinhados (_).';
  return null;
}

/** Valida um campo numérico em segundos; devolve o número ou uma mensagem de erro. */
export function parseSeconds(text: string, limits: { min: number; max: number }): number | string {
  if (!/^\d+$/.test(text.trim())) return 'Informe um número inteiro de segundos.';
  const value = Number(text);
  if (value < limits.min || value > limits.max) return `Use um valor entre ${limits.min} e ${limits.max} segundos.`;
  return value;
}
