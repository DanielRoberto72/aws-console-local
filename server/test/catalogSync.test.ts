import { describe, expect, it } from 'vitest';
import { CatalogSync, IdMap, persistedTypes } from '../src/catalog/catalogSync.js';
import type { CatalogRegistry } from '../src/catalog/registry.js';
import type { ResourceStore, StoredResource } from '../src/db/resourceStore.js';
import { managedBy } from '../src/catalog/helpers.js';
import type { CatalogService, ResourceType } from '../src/catalog/types.js';

const type = (key: string, extra: Partial<ResourceType> = {}): ResourceType => ({
  key,
  label: key,
  singular: key,
  columns: [],
  list: async () => [],
  create: { fields: [], run: async () => ({ id: key }) },
  persist: async () => ({}),
  ...extra,
});

describe('persistedTypes', () => {
  it('coloca pais e tipos referenciados antes de quem depende deles', () => {
    const service = {
      id: 'ec2',
      types: [
        type('instance', {
          create: {
            fields: [
              { name: 'subnetId', label: '', type: 'select', source: 'ec2/subnet' },
              { name: 'keyName', label: '', type: 'select', source: 'ec2/key-pair' },
              { name: 'role', label: '', type: 'select', source: 'iam-roles' },
            ],
            run: async () => ({ id: 'i' }),
          },
        }),
        type('subnet', { create: { fields: [{ name: 'vpcId', label: '', type: 'select', source: 'ec2/vpc' }], run: async () => ({ id: 's' }) } }),
        type('vpc'),
        type('key-pair'),
        type('image', { create: undefined, persist: undefined }),
      ],
    } as unknown as CatalogService;

    const order = persistedTypes(service).map((t) => t.key);
    expect(order.indexOf('vpc')).toBeLessThan(order.indexOf('subnet'));
    expect(order.indexOf('subnet')).toBeLessThan(order.indexOf('instance'));
    expect(order.indexOf('key-pair')).toBeLessThan(order.indexOf('instance'));
    expect(order).not.toContain('image');
  });

  it('põe o filho depois do pai mesmo declarado antes', () => {
    const service = { id: 'route53', types: [type('record', { parent: 'zone' }), type('zone')] } as unknown as CatalogService;
    expect(persistedTypes(service).map((t) => t.key)).toEqual(['zone', 'record']);
  });
});

describe('IdMap', () => {
  it('traduz IDs antigos e mantém os desconhecidos', () => {
    const ids = new IdMap();
    ids.set('ec2/vpc', 'vpc-antiga', 'vpc-nova');
    expect(ids.resolve('ec2/vpc', 'vpc-antiga')).toBe('vpc-nova');
    expect(ids.resolve('ec2/vpc', 'vpc-padrao')).toBe('vpc-padrao');
    expect(ids.resolve('ec2/subnet', 'vpc-antiga')).toBe('vpc-antiga');
  });
});

describe('managedBy', () => {
  it('reconhece recursos criados por outros serviços pelas tags aws:', () => {
    expect(managedBy([{ Key: 'aws:cloudformation:stack-name', Value: 'loja' }])).toBe('stack loja');
    expect(managedBy([{ Key: 'Name', Value: 'x' }, { Key: 'aws:autoscaling:groupName', Value: 'web' }])).toBe('aws:autoscaling:groupName = web');
    expect(managedBy([{ Key: 'Name', Value: 'x' }])).toBeUndefined();
    expect(managedBy(undefined)).toBeUndefined();
  });
});

describe('CatalogSync.snapshot', () => {
  it('salva filhos com o mesmo ID em pais diferentes e preserva a senha por pai', async () => {
    const saved: StoredResource[] = [];
    const store = {
      list: async () => [],
      replace: async (_tx: unknown, _service: string, resources: StoredResource[]) => void saved.push(...resources),
    } as unknown as ResourceStore;
    const service = {
      id: 'cognito',
      types: [
        type('pool', { list: async () => [{ id: 'p1', name: 'p1', attrs: {} }, { id: 'p2', name: 'p2', attrs: {} }] }),
        type('user', {
          parent: 'pool',
          preserve: ['password'],
          list: async () => [{ id: 'ana', name: 'ana', attrs: {} }],
          persist: async () => ({ username: 'ana' }),
        }),
      ],
    } as unknown as CatalogService;
    const log = { warn: () => undefined } as never;
    const sync = new CatalogSync(service, {} as CatalogRegistry, store, new IdMap(), {} as never, log);
    sync.remember('user', 'ana', { password: 'senha-do-p2' }, 'p2');

    await sync.snapshot({} as never);

    const users = saved.filter((r) => r.type === 'user');
    expect(users.map((u) => u.name)).toEqual(['p1/ana', 'p2/ana']);
    expect(users.map((u) => (u.data as { input: { password?: string } }).input.password)).toEqual([undefined, 'senha-do-p2']);
  });
});
