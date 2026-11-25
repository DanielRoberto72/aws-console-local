export type ParsedVector = { ok: true; values: number[] } | { ok: false; error: string };

/** Aceita "[0.1, 0.2]" ou "0.1, 0.2" e confere a dimensão esperada pelo índice. */
export function parseVector(text: string, dimension: number): ParsedVector {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Informe os valores do vetor.' };
  const body = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  const parts = body.split(/[\s,]+/).filter(Boolean);
  const values = parts.map(Number);
  const invalid = parts.find((_, i) => !Number.isFinite(values[i]));
  if (invalid !== undefined) return { ok: false, error: `Valor inválido: "${invalid}".` };
  if (values.length !== dimension) return { ok: false, error: `O índice tem dimensão ${dimension}; foram informados ${values.length} valores.` };
  return { ok: true, values };
}

/** Metadados opcionais: objeto JSON simples. */
export function parseMetadata(text: string): { ok: true; metadata: Record<string, unknown> | null } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, metadata: null };
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: 'Os metadados devem ser um objeto JSON.' };
    return { ok: true, metadata: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: `JSON inválido: ${(err as Error).message}` };
  }
}

export const formatVector = (values: number[], max = 8) =>
  `[${values.slice(0, max).map((v) => Number(v.toFixed(4))).join(', ')}${values.length > max ? ', …' : ''}]`;
