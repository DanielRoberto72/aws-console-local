/** Regras de nome de bucket de uso geral da AWS; devolve a primeira violação. */
export function validateBucketName(name: string): string | null {
  if (name.length < 3 || name.length > 63) return 'O nome deve ter entre 3 e 63 caracteres.';
  if (!/^[a-z0-9.-]+$/.test(name)) return 'Use apenas letras minúsculas, números, pontos (.) e hifens (-).';
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) return 'O nome deve começar e terminar com letra ou número.';
  if (name.includes('..')) return 'O nome não pode ter dois pontos seguidos.';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return 'O nome não pode ter formato de endereço IP.';
  if (name.startsWith('xn--') || name.startsWith('sthree-')) return 'O nome não pode começar com "xn--" ou "sthree-".';
  if (name.endsWith('-s3alias') || name.endsWith('--ol-s3')) return 'O nome não pode terminar com "-s3alias" ou "--ol-s3".';
  return null;
}
