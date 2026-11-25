import Alert from '@cloudscape-design/components/alert';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tiles from '@cloudscape-design/components/tiles';
import Wizard from '@cloudscape-design/components/wizard';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iamApi, type GroupSummary, type PolicySummary } from '../../api/iam';
import { errorMessage } from '../../api/http';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { IAM_BREADCRUMB, nameError, userHref, WIZARD_STRINGS } from './iamLinks';
import { GroupPicker } from './IdentityPickers';
import { PolicyPicker } from './PolicyPicker';
import { ReviewList } from './ReviewList';

type PermissionMode = 'groups' | 'policies';

export function CreateUserPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Usuários', href: '/iam/users' }, { text: 'Criar usuário', href: '/iam/create-user' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [mode, setMode] = useState<PermissionMode>('groups');
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const nameProblem = nameError(name, 64);

  const submit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      await iamApi.createUser({
        name,
        groups: mode === 'groups' ? groups.map((g) => g.name) : [],
        policyArns: mode === 'policies' ? policies.map((p) => p.arn) : [],
      });
      notifications.success(`Usuário "${name}" criado.`);
      navigate(userHref(name));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Wizard
      i18nStrings={WIZARD_STRINGS}
      submitButtonText="Criar usuário"
      activeStepIndex={step}
      isLoadingNextStep={submitting}
      onCancel={() => navigate('/iam/users')}
      onSubmit={submit}
      onNavigate={({ detail }) => {
        setTouched(true);
        if (detail.requestedStepIndex > 0 && nameProblem) return;
        setStep(detail.requestedStepIndex);
      }}
      steps={[
        {
          title: 'Especificar detalhes do usuário',
          content: (
            <Container header={<Header variant="h2">Detalhes do usuário</Header>}>
              <FormField
                label="Nome do usuário"
                constraintText="Até 64 caracteres: letras, números e +=,.@_-"
                errorText={touched ? nameProblem : null}
              >
                <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
              </FormField>
            </Container>
          ),
        },
        {
          title: 'Definir permissões',
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Opções de permissões</Header>}>
                <Tiles
                  value={mode}
                  onChange={({ detail }) => setMode(detail.value as PermissionMode)}
                  items={[
                    { value: 'groups', label: 'Adicionar usuário ao grupo', description: 'Recomendado: gerencie permissões por função de trabalho.' },
                    { value: 'policies', label: 'Anexar políticas diretamente', description: 'Anexe políticas gerenciadas ao usuário.' },
                  ]}
                />
              </Container>
              {mode === 'groups' ? (
                <GroupPicker title="Grupos de usuários" selected={groups} onChange={setGroups} />
              ) : (
                <PolicyPicker selected={policies} onChange={setPolicies} />
              )}
            </SpaceBetween>
          ),
        },
        {
          title: 'Revisar e criar',
          content: (
            <SpaceBetween size="l">
              <Container header={<Header variant="h2">Detalhes do usuário</Header>}>
                <KeyValuePairs columns={2} items={[{ label: 'Nome do usuário', value: name }, { label: 'Caminho', value: '/' }]} />
              </Container>
              <Container header={<Header variant="h2">Resumo das permissões</Header>}>
                <ReviewList
                  items={mode === 'groups' ? groups.map((g) => `Grupo: ${g.name}`) : policies.map((p) => `Política: ${p.name}`)}
                />
              </Container>
              {error && <Alert type="error">{error}</Alert>}
            </SpaceBetween>
          ),
        },
      ]}
    />
  );
}
