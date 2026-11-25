import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { iamApi } from '../../api/iam';
import { LoadError } from '../../components/ErrorAlert';
import { formatNumber } from '../../components/format';
import { useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs, useFollow } from '../../layout/ConsoleLayout';
import { ACCOUNT_ID } from '../../layout/services';
import { IAM_BREADCRUMB } from './iamLinks';

const RESOURCES = [
  { key: 'Groups', label: 'Grupos de usuários', href: '/iam/groups' },
  { key: 'Users', label: 'Usuários', href: '/iam/users' },
  { key: 'Roles', label: 'Funções', href: '/iam/roles' },
  { key: 'Policies', label: 'Políticas gerenciadas pelo cliente', href: '/iam/policies' },
] as const;

export function IamDashboardPage() {
  useBreadcrumbs([IAM_BREADCRUMB, { text: 'Painel', href: '/iam/home' }]);
  const follow = useFollow();
  const summary = useRemote((signal) => iamApi.summary(signal), []);

  if (summary.error) return <LoadError error={summary.error} onRetry={summary.reload} />;
  if (!summary.data) return <Spinner size="large" />;
  const counts = summary.data.summary;

  return (
    <ContentLayout header={<Header variant="h1">Painel do IAM</Header>}>
      <SpaceBetween size="l">
        <Alert type="info" header="Autenticação desligada no emulador">
          O emulador roda sem verificar assinaturas: toda chamada é feita como o usuário <b>emulator</b>, e as políticas
          não bloqueiam nada. Use o IAM aqui para criar as funções e políticas que o seu código espera encontrar.
        </Alert>
        <Container header={<Header variant="h2">Recursos do IAM</Header>}>
          <ColumnLayout columns={4} variant="text-grid">
            {RESOURCES.map((resource) => (
              <div key={resource.key}>
                <Box variant="awsui-key-label">{resource.label}</Box>
                <Link variant="awsui-value-large" href={resource.href} onFollow={follow}>
                  {formatNumber(counts[resource.key] ?? 0)}
                </Link>
              </div>
            ))}
          </ColumnLayout>
        </Container>
        <Container header={<Header variant="h2">Conta da AWS</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'ID da conta', value: ACCOUNT_ID },
              { label: 'Alias da conta', value: '-' },
              { label: 'Usuário atual', value: `arn:aws:iam::${ACCOUNT_ID}:user/emulator` },
            ]}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
