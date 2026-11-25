import { describe, expect, it } from 'vitest';
import type { FieldSpec, ServiceMeta } from '../src/api/catalog';
import { catalogEntry, mergeServices } from '../src/layout/services';
import { fieldError, formErrors, formatAttribute, initialValues, toInput } from '../src/pages/catalog/fields';

const fields: FieldSpec[] = [
  { name: 'id', label: 'Identificador', type: 'text', required: true, pattern: '^[a-z][a-z0-9-]*$', patternHint: 'minúsculas' },
  { name: 'nodes', label: 'Nós', type: 'number', min: 1, max: 5, default: 1 },
  { name: 'subnets', label: 'Sub-redes', type: 'multiselect', required: true },
  { name: 'rules', label: 'Regras', type: 'list', default: ['tcp:22:0.0.0.0/0'] },
  { name: 'encrypted', label: 'Criptografar', type: 'boolean', default: true },
  { name: 'body', label: 'Corpo', type: 'code' },
];

describe('formulário do catálogo', () => {
  it('monta os valores iniciais a partir dos padrões', () => {
    expect(initialValues(fields)).toEqual({ id: '', nodes: '1', subnets: [], rules: 'tcp:22:0.0.0.0/0', encrypted: true, body: '' });
  });

  it('valida obrigatórios, padrão e limites', () => {
    const values = { ...initialValues(fields), id: '9x', nodes: '9' };
    expect(formErrors(fields, values)).toEqual({ id: 'minúsculas', nodes: 'Máximo: 5.', subnets: 'Selecione ao menos uma opção.' });
    expect(fieldError(fields[1]!, 'abc')).toBe('Informe um número.');
    expect(fieldError(fields[1]!, '')).toBeNull();
  });

  it('converte para a entrada da API, sem campos vazios', () => {
    const values = { ...initialValues(fields), id: ' db-1 ', subnets: ['s-1', 's-2'], rules: 'tcp:22:0.0.0.0/0\n\n tcp:443:0.0.0.0/0 ', body: '' };
    expect(toInput(fields, values)).toEqual({
      id: 'db-1',
      nodes: 1,
      subnets: ['s-1', 's-2'],
      rules: ['tcp:22:0.0.0.0/0', 'tcp:443:0.0.0.0/0'],
      encrypted: true,
    });
  });

  it('formata atributos para exibição', () => {
    expect(formatAttribute(null)).toBe('-');
    expect(formatAttribute(true)).toBe('Sim');
    expect(formatAttribute(3)).toBe('3');
  });
});

describe('navegação do catálogo', () => {
  const service: ServiceMeta = {
    id: 'cognito',
    name: 'Cognito',
    description: 'Login',
    category: 'Segurança, identidade e conformidade',
    types: [
      { key: 'user-pool', label: 'Grupos de usuários', singular: 'grupo', hidden: false, columns: [], create: null, remove: null, actions: [], persisted: true },
      { key: 'user', label: 'Usuários', singular: 'usuário', parent: 'user-pool', hidden: false, columns: [], create: null, remove: null, actions: [], persisted: true },
      { key: 'image', label: 'Imagens', singular: 'imagem', hidden: true, columns: [], create: null, remove: null, actions: [], persisted: false },
    ],
    tools: [],
  };

  it('só lista tipos principais e visíveis', () => {
    expect(catalogEntry(service).links).toEqual([{ text: 'Grupos de usuários', href: '/c/cognito/user-pool' }]);
  });

  it('serviço só com ferramentas ganha o link "Experimentar"', () => {
    expect(catalogEntry({ ...service, types: [], tools: [{ key: 't', label: 'T', mutates: false, fields: [] }] }).links).toEqual([
      { text: 'Experimentar', href: '/c/cognito/tools' },
    ]);
  });

  it('junta serviços estáticos e do catálogo em ordem alfabética', () => {
    const names = mergeServices([service]).map((s) => s.name);
    expect(names).toContain('Cognito');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });
});
