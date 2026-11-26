import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../src/http/errors.js';
import {
  decodeTables,
  ENVIRONMENT_FORMAT,
  ENVIRONMENT_FORMAT_VERSION,
  parseEnvironmentFile,
  summarizeEnvironment,
} from '../src/environment/environmentFile.js';

const file = (tables: unknown, extra: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify({ format: ENVIRONMENT_FORMAT, formatVersion: ENVIRONMENT_FORMAT_VERSION, exportedAt: '2026-11-25T00:00:00Z', emulatorVersion: null, tables, ...extra }));

describe('arquivo de ambiente', () => {
  it('lê o arquivo compactado ou não e converte os tipos das colunas', () => {
    const tables = {
      s3_buckets: [{ name: 'fotos', created_at: '2026-11-25T00:00:00.000Z' }],
      s3_objects: [{ bucket: 'fotos', key: 'a.txt', etag: '"x"', size: 2, content_type: 'text/plain', last_modified: null, body: Buffer.from('oi').toString('base64') }],
      stored_resources: [{ service: 'sns', type: 'topic', name: 'pedidos', data: { fifo: false }, blob: null }],
    };
    for (const content of [file(tables), gzipSync(file(tables))]) parseEnvironmentFile(content);

    const decoded = decodeTables(tables);
    const objects = decoded.find((d) => d.table.name === 's3_objects')!;
    expect(objects.params[0]).toEqual(['fotos', 'a.txt', '"x"', 2, 'text/plain', null, Buffer.from('oi')]);
    const resources = decoded.find((d) => d.table.name === 'stored_resources')!;
    expect(resources.params[0]).toEqual(['sns', 'topic', 'pedidos', '{"fifo":false}', null]);
    expect(decoded.find((d) => d.table.name === 'sqs_queues')!.params).toEqual([]);
  });

  it('recusa arquivos de outro formato, de outra versão ou com colunas inválidas', () => {
    const reject = (content: Buffer, message: RegExp) => {
      expect(() => parseEnvironmentFile(content)).toThrow(BadRequestError);
      expect(() => parseEnvironmentFile(content)).toThrow(message);
    };
    reject(Buffer.from('não é json'), /não é JSON/);
    reject(Buffer.from('{"format":"outro"}'), /não é um ambiente exportado/);
    reject(file({}, { formatVersion: 99 }), /versão de formato 99/);
    reject(file({ usuarios: [] }), /tabelas desconhecidas: usuarios/);
    reject(file({ s3_buckets: [{ created_at: null }] }), /s3_buckets.name é obrigatório/);
    reject(file({ s3_objects: [{ bucket: 'b', key: 'k', etag: 'e', size: -1, body: '' }] }), /s3_objects.size deve ser um inteiro/);
  });

  it('resume os recursos por serviço', () => {
    expect(
      summarizeEnvironment({
        tables: {
          s3_buckets: [{}, {}],
          sqs_queues: [{}],
          stored_resources: [{ service: 'lambda' }, { service: 'lambda' }, { service: 'iam' }],
        },
      }),
    ).toEqual({ s3: 2, sqs: 1, lambda: 2, iam: 1 });
  });

  it('os modelos de laboratório do repositório são ambientes válidos', () => {
    const dir = new URL('../templates/', import.meta.url);
    const templates = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(templates.length).toBeGreaterThan(0);
    for (const name of templates) {
      const template = parseEnvironmentFile(readFileSync(new URL(name, dir)));
      expect(template.title, name).toBeTruthy();
      expect(template.description, name).toBeTruthy();
    }
  });
});
