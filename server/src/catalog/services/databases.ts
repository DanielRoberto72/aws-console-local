import {
  CreateCacheClusterCommand,
  DeleteCacheClusterCommand,
  DescribeCacheClustersCommand,
  ElastiCacheClient,
  RebootCacheClusterCommand,
} from '@aws-sdk/client-elasticache';
import { CreateDBInstanceCommand, DeleteDBInstanceCommand, DescribeDBInstancesCommand, RDSClient, RebootDBInstanceCommand } from '@aws-sdk/client-rds';
import { CreateClusterCommand, DeleteClusterCommand, DescribeClustersCommand, RedshiftClient } from '@aws-sdk/client-redshift';
import type { CatalogContext } from '../context.js';
import { compact, endpointText, iso, message, num, optStr, status, str } from '../helpers.js';
import type { CatalogService, FieldSpec, Input } from '../types.js';

/**
 * Senha usada ao recriar um banco cuja senha não foi informada pelo painel (ex.: criado
 * pela CLI): a API não devolve a senha mestre, então não há como recuperá-la.
 */
export const FALLBACK_DB_PASSWORD = 'ConsoleLocal123';

const PORT_NOTE =
  'O banco roda de verdade dentro do emulador. Fora do compose, conecte pelo "Endpoint local", que fica fixo; o endpoint da rede do compose (host "emulator") muda de porta a cada reinício do emulador.';

const identifier: FieldSpec = {
  name: 'id',
  label: 'Identificador',
  type: 'text',
  required: true,
  pattern: '^[a-zA-Z][a-zA-Z0-9-]{0,62}$',
  patternHint: 'Começa com letra; letras, números e hifens.',
};
const username: FieldSpec = { name: 'username', label: 'Nome do usuário principal', type: 'text', required: true, default: 'admin1', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,15}$' };
const password: FieldSpec = { name: 'password', label: 'Senha principal', type: 'password', required: true, pattern: '^[^/"@ ]{8,41}$', patternHint: '8 a 41 caracteres, sem / " @ ou espaço.' };

const withPassword = (input: Input) => str(input, 'password') || FALLBACK_DB_PASSWORD;

export function rdsService(ctx: CatalogContext): CatalogService {
  const rds = () => ctx.client(RDSClient);
  const instances = async () => (await rds().send(new DescribeDBInstancesCommand({}))).DBInstances ?? [];

  return {
    id: 'rds',
    name: 'RDS',
    description: 'Bancos de dados relacionais gerenciados',
    category: 'Banco de dados',
    notes: `${PORT_NOTE} Os dados ficam na memória do emulador: as tabelas e linhas se perdem quando ele reinicia; o painel recria só a instância.`,
    types: [
      {
        key: 'db-instance',
        label: 'Bancos de dados',
        singular: 'banco de dados',
        forward: 'endpoint',
        columns: [
          { key: 'engine', label: 'Mecanismo' },
          { key: 'version', label: 'Versão' },
          { key: 'class', label: 'Classe' },
          { key: 'endpoint', label: 'Endpoint (rede do compose)' },
          { key: 'username', label: 'Usuário principal' },
        ],
        async list() {
          return (await instances()).map((db) => ({
            id: db.DBInstanceIdentifier!,
            name: db.DBInstanceIdentifier!,
            status: status(db.DBInstanceStatus),
            attrs: {
              engine: db.Engine ?? null,
              version: db.EngineVersion ?? null,
              class: db.DBInstanceClass ?? null,
              endpoint: endpointText(db.Endpoint?.Address, db.Endpoint?.Port),
              username: db.MasterUsername ?? null,
              dbName: db.DBName ?? null,
              storage: db.AllocatedStorage ?? null,
              createdAt: iso(db.InstanceCreateTime),
            },
          }));
        },
        async describe(id) {
          return (await rds().send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }))).DBInstances?.[0] ?? null;
        },
        create: {
          label: 'Criar banco de dados',
          fields: [
            identifier,
            {
              name: 'engine',
              label: 'Mecanismo',
              type: 'select',
              required: true,
              default: 'postgres',
              options: [
                { value: 'postgres', label: 'PostgreSQL' },
                { value: 'mysql', label: 'MySQL' },
                { value: 'mariadb', label: 'MariaDB' },
              ],
            },
            { name: 'class', label: 'Classe da instância', type: 'select', default: 'db.t3.micro', options: ['db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.m5.large'].map((v) => ({ value: v, label: v })) },
            username,
            password,
            { name: 'dbName', label: 'Nome do banco inicial - opcional', type: 'text', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,62}$' },
            { name: 'storage', label: 'Armazenamento alocado (GiB)', type: 'number', min: 20, max: 65536, default: 20 },
          ],
          async run(input) {
            await rds().send(
              new CreateDBInstanceCommand({
                DBInstanceIdentifier: str(input, 'id'),
                Engine: str(input, 'engine'),
                DBInstanceClass: str(input, 'class') || 'db.t3.micro',
                MasterUsername: str(input, 'username'),
                MasterUserPassword: withPassword(input),
                DBName: optStr(input, 'dbName'),
                AllocatedStorage: num(input, 'storage') ?? 20,
              }),
            );
            return { id: str(input, 'id') };
          },
        },
        remove: {
          warning: 'O banco é excluído sem snapshot final.',
          async run(id) {
            await rds().send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: id, SkipFinalSnapshot: true }));
          },
        },
        actions: [
          {
            key: 'RebootDBInstance',
            label: 'Reinicializar',
            fields: [],
            mutates: true,
            async run(id) {
              await rds().send(new RebootDBInstanceCommand({ DBInstanceIdentifier: id }));
              return message('Reinicialização solicitada.');
            },
          },
          {
            key: 'ConnectionInfo',
            label: 'Como conectar',
            fields: [],
            async run(id) {
              const db = (await rds().send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }))).DBInstances?.[0];
              const port = db?.Endpoint?.Port;
              const user = db?.MasterUsername ?? 'admin1';
              const name = db?.DBName ?? (db?.Engine === 'postgres' ? 'postgres' : '');
              const postgres = db?.Engine === 'postgres';
              // A porta do host é atribuída pelo repasse e aparece em "Endpoint local" nos detalhes.
              const fromHost = postgres
                ? `psql -h localhost -p <porta do "Endpoint local"> -U ${user} -d ${name}`
                : `mysql -h 127.0.0.1 -P <porta do "Endpoint local"> -u ${user} -p ${name}`;
              const fromCompose = postgres
                ? `docker compose exec db psql -h emulator -p ${port} -U ${user} -d ${name}`
                : `mysql -h emulator -P ${port} -u ${user} -p ${name}`;
              return {
                kind: 'text',
                text: `Usuário: ${user}\n\nDa máquina host (porta fixa):\n${fromHost}\n\nDe dentro do docker compose (a porta ${port} muda a cada reinício do emulador):\n${fromCompose}`,
              };
            },
          },
        ],
        preserve: ['password'],
        async persist(row) {
          return compact({
            id: row.id,
            engine: String(row.attrs.engine),
            class: String(row.attrs.class ?? ''),
            username: String(row.attrs.username ?? 'admin1'),
            dbName: row.attrs.dbName ? String(row.attrs.dbName) : undefined,
            storage: typeof row.attrs.storage === 'number' ? row.attrs.storage : undefined,
          });
        },
      },
    ],
  };
}

export function elastiCacheService(ctx: CatalogContext): CatalogService {
  const cache = () => ctx.client(ElastiCacheClient);
  const clusters = async () => (await cache().send(new DescribeCacheClustersCommand({ ShowCacheNodeInfo: true }))).CacheClusters ?? [];

  return {
    id: 'elasticache',
    name: 'ElastiCache',
    description: 'Cache em memória (Redis, Valkey, Memcached)',
    category: 'Banco de dados',
    notes: `Redis e Valkey funcionam de verdade; o Memcached é só registrado. ${PORT_NOTE} Os dados do cache se perdem quando o emulador reinicia.`,
    types: [
      {
        key: 'cache-cluster',
        label: 'Caches',
        singular: 'cache',
        forward: 'endpoint',
        columns: [
          { key: 'engine', label: 'Mecanismo' },
          { key: 'version', label: 'Versão' },
          { key: 'nodeType', label: 'Tipo de nó' },
          { key: 'nodes', label: 'Nós' },
          { key: 'endpoint', label: 'Endpoint (rede do compose)' },
        ],
        async list() {
          return (await clusters()).map((c) => {
            const endpoint = c.ConfigurationEndpoint ?? c.CacheNodes?.[0]?.Endpoint;
            return {
              id: c.CacheClusterId!,
              name: c.CacheClusterId!,
              status: status(c.CacheClusterStatus),
              attrs: {
                engine: c.Engine ?? null,
                version: c.EngineVersion ?? null,
                nodeType: c.CacheNodeType ?? null,
                nodes: c.NumCacheNodes ?? null,
                endpoint: c.Engine === 'memcached' ? 'sem servidor real' : endpointText(endpoint?.Address, endpoint?.Port),
                createdAt: iso(c.CacheClusterCreateTime),
              },
            };
          });
        },
        async describe(id) {
          return (await clusters()).find((c) => c.CacheClusterId === id) ?? null;
        },
        create: {
          label: 'Criar cache',
          fields: [
            { ...identifier, pattern: '^[a-zA-Z][a-zA-Z0-9-]{0,39}$' },
            {
              name: 'engine',
              label: 'Mecanismo',
              type: 'select',
              required: true,
              default: 'redis',
              options: [
                { value: 'redis', label: 'Redis OSS' },
                { value: 'valkey', label: 'Valkey' },
                { value: 'memcached', label: 'Memcached' },
              ],
            },
            { name: 'nodeType', label: 'Tipo de nó', type: 'select', default: 'cache.t3.micro', options: ['cache.t3.micro', 'cache.t3.small', 'cache.m5.large'].map((v) => ({ value: v, label: v })) },
            { name: 'nodes', label: 'Número de nós', type: 'number', min: 1, max: 20, default: 1 },
          ],
          async run(input) {
            await cache().send(
              new CreateCacheClusterCommand({
                CacheClusterId: str(input, 'id'),
                Engine: str(input, 'engine'),
                CacheNodeType: str(input, 'nodeType') || 'cache.t3.micro',
                NumCacheNodes: num(input, 'nodes') ?? 1,
              }),
            );
            return { id: str(input, 'id') };
          },
        },
        remove: {
          async run(id) {
            await cache().send(new DeleteCacheClusterCommand({ CacheClusterId: id }));
          },
        },
        actions: [
          {
            key: 'RebootCacheCluster',
            label: 'Reinicializar nós',
            fields: [],
            mutates: true,
            async run(id) {
              const cluster = (await clusters()).find((c) => c.CacheClusterId === id);
              const nodes = (cluster?.CacheNodes ?? []).flatMap((n) => (n.CacheNodeId ? [n.CacheNodeId] : []));
              await cache().send(new RebootCacheClusterCommand({ CacheClusterId: id, CacheNodeIdsToReboot: nodes }));
              return message('Reinicialização solicitada.');
            },
          },
        ],
        async persist(row) {
          return compact({
            id: row.id,
            engine: String(row.attrs.engine),
            nodeType: String(row.attrs.nodeType ?? ''),
            nodes: typeof row.attrs.nodes === 'number' ? row.attrs.nodes : undefined,
          });
        },
      },
    ],
  };
}

export function redshiftService(ctx: CatalogContext): CatalogService {
  const redshift = () => ctx.client(RedshiftClient);
  const clusters = async () => (await redshift().send(new DescribeClustersCommand({}))).Clusters ?? [];

  return {
    id: 'redshift',
    name: 'Redshift',
    description: 'Data warehouse com SQL',
    category: 'Análise',
    notes: `O cluster aceita conexões SQL de verdade (protocolo do PostgreSQL). ${PORT_NOTE} Os dados se perdem quando o emulador reinicia.`,
    types: [
      {
        key: 'cluster',
        label: 'Clusters',
        singular: 'cluster',
        forward: 'endpoint',
        columns: [
          { key: 'nodeType', label: 'Tipo de nó' },
          { key: 'nodes', label: 'Nós' },
          { key: 'dbName', label: 'Banco' },
          { key: 'endpoint', label: 'Endpoint (rede do compose)' },
        ],
        async list() {
          return (await clusters()).map((c) => ({
            id: c.ClusterIdentifier!,
            name: c.ClusterIdentifier!,
            status: status(c.ClusterStatus),
            attrs: {
              nodeType: c.NodeType ?? null,
              nodes: c.NumberOfNodes ?? null,
              dbName: c.DBName ?? null,
              endpoint: endpointText(c.Endpoint?.Address, c.Endpoint?.Port),
              username: c.MasterUsername ?? null,
              createdAt: iso(c.ClusterCreateTime),
            },
          }));
        },
        async describe(id) {
          return (await clusters()).find((c) => c.ClusterIdentifier === id) ?? null;
        },
        create: {
          label: 'Criar cluster',
          fields: [
            identifier,
            { name: 'nodeType', label: 'Tipo de nó', type: 'select', default: 'ra3.xlplus', options: ['ra3.xlplus', 'ra3.4xlarge', 'dc2.large'].map((v) => ({ value: v, label: v })) },
            { name: 'nodes', label: 'Número de nós', type: 'number', min: 1, max: 32, default: 1 },
            { name: 'dbName', label: 'Nome do banco', type: 'text', default: 'dev', pattern: '^[a-z][a-z0-9_]{0,63}$' },
            username,
            { ...password, pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[^/"@ \\\\\']{8,64}$', patternHint: '8 a 64 caracteres, com maiúscula, minúscula e número.' },
          ],
          async run(input) {
            const nodes = num(input, 'nodes') ?? 1;
            await redshift().send(
              new CreateClusterCommand({
                ClusterIdentifier: str(input, 'id'),
                NodeType: str(input, 'nodeType') || 'ra3.xlplus',
                ClusterType: nodes > 1 ? 'multi-node' : 'single-node',
                NumberOfNodes: nodes > 1 ? nodes : undefined,
                DBName: optStr(input, 'dbName'),
                MasterUsername: str(input, 'username'),
                MasterUserPassword: withPassword(input),
              }),
            );
            return { id: str(input, 'id') };
          },
        },
        remove: {
          warning: 'O cluster é excluído sem snapshot final.',
          async run(id) {
            await redshift().send(new DeleteClusterCommand({ ClusterIdentifier: id, SkipFinalClusterSnapshot: true }));
          },
        },
        preserve: ['password'],
        async persist(row) {
          return compact({
            id: row.id,
            nodeType: String(row.attrs.nodeType ?? ''),
            nodes: typeof row.attrs.nodes === 'number' ? row.attrs.nodes : undefined,
            dbName: row.attrs.dbName ? String(row.attrs.dbName) : undefined,
            username: String(row.attrs.username ?? 'admin1'),
          });
        },
      },
    ],
  };
}
