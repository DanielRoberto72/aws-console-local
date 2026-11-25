import Alert from '@cloudscape-design/components/alert';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import Wizard from '@cloudscape-design/components/wizard';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iamApi } from '../../api/iam';
import { errorMessage } from '../../api/http';
import { CodeArea, jsonError } from '../../components/CodeArea';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { IAM_BREADCRUMB, nameError, POLICY_TEMPLATE, policyHref, WIZARD_STRINGS } from './iamLinks';

export function CreatePolicyPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Políticas', href: '/iam/policies' }, { text: 'Criar política', href: '/iam/create-policy' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [step, setStep] = useState(0);
  const [document, setDocument] = useState(POLICY_TEMPLATE);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touchedName, setTouchedName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const documentError = jsonError(document, true);
  const nameProblem = nameError(name, 128);

  const submit = async () => {
    setTouchedName(true);
    if (nameProblem || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const { arn } = await iamApi.createPolicy({ name, description, document });
      notifications.success(`Política "${name}" criada.`);
      navigate(policyHref(arn));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Wizard
      i18nStrings={WIZARD_STRINGS}
      submitButtonText="Criar política"
      activeStepIndex={step}
      isLoadingNextStep={submitting}
      onCancel={() => navigate('/iam/policies')}
      onSubmit={submit}
      onNavigate={({ detail }) => {
        if (detail.requestedStepIndex > 0 && documentError) return;
        setStep(detail.requestedStepIndex);
      }}
      steps={[
        {
          title: 'Especificar permissões',
          description: 'Escreva o documento da política em JSON.',
          content: (
            <Container header={<Header variant="h2">Editor de políticas</Header>}>
              <FormField errorText={documentError} stretch>
                <CodeArea value={document} onChange={setDocument} rows={20} ariaLabel="Documento da política" />
              </FormField>
            </Container>
          ),
        },
        {
          title: 'Revisar e criar',
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Detalhes da política</Header>}>
                <SpaceBetween size="m">
                  <FormField label="Nome da política" constraintText="Até 128 caracteres: letras, números e +=,.@_-" errorText={touchedName ? nameProblem : null}>
                    <Input value={name} onChange={({ detail }) => setName(detail.value)} onBlur={() => setTouchedName(true)} autoFocus />
                  </FormField>
                  <FormField label="Descrição - opcional">
                    <Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} rows={2} />
                  </FormField>
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2">Permissões definidas nesta política</Header>}>
                <CodeArea value={document} readOnly rows={12} ariaLabel="Documento da política" />
              </Container>
              {error && <Alert type="error">{error}</Alert>}
            </SpaceBetween>
          ),
        },
      ]}
    />
  );
}
