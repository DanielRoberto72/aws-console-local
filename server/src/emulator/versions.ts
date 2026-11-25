/** Versões do AWS Emulator: a instalada (arquivo gerado no início do container) e a publicada. */

export interface InstalledVersion {
  version: string;
  releaseDate: string | null;
  commit: string | null;
}

/** Saída de `aws-emulator --version`: linhas "Version:", "Release date:" e "Commit:". */
export function parseVersionOutput(text: string): InstalledVersion | null {
  const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(text)?.[1]?.trim() ?? null;
  const version = normalizeVersion(field('Version'));
  if (!version) return null;
  return { version, releaseDate: field('Release date'), commit: field('Commit') };
}

/**
 * "1.0.609.1" (metadado do pacote) e "1.0.589-1" (RPM) viram "1.0.609" e "1.0.589",
 * o formato das tags do GitHub. Null quando o texto não começa com três números.
 */
export function normalizeVersion(raw: string | null | undefined): string | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw?.trim() ?? '');
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null;
}

/** Negativo quando a é anterior a b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
