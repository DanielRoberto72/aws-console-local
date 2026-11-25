import type { PolicyType } from '../../api/iam';

export const IAM_BREADCRUMB = { text: 'IAM', href: '/iam/home' };

const enc = encodeURIComponent;
export const userHref = (name: string) => `/iam/users/${enc(name)}`;
export const groupHref = (name: string) => `/iam/groups/${enc(name)}`;
export const roleHref = (name: string) => `/iam/roles/${enc(name)}`;
// O ARN de uma política tem "/", por isso vai na query string.
export const policyHref = (arn: string) => `/iam/policy?arn=${enc(arn)}`;

export const POLICY_TYPE_LABELS: Record<PolicyType | 'inline', string> = {
  aws: 'Gerenciada pela AWS',
  customer: 'Gerenciada pelo cliente',
  inline: 'Em linha do cliente',
};

/** Regras de nome do IAM: letras, números e +=,.@_- */
export const IAM_NAME = /^[\w+=,.@-]+$/;

export function nameError(name: string, max: number): string | null {
  if (!name) return 'Informe um nome.';
  if (name.length > max) return `Até ${max} caracteres.`;
  return IAM_NAME.test(name) ? null : 'Use apenas letras, números e +=,.@_-';
}

/** Modelo inicial do editor de políticas, como o do console. */
export const POLICY_TEMPLATE = JSON.stringify(
  { Version: '2012-10-17', Statement: [{ Sid: 'Statement1', Effect: 'Allow', Action: [], Resource: [] }] },
  null,
  2,
);

export const ACCOUNT_ROOT = 'arn:aws:iam::000000000000:root';

export function trustPolicyForService(service: string): string {
  return JSON.stringify(
    { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: service }, Action: 'sts:AssumeRole' }] },
    null,
    2,
  );
}

export function trustPolicyForAccount(principal: string): string {
  return JSON.stringify(
    { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { AWS: principal }, Action: 'sts:AssumeRole' }] },
    null,
    2,
  );
}

/** Serviços oferecidos como entidade confiável na criação de funções. */
export const TRUSTED_SERVICES = [
  { value: 'lambda.amazonaws.com', label: 'Lambda' },
  { value: 'states.amazonaws.com', label: 'Step Functions' },
  { value: 'scheduler.amazonaws.com', label: 'EventBridge Scheduler' },
  { value: 'events.amazonaws.com', label: 'EventBridge' },
  { value: 'sns.amazonaws.com', label: 'SNS' },
  { value: 'apigateway.amazonaws.com', label: 'API Gateway' },
  { value: 'ec2.amazonaws.com', label: 'EC2' },
  { value: 'ecs-tasks.amazonaws.com', label: 'Elastic Container Service (tarefas)' },
  { value: 'bedrock.amazonaws.com', label: 'Bedrock' },
];

export const WIZARD_STRINGS = {
  stepNumberLabel: (n: number) => `Etapa ${n}`,
  collapsedStepsLabel: (n: number, total: number) => `Etapa ${n} de ${total}`,
  skipToButtonLabel: (step: { title: string }) => `Ir para ${step.title}`,
  navigationAriaLabel: 'Etapas',
  cancelButton: 'Cancelar',
  previousButton: 'Anterior',
  nextButton: 'Próximo',
  optional: 'opcional',
};
