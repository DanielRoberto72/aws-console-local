import type { CatalogServiceId } from './ids.js';

/**
 * Catálogo genérico: cada tipo de recurso declara como listar, criar, excluir, agir
 * e persistir. Rotas, telas e persistência são derivadas dessas declarações, o que
 * evita um módulo escrito à mão por serviço quando o emulador só guarda configuração.
 */

export type FieldType = 'text' | 'password' | 'number' | 'select' | 'multiselect' | 'textarea' | 'code' | 'boolean' | 'list';

export type FieldValue = string | number | boolean | string[];
export type Input = Record<string, FieldValue | undefined>;

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: FieldValue;
  description?: string;
  placeholder?: string;
  options?: FieldOption[];
  /**
   * Opções carregadas dinamicamente: "serviço/tipo" do catálogo (o valor é o ID do
   * recurso e é remapeado na restauração) ou o nome de uma consulta (ex.: "lambda-functions").
   */
  source?: string;
  min?: number;
  max?: number;
  pattern?: string;
  patternHint?: string;
  rows?: number;
}

export type StatusTone = 'success' | 'error' | 'warning' | 'pending' | 'in-progress' | 'stopped' | 'info';

export interface ResourceRow {
  id: string;
  name: string;
  status?: { label: string; tone: StatusTone };
  attrs: Record<string, string | number | boolean | null>;
  /** Criado por outro serviço (ex.: stack do CloudFormation), que o recria: não é salvo à parte. */
  managedBy?: string;
}

export interface ColumnSpec {
  key: string;
  label: string;
}

export type ActionResult =
  | { kind: 'message'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'table'; columns: string[]; rows: (string | number | null)[][] }
  | { kind: 'audio'; contentType: string; base64: string }
  | { kind: 'secret'; label: string; value: string; warning: string };

export interface ActionSpec {
  key: string;
  label: string;
  description?: string;
  fields: FieldSpec[];
  submitLabel?: string;
  /** Altera o recurso: a tela recarrega e o painel sincroniza depois. */
  mutates?: boolean;
  /** Os campos da ação atualizam campos preservados da criação (ex.: nova senha). */
  remembers?: boolean;
  run(id: string, input: Input, parentId?: string): Promise<ActionResult>;
}

export interface CreateResult {
  id: string;
  /** Valor exibido uma única vez (ex.: chave privada de um par de chaves). */
  reveal?: { label: string; value: string; warning: string };
}

export interface ResourceType {
  key: string;
  label: string;
  singular: string;
  description?: string;
  /** Tipo pai no mesmo serviço: o recurso só existe dentro dele (ex.: registro de uma zona). */
  parent?: string;
  /** Não aparece na navegação (ex.: catálogos só de leitura usados em seletores). */
  hidden?: boolean;
  /** Aviso mostrado na lista e no detalhe. */
  notes?: string;
  columns: ColumnSpec[];
  list(parentId?: string): Promise<ResourceRow[]>;
  describe?(id: string, parentId?: string): Promise<unknown>;
  create?: { label?: string; fields: FieldSpec[]; run(input: Input, parentId?: string): Promise<CreateResult> };
  remove?: { label?: string; warning?: string; run(id: string, parentId?: string): Promise<void> };
  actions?: ActionSpec[];
  /**
   * Campos que a API não devolve depois da criação (ex.: senha mestre do RDS). O valor
   * informado na criação pelo painel é guardado e reaproveitado nos snapshots seguintes.
   */
  preserve?: string[];
  /**
   * Atributo com o endpoint na rede do compose ("emulator:5432"). O painel repassa cada porta
   * citada para uma porta fixa no Mac e mostra o resultado na coluna "Endpoint no Mac".
   */
  forward?: string;
  /** Converte o recurso existente na entrada de criação usada para recriá-lo. Null: não salvar. */
  persist?(row: ResourceRow, parentId?: string): Promise<Input | null>;
}

export interface CatalogService {
  id: CatalogServiceId;
  name: string;
  description: string;
  category: string;
  notes?: string;
  types: ResourceType[];
  /** Operações sem recurso, como as APIs de IA (traduzir, detectar sentimento). */
  tools?: ActionSpec[];
}
