import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readEditableSources, zipSources } from '../src/lambda/codeArchive.js';

describe('pacote de código do Lambda', () => {
  it('compacta e lê de volta os arquivos do editor', () => {
    const zip = zipSources([
      { name: 'lambda_function.py', content: 'def lambda_handler(e, c):\n    return 1\n' },
      { name: 'utils/helpers.py', content: 'X = "ção"\n' },
    ]);
    expect(readEditableSources(zip)).toEqual({
      files: [
        { name: 'lambda_function.py', content: 'def lambda_handler(e, c):\n    return 1\n' },
        { name: 'utils/helpers.py', content: 'X = "ção"\n' },
      ],
      skipped: [],
    });
  });

  it('deixa binários de fora do editor e os informa', () => {
    const zip = zipSync({ 'index.mjs': strToU8('export const handler = 1;'), 'lib/nativo.so': new Uint8Array([0, 1, 2, 0]) });
    const { files, skipped } = readEditableSources(zip);
    expect(files.map((f) => f.name)).toEqual(['index.mjs']);
    expect(skipped).toEqual(['lib/nativo.so']);
  });

  it('recusa pacote vazio', () => {
    expect(() => zipSources([])).toThrow(/ao menos um arquivo/);
  });
});
