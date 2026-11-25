import type { AttributeValue } from '@aws-sdk/client-dynamodb';

/**
 * "DynamoDB JSON" no mesmo formato da AWS CLI: binários (B, BS) viram base64.
 * É o formato usado na API do painel e no banco, porque preserva tipos que JSON
 * comum perderia (sets, binários, números de alta precisão).
 */
export type WireAttributeValue =
  | { S: string }
  | { N: string }
  | { B: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { SS: string[] }
  | { NS: string[] }
  | { BS: string[] }
  | { L: WireAttributeValue[] }
  | { M: WireItem };

export type WireItem = Record<string, WireAttributeValue>;
export type Item = Record<string, AttributeValue>;

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));

export function valueToWire(value: AttributeValue): WireAttributeValue {
  if (value.S !== undefined) return { S: value.S };
  if (value.N !== undefined) return { N: value.N };
  if (value.B !== undefined) return { B: toBase64(value.B) };
  if (value.BOOL !== undefined) return { BOOL: value.BOOL };
  if (value.NULL !== undefined) return { NULL: true };
  if (value.SS !== undefined) return { SS: value.SS };
  if (value.NS !== undefined) return { NS: value.NS };
  if (value.BS !== undefined) return { BS: value.BS.map(toBase64) };
  if (value.L !== undefined) return { L: value.L.map(valueToWire) };
  if (value.M !== undefined) return { M: itemToWire(value.M) };
  throw new Error('Tipo de atributo do DynamoDB não suportado');
}

export function itemToWire(item: Item): WireItem {
  return Object.fromEntries(Object.entries(item).map(([name, value]) => [name, valueToWire(value)]));
}

/** Converte e valida um valor recebido de fora (entrada não confiável). */
export function valueFromWire(input: unknown, path: string): AttributeValue {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError(`${path}: esperado um objeto como {"S": "texto"}`);
  }
  const entries = Object.entries(input);
  const [entry] = entries;
  if (!entry || entries.length !== 1) throw new TypeError(`${path}: informe exatamente um tipo (S, N, B, BOOL, NULL, SS, NS, BS, L, M)`);
  const [type, raw] = entry;

  const expectStringArray = () => {
    if (!Array.isArray(raw) || raw.length === 0 || !raw.every((v) => typeof v === 'string')) {
      throw new TypeError(`${path}.${type}: esperado uma lista não vazia de strings`);
    }
    return raw as string[];
  };

  switch (type) {
    case 'S':
    case 'N':
    case 'B':
      if (typeof raw !== 'string') throw new TypeError(`${path}.${type}: esperado uma string`);
      if (type === 'B') return { B: fromBase64(raw) };
      return type === 'S' ? { S: raw } : { N: raw };
    case 'BOOL':
      if (typeof raw !== 'boolean') throw new TypeError(`${path}.BOOL: esperado true ou false`);
      return { BOOL: raw };
    case 'NULL':
      if (raw !== true) throw new TypeError(`${path}.NULL: esperado true`);
      return { NULL: true };
    case 'SS':
      return { SS: expectStringArray() };
    case 'NS':
      return { NS: expectStringArray() };
    case 'BS':
      return { BS: expectStringArray().map(fromBase64) };
    case 'L':
      if (!Array.isArray(raw)) throw new TypeError(`${path}.L: esperado uma lista`);
      return { L: raw.map((v, i) => valueFromWire(v, `${path}[${i}]`)) };
    case 'M':
      return { M: itemFromWire(raw, path) };
    default:
      throw new TypeError(`${path}: tipo desconhecido "${type}"`);
  }
}

export function itemFromWire(input: unknown, path = 'item'): Item {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError(`${path}: esperado um objeto com os atributos`);
  }
  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => [name, valueFromWire(value, `${path}.${name}`)]),
  );
}
