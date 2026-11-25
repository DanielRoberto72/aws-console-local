import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface SourceFile {
  name: string;
  content: string;
}

/** Arquivos maiores que isso não são abertos no editor do painel. */
const MAX_EDITABLE_BYTES = 512 * 1024;

export function zipSources(files: readonly SourceFile[]): Buffer {
  if (files.length === 0) throw new Error('Informe ao menos um arquivo de código.');
  const entries = Object.fromEntries(files.map((f) => [f.name, strToU8(f.content)]));
  return Buffer.from(zipSync(entries));
}

/** Arquivos de texto do pacote, para exibir no editor; binários e arquivos grandes ficam de fora. */
export function readEditableSources(zip: Uint8Array): { files: SourceFile[]; skipped: string[] } {
  const files: SourceFile[] = [];
  const skipped: string[] = [];
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    if (name.endsWith('/')) continue;
    const text = bytes.length <= MAX_EDITABLE_BYTES ? strFromU8(bytes) : null;
    // O caractere nulo indica conteúdo binário.
    if (text === null || text.includes('\u0000')) skipped.push(name);
    else files.push({ name, content: text });
  }
  return { files: files.sort((a, b) => a.name.localeCompare(b.name)), skipped };
}
