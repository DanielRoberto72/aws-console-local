/** Inteiro dentro dos limites; devolve o número ou a mensagem de erro. */
export function parseIntInRange(text: string, min: number, max: number, unit: string): number | string {
  if (!/^\d+$/.test(text.trim())) return `Informe um número inteiro de ${unit}.`;
  const value = Number(text);
  if (value < min || value > max) return `Use um valor entre ${min} e ${max} ${unit}.`;
  return value;
}
