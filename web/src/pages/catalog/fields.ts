import type { FieldSpec, FieldValue, Input } from '../../api/catalog';

/**
 * Estado do formulário: tudo como texto ou lista enquanto o usuário edita;
 * a conversão para o tipo do campo acontece só no envio.
 */
export type FormValues = Record<string, string | boolean | string[]>;

export function initialValues(fields: readonly FieldSpec[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const value = field.default;
    if (field.type === 'boolean') values[field.name] = value === true;
    else if (field.type === 'multiselect') values[field.name] = Array.isArray(value) ? value : [];
    else if (field.type === 'list') values[field.name] = Array.isArray(value) ? value.join('\n') : String(value ?? '');
    else values[field.name] = Array.isArray(value) ? value.join(',') : value === undefined ? '' : String(value);
  }
  return values;
}

export function fieldError(field: FieldSpec, value: FormValues[string] | undefined): string | null {
  if (field.type === 'boolean') return null;
  if (field.type === 'multiselect') {
    return field.required && (!Array.isArray(value) || value.length === 0) ? 'Selecione ao menos uma opção.' : null;
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return field.required ? 'Campo obrigatório.' : null;
  if (field.type === 'number') {
    const n = Number(text);
    if (!Number.isFinite(n)) return 'Informe um número.';
    if (field.min !== undefined && n < field.min) return `Mínimo: ${field.min}.`;
    if (field.max !== undefined && n > field.max) return `Máximo: ${field.max}.`;
    return null;
  }
  if (field.pattern && field.type !== 'list' && !new RegExp(field.pattern).test(text)) {
    return field.patternHint ?? 'Formato inválido.';
  }
  return null;
}

export function formErrors(fields: readonly FieldSpec[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const error = fieldError(field, values[field.name]);
    if (error) errors[field.name] = error;
  }
  return errors;
}

/** Converte o estado do formulário na entrada esperada pela API, sem campos vazios. */
export function toInput(fields: readonly FieldSpec[], values: FormValues): Input {
  const input: Input = {};
  for (const field of fields) {
    const value = values[field.name];
    let converted: FieldValue | undefined;
    if (field.type === 'boolean') converted = value === true;
    else if (field.type === 'multiselect') converted = Array.isArray(value) && value.length ? value : undefined;
    else if (field.type === 'list') {
      const lines = String(value ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      converted = lines.length ? lines : undefined;
    } else {
      const text = typeof value === 'string' ? (field.type === 'code' || field.type === 'textarea' || field.type === 'password' ? value : value.trim()) : '';
      if (text === '') converted = undefined;
      else converted = field.type === 'number' ? Number(text) : text;
    }
    if (converted !== undefined) input[field.name] = converted;
  }
  return input;
}

/** Rótulos dos atributos extras que aparecem no detalhe sem coluna própria. */
const ATTRIBUTE_LABELS: Record<string, string> = {
  arn: 'ARN',
  createdAt: 'Criação',
  subnets: 'Sub-redes',
  subnet: 'Sub-rede',
  securityGroups: 'Grupos de segurança',
  vpc: 'VPC',
  keyName: 'Par de chaves',
  publicKey: 'Chave pública',
  reason: 'Motivo',
  parameters: 'Parâmetros',
  outputs: 'Saídas',
  role: 'Função do IAM',
  username: 'Usuário principal',
  dbName: 'Banco',
  storage: 'Armazenamento (GiB)',
  deletionDate: 'Exclusão programada',
  containerName: 'Contêiner',
  containerPort: 'Porta do contêiner',
  description: 'Descrição',
  launchedAt: 'Execução',
};

export const attributeLabel = (key: string, columns: readonly { key: string; label: string }[]) =>
  columns.find((c) => c.key === key)?.label ?? ATTRIBUTE_LABELS[key] ?? key;

export function formatAttribute(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('pt-BR');
  }
  return String(value);
}
