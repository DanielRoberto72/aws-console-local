import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/http';
import { s3Api } from '../../api/s3';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { validateBucketName } from './bucketName';
import { S3_BREADCRUMB } from './BucketsPage';

export function CreateBucketPage() {
  useBreadcrumbs([S3_BREADCRUMB, { text: 'Buckets', href: '/s3/buckets' }, { text: 'Criar bucket', href: '/s3/create-bucket' }]);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const validation = validateBucketName(name);

  const submit = async () => {
    setTouched(true);
    if (validation || submitting) return;
    setSubmitting(true);
    setServerError(undefined);
    try {
      await s3Api.createBucket(name);
      notifications.success(`Bucket "${name}" criado.`);
      navigate('/s3/buckets');
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Form
        header={<Header variant="h1" description="Buckets são contêineres para dados armazenados no S3.">Criar bucket</Header>}
        errorText={serverError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => navigate('/s3/buckets')}>
              Cancelar
            </Button>
            <Button variant="primary" loading={submitting}>
              Criar bucket
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Configuração geral</Header>}>
          <SpaceBetween size="l">
            <FormField label="Região da AWS">
              <Input value="Leste dos EUA (Norte da Virgínia) us-east-1" disabled />
            </FormField>
            <FormField
              label="Nome do bucket"
              description="Os nomes de bucket devem ser exclusivos."
              constraintText="Entre 3 e 63 caracteres: letras minúsculas, números, pontos e hifens."
              errorText={touched ? validation : null}
            >
              <Input
                value={name}
                onChange={({ detail }) => setName(detail.value)}
                onBlur={() => setTouched(true)}
                placeholder="meu-bucket"
                autoFocus
              />
            </FormField>
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
