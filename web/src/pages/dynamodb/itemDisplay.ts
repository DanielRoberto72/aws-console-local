import type { WireItem } from '../../api/dynamodb';

const MAX_PREVIEW = 80;

const truncate = (text: string) => (text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW)}…` : text);

/** Valor compacto para a célula da tabela, a partir do DynamoDB JSON. */
export function displayValue(value: Record<string, unknown> | undefined): string {
  if (!value) return '';
  const [type, raw] = Object.entries(value)[0] ?? [];
  switch (type) {
    case 'S':
    case 'N':
      return truncate(String(raw));
    case 'BOOL':
      return raw ? 'true' : 'false';
    case 'NULL':
      return 'null';
    case 'B':
      return '(binário)';
    default:
      return truncate(JSON.stringify(raw));
  }
}

/** Colunas: chaves primeiro, depois os demais atributos em ordem alfabética. */
export function itemColumns(items: readonly WireItem[], keyAttributes: readonly string[]): string[] {
  const others = new Set<string>();
  for (const item of items) for (const name of Object.keys(item)) if (!keyAttributes.includes(name)) others.add(name);
  return [...keyAttributes, ...[...others].sort()];
}

/** Extrai a chave primária do item, usada para excluir e para identificar a linha. */
export function itemKey(item: WireItem, keyAttributes: readonly string[]): WireItem {
  return Object.fromEntries(keyAttributes.filter((name) => item[name]).map((name) => [name, item[name]!]));
}

export type ParsedItem = { ok: true; item: WireItem } | { ok: false; error: string };

/** Valida o texto do editor antes de enviar: JSON válido e com as chaves da tabela. */
export function parseItemText(text: string, keyAttributes: readonly string[]): ParsedItem {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `JSON inválido: ${(err as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'O item deve ser um objeto JSON.' };
  }
  const missing = keyAttributes.filter((name) => !(name in parsed));
  if (missing.length > 0) return { ok: false, error: `Atributo de chave ausente: ${missing.join(', ')}` };
  return { ok: true, item: parsed as WireItem };
}
