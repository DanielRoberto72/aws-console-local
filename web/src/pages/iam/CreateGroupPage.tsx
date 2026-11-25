import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iamApi, type PolicySummary, type UserSummary } from '../../api/iam';
import { errorMessage } from '../../api/http';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { groupHref, IAM_BREADCRUMB, nameError } from './iamLinks';
import { UserPicker } from './IdentityPickers';
import { PolicyPicker } from './PolicyPicker';

export function CreateGroupPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Grupos de usuários', href: '/iam/groups' }, { text: 'Criar grupo', href: '/iam/create-group' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [name, setName] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const nameProblem = nameError(name, 128);

  const submit = async () => {
    setTouched(true);
    if (nameProblem || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await iamApi.createGroup({ name, users: users.map((u) => u.name), policyArns: policies.map((p) => p.arn) });
      notifications.success(`Grupo "${name}" criado.`);
      navigate(groupHref(name));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Form
        header={<Header variant="h1">Criar grupo de usuários</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/iam/groups')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar grupo de usuários
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Nomear o grupo</Header>}>
            <FormField label="Nome do grupo de usuários" constraintText="Até 128 caracteres: letras, números e +=,.@_-" errorText={touched ? nameProblem : null}>
              <Input value={name} onChange={({ detail }) => setName(detail.value)} autoFocus />
            </FormField>
          </Container>
          <UserPicker title="Adicionar usuários ao grupo - opcional" selected={users} onChange={setUsers} />
          <PolicyPicker title="Anexar políticas de permissões - opcional" selected={policies} onChange={setPolicies} />
        </SpaceBetween>
      </Form>
    </form>
  );
}
