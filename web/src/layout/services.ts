import type { ServiceMeta } from '../api/catalog';

/** Serviços disponíveis no painel: usado na navegação, na busca e na página inicial. */
export type ServiceId = string;

export interface ServiceEntry {
  id: ServiceId;
  name: string;
  description: string;
  category: string;
  /** Prefixo das rotas do serviço, usado para destacar a navegação. */
  basePath: string;
  links: { text: string; href: string }[];
}

export const CATEGORIES = [
  'Computação',
  'Contêineres',
  'Armazenamento',
  'Banco de dados',
  'Redes e entrega de conteúdo',
  'Análise',
  'Integração de aplicações',
  'Front-end web e mobile',
  'Gerenciamento e governança',
  'Segurança, identidade e conformidade',
  'Machine Learning',
] as const;

/** Serviços com telas próprias; os demais vêm do catálogo do servidor. */
export const STATIC_SERVICES: readonly ServiceEntry[] = [
  { id: 'lambda', name: 'Lambda', description: 'Execute código sem pensar em servidores', category: 'Computação', basePath: '/lambda', links: [{ text: 'Funções', href: '/lambda/functions' }] },
  { id: 's3', name: 'S3', description: 'Armazenamento de objetos', category: 'Armazenamento', basePath: '/s3/', links: [{ text: 'Buckets', href: '/s3/buckets' }] },
  { id: 's3vectors', name: 'S3 Vectors', description: 'Armazenamento e busca de vetores', category: 'Armazenamento', basePath: '/s3vectors', links: [{ text: 'Buckets de vetores', href: '/s3vectors/buckets' }] },
  { id: 'dynamodb', name: 'DynamoDB', description: 'Banco de dados NoSQL gerenciado', category: 'Banco de dados', basePath: '/dynamodb', links: [{ text: 'Tabelas', href: '/dynamodb/tables' }] },
  { id: 'sqs', name: 'Simple Queue Service', description: 'Filas de mensagens gerenciadas', category: 'Integração de aplicações', basePath: '/sqs', links: [{ text: 'Filas', href: '/sqs/queues' }] },
  { id: 'sns', name: 'Simple Notification Service', description: 'Mensagens pub/sub', category: 'Integração de aplicações', basePath: '/sns', links: [{ text: 'Tópicos', href: '/sns/topics' }] },
  {
    id: 'events',
    name: 'EventBridge',
    description: 'Barramento de eventos sem servidor',
    category: 'Integração de aplicações',
    basePath: '/events',
    links: [
      { text: 'Regras', href: '/events/rules' },
      { text: 'Barramentos de eventos', href: '/events/buses' },
      { text: 'Enviar eventos', href: '/events/send' },
    ],
  },
  { id: 'scheduler', name: 'EventBridge Scheduler', description: 'Agendamento de tarefas', category: 'Integração de aplicações', basePath: '/scheduler', links: [{ text: 'Agendamentos', href: '/scheduler/schedules' }] },
  { id: 'stepfunctions', name: 'Step Functions', description: 'Orquestração de fluxos de trabalho', category: 'Integração de aplicações', basePath: '/stepfunctions', links: [{ text: 'Máquinas de estado', href: '/stepfunctions/state-machines' }] },
  { id: 'logs', name: 'CloudWatch Logs', description: 'Logs de aplicações e serviços', category: 'Gerenciamento e governança', basePath: '/logs', links: [{ text: 'Grupos de logs', href: '/logs/groups' }] },
  { id: 'ssm', name: 'Systems Manager', description: 'Parameter Store', category: 'Gerenciamento e governança', basePath: '/ssm', links: [{ text: 'Parameter Store', href: '/ssm/parameters' }] },
  {
    id: 'iam',
    name: 'IAM',
    description: 'Gerencie o acesso aos recursos da AWS',
    category: 'Segurança, identidade e conformidade',
    basePath: '/iam',
    links: [
      { text: 'Painel', href: '/iam/home' },
      { text: 'Grupos de usuários', href: '/iam/groups' },
      { text: 'Usuários', href: '/iam/users' },
      { text: 'Funções', href: '/iam/roles' },
      { text: 'Políticas', href: '/iam/policies' },
    ],
  },
  { id: 'secretsmanager', name: 'Secrets Manager', description: 'Gerenciamento de segredos', category: 'Segurança, identidade e conformidade', basePath: '/secrets', links: [{ text: 'Segredos', href: '/secrets' }] },
  {
    id: 'bedrock',
    name: 'Bedrock',
    description: 'Modelos de base (sem inferência real no emulador)',
    category: 'Machine Learning',
    basePath: '/bedrock',
    links: [
      { text: 'Playground de chat', href: '/bedrock/playground' },
      { text: 'Modelos de base', href: '/bedrock/models' },
    ],
  },
];

export const catalogHref = (service: string, type?: string) => `/c/${service}${type ? `/${type}` : ''}`;
export const catalogToolsHref = (service: string) => `/c/${service}/tools`;

/** Entrada de navegação de um serviço do catálogo: um link por tipo de recurso principal. */
export function catalogEntry(service: ServiceMeta): ServiceEntry {
  const links = service.types.filter((t) => !t.parent && !t.hidden).map((t) => ({ text: t.label, href: catalogHref(service.id, t.key) }));
  if (service.tools.length) links.push({ text: links.length ? 'Ferramentas' : 'Experimentar', href: catalogToolsHref(service.id) });
  return { id: service.id, name: service.name, description: service.description, category: service.category, basePath: `/c/${service.id}/`, links };
}

/** Une os serviços com telas próprias aos do catálogo, em ordem alfabética dentro da categoria. */
export function mergeServices(catalog: readonly ServiceMeta[]): ServiceEntry[] {
  return [...STATIC_SERVICES, ...catalog.map(catalogEntry)].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export const ACCOUNT_ID = '000000000000';
export const REGION = 'us-east-1';
