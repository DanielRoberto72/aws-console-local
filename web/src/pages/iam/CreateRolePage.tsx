import Alert from '@cloudscape-design/components/alert';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import Tiles from '@cloudscape-design/components/tiles';
import Wizard from '@cloudscape-design/components/wizard';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iamApi, type PolicySummary } from '../../api/iam';
import { errorMessage } from '../../api/http';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import {
  ACCOUNT_ROOT,
  IAM_BREADCRUMB,
  nameError,
  roleHref,
  TRUSTED_SERVICES,
  trustPolicyForAccount,
  trustPolicyForService,
  WIZARD_STRINGS,
} from './iamLinks';
import { PolicyPicker } from './PolicyPicker';
import { ReviewList } from './ReviewList';

type TrustedEntity = 'service' | 'account' | 'custom';

export function CreateRolePage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Funções', href: '/iam/roles' }, { text: 'Criar função', href: '/iam/create-role' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState<TrustedEntity>('service');
  const [service, setService] = useState(TRUSTED_SERVICES[0]!);
  const [account, setAccount] = useState(ACCOUNT_ROOT);
  const [customTrust, setCustomTrust] = useState(trustPolicyForService(TRUSTED_SERVICES[0]!.value));
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touchedName, setTouchedName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const trustPolicy =
    entity === 'service' ? trustPolicyForService(service.value) : entity === 'account' ? trustPolicyForAccount(account.trim()) : customTrust;
  const trustError = entity === 'custom' ? jsonError(customTrust, true) : entity === 'account' && !account.trim() ? 'Informe o ARN da conta ou entidade.' : null;
  const nameProblem = nameError(name, 64);

  const submit = async () => {
    setTouchedName(true);
    if (nameProblem || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await iamApi.createRole({ name, description, trustPolicy, policyArns: policies.map((p) => p.arn) });
      notifications.success(`Função "${name}" criada.`);
      navigate(roleHref(name));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Wizard
      i18nStrings={WIZARD_STRINGS}
      submitButtonText="Criar função"
      activeStepIndex={step}
      isLoadingNextStep={submitting}
      onCancel={() => navigate('/iam/roles')}
      onSubmit={submit}
      onNavigate={({ detail }) => {
        if (detail.requestedStepIndex > 0 && trustError) return;
        setStep(detail.requestedStepIndex);
      }}
      steps={[
        {
          title: 'Selecionar entidade confiável',
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Tipo de entidade confiável</Header>}>
                <Tiles
                  value={entity}
                  onChange={({ detail }) => setEntity(detail.value as TrustedEntity)}
                  columns={3}
                  items={[
                    { value: 'service', label: 'Serviço da AWS', description: 'Permita que serviços como Lambda ou Step Functions executem ações nesta conta.' },
                    { value: 'account', label: 'Conta da AWS', description: 'Permita que entidades de uma conta assumam esta função.' },
                    { value: 'custom', label: 'Política de confiança personalizada', description: 'Escreva a política de confiança em JSON.' },
                  ]}
                />
              </Container>
              {entity === 'service' && (
                <Container header={<Header variant="h2">Caso de uso</Header>}>
                  <FormField label="Serviço ou caso de uso">
                    <Select
                      selectedOption={service}
                      options={TRUSTED_SERVICES}
                      filteringType="auto"
                      onChange={({ detail }) => setService(TRUSTED_SERVICES.find((s) => s.value === detail.selectedOption.value)!)}
                    />
                  </FormField>
                </Container>
              )}
              {entity === 'account' && (
                <Container header={<Header variant="h2">Conta da AWS</Header>}>
                  <FormField label="ARN da conta ou entidade" description="Por padrão, esta conta." errorText={trustError}>
                    <Input value={account} onChange={({ detail }) => setAccount(detail.value)} />
                  </FormField>
                </Container>
              )}
              {entity === 'custom' && (
                <Container header={<Header variant="h2">Política de confiança personalizada</Header>}>
                  <FormField errorText={trustError} stretch>
                    <CodeArea value={customTrust} onChange={setCustomTrust} rows={14} ariaLabel="Política de confiança" />
                  </FormField>
                </Container>
              )}
            </SpaceBetween>
          ),
        },
        {
          title: 'Adicionar permissões',
          isOptional: true,
          content: <PolicyPicker selected={policies} onChange={setPolicies} />,
        },
        {
          title: 'Nomear, revisar e criar',
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Detalhes da função</Header>}>
                <SpaceBetween size="m">
                  <FormField label="Nome da função" constraintText="Até 64 caracteres: letras, números e +=,.@_-" errorText={touchedName ? nameProblem : null}>
                    <Input value={name} onChange={({ detail }) => setName(detail.value)} onBlur={() => setTouchedName(true)} />
                  </FormField>
                  <FormField label="Descrição - opcional">
                    <Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} rows={2} />
                  </FormField>
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2">Etapa 1: selecionar entidades confiáveis</Header>}>
                <CodeArea value={trustPolicy} readOnly rows={10} ariaLabel="Política de confiança" />
              </Container>
              <Container header={<Header variant="h2">Etapa 2: adicionar permissões</Header>}>
                <ReviewList items={policies.map((p) => p.name)} />
              </Container>
              {error && <Alert type="error">{error}</Alert>}
            </SpaceBetween>
          ),
        },
      ]}
    />
  );
}
