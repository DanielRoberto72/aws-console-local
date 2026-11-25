import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '../http/errors.js';
import { createTracker, type RouteDeps } from '../http/tracker.js';
import type { CatalogRegistry } from './registry.js';
import type { ActionSpec, CatalogService, ColumnSpec, FieldSpec, Input, ResourceRow, ResourceType } from './types.js';

/** Schema JSON derivado dos campos do formulário: a validação de formato fica no servidor. */
export function inputSchema(fields: readonly FieldSpec[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.name] = fieldSchema(field);
    if (field.required) required.push(field.name);
  }
  return { type: 'object', additionalProperties: false, required, properties };
}

function fieldSchema(field: FieldSpec): Record<string, unknown> {
  switch (field.type) {
    case 'number':
      return { type: 'number', ...(field.min !== undefined && { minimum: field.min }), ...(field.max !== undefined && { maximum: field.max }) };
    case 'boolean':
      return { type: 'boolean' };
    case 'multiselect':
    case 'list':
      return { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 2048 }, ...(field.required && { minItems: 1 }) };
    case 'select':
      return field.options && !field.source ? { enum: field.options.map((o) => o.value) } : { type: 'string', maxLength: 2048 };
    default: {
      const max = field.type === 'code' || field.type === 'textarea' ? 200_000 : 2048;
      return { type: 'string', maxLength: max, ...(field.required && { minLength: 1 }), ...(field.pattern && { pattern: field.pattern }) };
    }
  }
}

const LOCAL_COLUMN: ColumnSpec = { key: 'localEndpoint', label: 'Endpoint no Mac' };

/** A coluna do repasse fica logo depois da coluna do endpoint original. */
function withLocalColumn(columns: readonly ColumnSpec[], attr: string): ColumnSpec[] {
  const index = columns.findIndex((c) => c.key === attr);
  return index < 0 ? [...columns, LOCAL_COLUMN] : [...columns.slice(0, index + 1), LOCAL_COLUMN, ...columns.slice(index + 1)];
}

const actionMeta = (action: ActionSpec) => ({
  key: action.key,
  label: action.label,
  description: action.description,
  submitLabel: action.submitLabel,
  mutates: action.mutates ?? false,
  fields: action.fields,
});

const typeMeta = (type: ResourceType) => ({
  key: type.key,
  label: type.label,
  singular: type.singular,
  description: type.description,
  parent: type.parent,
  hidden: type.hidden ?? false,
  notes: type.notes,
  columns: type.forward ? withLocalColumn(type.columns, type.forward) : type.columns,
  create: type.create ? { label: type.create.label, fields: type.create.fields } : null,
  remove: type.remove ? { label: type.remove.label, warning: type.remove.warning } : null,
  actions: (type.actions ?? []).map(actionMeta),
  persisted: Boolean(type.persist && type.create),
});

const serviceMeta = (service: CatalogService) => ({
  id: service.id,
  name: service.name,
  description: service.description,
  category: service.category,
  notes: service.notes,
  types: service.types.map(typeMeta),
  tools: (service.tools ?? []).map(actionMeta),
});

const parentQuery = { type: 'object', properties: { parentId: { type: 'string', maxLength: 2048 } } } as const;
const idBody = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 2048 }, parentId: { type: 'string', maxLength: 2048 } },
} as const;

function findAction(actions: readonly ActionSpec[] | undefined, key: string): ActionSpec {
  const action = actions?.find((a) => a.key === key);
  if (!action) throw new NotFoundError(`Ação desconhecida: ${key}`);
  return action;
}

export function catalogRoutes(
  app: FastifyInstance,
  {
    registry,
    activity,
    onChange,
    rememberInput,
    decorate,
  }: RouteDeps & {
    registry: CatalogRegistry;
    rememberInput: (service: string, type: string, id: string, input: Input, parentId?: string) => void;
    /** Complementa a lista completa de um tipo (ex.: endpoint repassado para o Mac). */
    decorate: (service: string, type: ResourceType, rows: ResourceRow[]) => Promise<ResourceRow[]>;
  },
): void {
  app.get('/api/catalog', async () => ({ services: registry.services.map(serviceMeta) }));

  app.get<{ Querystring: { source: string } }>(
    '/api/catalog/options',
    { schema: { querystring: { type: 'object', required: ['source'], properties: { source: { type: 'string', maxLength: 200 } } } } },
    async (request) => ({ options: await registry.options(request.query.source) }),
  );

  // Uma rota de criação e de ação por tipo, cada uma com o schema dos seus campos.
  for (const service of registry.services) {
    const track = createTracker(activity, service.id, onChange);
    const base = `/api/catalog/${service.id}`;

    for (const tool of service.tools ?? []) {
      app.post<{ Body: { input: Input } }>(
        `${base}/tools/${tool.key}`,
        { schema: { body: { type: 'object', required: ['input'], properties: { input: inputSchema(tool.fields) } } } },
        async (request) => ({ result: await tool.run('', request.body.input) }),
      );
    }

    for (const type of service.types) {
      const typeBase = `${base}/${type.key}`;

      const listRows = async (parentId: string | undefined) => decorate(service.id, type, await type.list(parentId));

      app.get<{ Querystring: { parentId?: string } }>(typeBase, { schema: { querystring: parentQuery } }, async (request) => ({
        rows: await listRows(request.query.parentId || undefined),
      }));

      app.get<{ Querystring: { id: string; parentId?: string } }>(
        `${typeBase}/detail`,
        { schema: { querystring: idBody } },
        async (request) => {
          const { id, parentId } = request.query;
          const row = (await listRows(parentId || undefined)).find((r) => r.id === id);
          if (!row) throw new NotFoundError(`${type.singular} "${id}" não encontrado(a).`);
          return { row, details: type.describe ? await type.describe(id, parentId || undefined) : null };
        },
      );

      if (type.create) {
        const create = type.create;
        app.post<{ Body: { input: Input; parentId?: string } }>(
          typeBase,
          {
            schema: {
              body: { type: 'object', required: ['input'], properties: { input: inputSchema(create.fields), parentId: { type: 'string', maxLength: 2048 } } },
            },
          },
          async (request, reply) => {
            const { input, parentId } = request.body;
            const target = String(input.name ?? input.id ?? type.singular);
            const result = await track(`Create:${type.key}`, target, () => create.run(input, parentId || undefined));
            rememberInput(service.id, type.key, result.id, input, parentId || undefined);
            return reply.status(201).send(result);
          },
        );
      }

      if (type.remove) {
        const remove = type.remove;
        app.post<{ Body: { id: string; parentId?: string } }>(`${typeBase}/delete`, { schema: { body: idBody } }, async (request) => {
          const { id, parentId } = request.body;
          await track(`Delete:${type.key}`, id, () => remove.run(id, parentId || undefined));
          return { ok: true };
        });
      }

      for (const action of type.actions ?? []) {
        app.post<{ Body: { id: string; parentId?: string; input: Input } }>(
          `${typeBase}/actions/${action.key}`,
          {
            schema: {
              body: { ...idBody, required: ['id', 'input'], properties: { ...idBody.properties, input: inputSchema(action.fields) } },
            },
          },
          async (request) => {
            const { id, parentId, input } = request.body;
            const run = () => findAction(type.actions, action.key).run(id, input, parentId || undefined);
            // Ações de leitura (consultas, testes) não entram no histórico nem disparam sincronização.
            const result = action.mutates ? await track(action.key, id, run) : await run();
            if (action.remembers) rememberInput(service.id, type.key, id, input, parentId || undefined);
            return { result };
          },
        );
      }
    }
  }
}
