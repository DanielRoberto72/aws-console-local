import { gunzipSync, gzipSync } from 'node:zlib';
import { BadRequestError } from '../http/errors.js';
import type { Queryable } from '../db/pool.js';

/**
 * Arquivo de ambiente: cópia das tabelas que guardam o estado do emulador. Importá-lo
 * substitui o banco, e o emulador recriado a partir dele fica igual ao do arquivo.
 * Atividade, portas locais e notas de fidelidade são da máquina, não do ambiente.
 */
export const ENVIRONMENT_FORMAT = 'aws-console-local/environment';
export const ENVIRONMENT_FORMAT_VERSION = 1;

/** Limite do JSON descompactado; o arquivo inteiro é lido em memória. */
const MAX_JSON_BYTES = 1024 * 1024 * 1024;

type ColumnKind = 'text' | 'json' | 'binary' | 'timestamp' | 'integer';

interface Column {
  name: string;
  kind: ColumnKind;
  nullable?: boolean;
}

interface TableSpec {
  name: string;
  columns: readonly Column[];
  orderBy: string;
}

/** Na ordem de inserção: cada tabela depois daquelas que ela referencia. */
const TABLES: readonly TableSpec[] = [
  { name: 's3_buckets', columns: [{ name: 'name', kind: 'text' }, { name: 'created_at', kind: 'timestamp', nullable: true }], orderBy: 'name' },
  {
    name: 's3_objects',
    columns: [
      { name: 'bucket', kind: 'text' },
      { name: 'key', kind: 'text' },
      { name: 'etag', kind: 'text' },
      { name: 'size', kind: 'integer' },
      { name: 'content_type', kind: 'text', nullable: true },
      { name: 'last_modified', kind: 'timestamp', nullable: true },
      { name: 'body', kind: 'binary' },
    ],
    orderBy: 'bucket, key',
  },
  {
    name: 'dynamodb_tables',
    columns: [{ name: 'name', kind: 'text' }, { name: 'create_input', kind: 'json' }, { name: 'items_hash', kind: 'text' }],
    orderBy: 'name',
  },
  // A ordem dos itens e dos recursos é a de gravação, reaproveitada na restauração.
  { name: 'dynamodb_items', columns: [{ name: 'table_name', kind: 'text' }, { name: 'item', kind: 'json' }], orderBy: 'id' },
  { name: 'sqs_queues', columns: [{ name: 'name', kind: 'text' }, { name: 'attributes', kind: 'json' }], orderBy: 'name' },
  {
    name: 'stored_resources',
    columns: [
      { name: 'service', kind: 'text' },
      { name: 'type', kind: 'text' },
      { name: 'name', kind: 'text' },
      { name: 'data', kind: 'json' },
      { name: 'blob', kind: 'binary', nullable: true },
    ],
    orderBy: 'id',
  },
];

export type EnvironmentRow = Record<string, unknown>;

export interface EnvironmentFile {
  format: typeof ENVIRONMENT_FORMAT;
  formatVersion: typeof ENVIRONMENT_FORMAT_VERSION;
  exportedAt: string;
  emulatorVersion: string | null;
  /** Presentes nos modelos de laboratório. */
  title?: string;
  description?: string;
  tables: Record<string, EnvironmentRow[]>;
}

const invalid = (message: string) => new BadRequestError(`Arquivo de ambiente inválido: ${message}`, 'InvalidEnvironmentFile');

function encodeValue(column: Column, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (column.kind === 'binary') return (value as Buffer).toString('base64');
  if (column.kind === 'timestamp') return (value as Date).toISOString();
  if (column.kind === 'integer') return Number(value);
  return value;
}

/** Converte um valor do arquivo no parâmetro da consulta, validando o tipo. */
function decodeValue(table: string, column: Column, value: unknown): unknown {
  const where = `${table}.${column.name}`;
  if (value === null || value === undefined) {
    if (column.nullable) return null;
    throw invalid(`${where} é obrigatório`);
  }
  switch (column.kind) {
    case 'text':
      if (typeof value !== 'string') throw invalid(`${where} deve ser texto`);
      return value;
    case 'timestamp':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw invalid(`${where} deve ser uma data`);
      return value;
    case 'integer':
      if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(`${where} deve ser um inteiro`);
      return value;
    case 'binary':
      if (typeof value !== 'string') throw invalid(`${where} deve estar em base64`);
      return Buffer.from(value, 'base64');
    case 'json':
      return JSON.stringify(value);
  }
}

/** Valida as linhas do arquivo e devolve os parâmetros de inserção, tabela por tabela. */
export function decodeTables(tables: unknown): { table: TableSpec; params: unknown[][] }[] {
  if (typeof tables !== 'object' || tables === null || Array.isArray(tables)) throw invalid('"tables" deve ser um objeto');
  const known = new Set(TABLES.map((t) => t.name));
  const unknown = Object.keys(tables).filter((name) => !known.has(name));
  if (unknown.length) throw invalid(`tabelas desconhecidas: ${unknown.join(', ')}`);

  return TABLES.map((table) => {
    const rows = (tables as Record<string, unknown>)[table.name] ?? [];
    if (!Array.isArray(rows)) throw invalid(`"${table.name}" deve ser uma lista`);
    const params = rows.map((row: unknown, index) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) throw invalid(`${table.name}[${index}] deve ser um objeto`);
      return table.columns.map((column) => decodeValue(table.name, column, (row as EnvironmentRow)[column.name]));
    });
    return { table, params };
  });
}

/** Lê um arquivo exportado (compactado ou não) e confere formato e versão. */
export function parseEnvironmentFile(content: Buffer): EnvironmentFile {
  const isGzip = content[0] === 0x1f && content[1] === 0x8b;
  let text: string;
  try {
    text = (isGzip ? gunzipSync(content, { maxOutputLength: MAX_JSON_BYTES }) : content).toString('utf8');
  } catch {
    throw invalid('o arquivo compactado está corrompido');
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw invalid('o conteúdo não é JSON');
  }
  const file = doc as Partial<EnvironmentFile> | null;
  if (file?.format !== ENVIRONMENT_FORMAT) throw invalid('não é um ambiente exportado por este console');
  if (file.formatVersion !== ENVIRONMENT_FORMAT_VERSION) {
    throw invalid(`versão de formato ${String(file.formatVersion)} não suportada (este console lê a versão ${ENVIRONMENT_FORMAT_VERSION})`);
  }
  decodeTables(file.tables);
  return file as EnvironmentFile;
}

export async function readEnvironment(db: Queryable, emulatorVersion: string | null): Promise<EnvironmentFile> {
  const tables: Record<string, EnvironmentRow[]> = {};
  for (const table of TABLES) {
    const columns = table.columns.map((c) => `"${c.name}"`).join(', ');
    const { rows } = await db.query<EnvironmentRow>(`SELECT ${columns} FROM ${table.name} ORDER BY ${table.orderBy}`);
    tables[table.name] = rows.map((row) => Object.fromEntries(table.columns.map((c) => [c.name, encodeValue(c, row[c.name])])));
  }
  return {
    format: ENVIRONMENT_FORMAT,
    formatVersion: ENVIRONMENT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    emulatorVersion,
    tables,
  };
}

export const compressEnvironment = (file: EnvironmentFile): Buffer => gzipSync(JSON.stringify(file));

/** Troca todo o estado salvo pelo do arquivo (null esvazia). Precisa rodar numa transação. */
export async function replaceEnvironment(tx: Queryable, file: Pick<EnvironmentFile, 'tables'> | null): Promise<void> {
  const decoded = decodeTables(file?.tables ?? {});
  for (const table of [...TABLES].reverse()) await tx.query(`DELETE FROM ${table.name}`);
  for (const { table, params } of decoded) {
    const columns = table.columns.map((c) => `"${c.name}"`).join(', ');
    const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(', ');
    for (const values of params) {
      try {
        await tx.query(`INSERT INTO ${table.name} (${columns}) VALUES (${placeholders})`, values);
      } catch (err) {
        // Violação de chave ou de referência: o arquivo é inconsistente, não uma falha do console.
        const code = (err as { code?: string }).code ?? '';
        if (code.startsWith('22') || code.startsWith('23')) throw invalid(`${table.name}: ${(err as Error).message}`);
        throw err;
      }
    }
  }
}

/** Quantidade de recursos por serviço, para descrever um ambiente sem mostrar o conteúdo. */
export function summarizeEnvironment(file: Pick<EnvironmentFile, 'tables'>): Record<string, number> {
  const count = (name: string) => file.tables[name]?.length ?? 0;
  const summary: Record<string, number> = {};
  const add = (service: string, n: number) => {
    if (n) summary[service] = (summary[service] ?? 0) + n;
  };
  add('s3', count('s3_buckets'));
  add('dynamodb', count('dynamodb_tables'));
  add('sqs', count('sqs_queues'));
  for (const row of file.tables.stored_resources ?? []) add(String(row.service), 1);
  return summary;
}
