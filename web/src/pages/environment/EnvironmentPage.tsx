import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useEffect, useState, type ReactNode } from 'react';
import { environmentApi, EXPORT_URL, type LabTemplate } from '../../api/environment';
import { overviewApi } from '../../api/overview';
import { DeleteModal } from '../../components/DeleteModal';
import { LoadError } from '../../components/ErrorAlert';
import { usePolling, useRemote } from '../../hooks/useRemote';
import { useBreadcrumbs } from '../../layout/ConsoleLayout';
import { useNotifications } from '../../layout/notifications';
import { useServiceDirectory } from '../../layout/serviceDirectory';
import { replacementProgress, type Replacement } from './replacement';

const POLL_MS = 2_000;

interface Confirmation {
  title: string;
  description: ReactNode;
  confirmationText: string;
  actionLabel: string;
  /** Texto da notificação de sucesso quando o emulador terminar de reiniciar. */
  done: string;
  run: () => Promise<unknown>;
}

const REPLACE_WARNING =
  'Tudo o que existe hoje no emulador e no banco será apagado. O emulador reinicia e recebe o novo ambiente em alguns segundos. A atividade recente e os endpoints locais são mantidos.';

function resourcesText(resources: Record<string, number>, serviceName: (id: string) => string): string {
  return Object.entries(resources)
    .filter(([service]) => service !== 'iam')
    .map(([service, count]) => `${serviceName(service)} (${count})`)
    .join(', ');
}

/** Exportar, importar, carregar modelos e reiniciar o ambiente inteiro do emulador. */
export function EnvironmentPage() {
  useBreadcrumbs([
    { text: 'Console', href: '/' },
    { text: 'Ambiente', href: '/environment' },
  ]);
  const notifications = useNotifications();
  const { serviceName } = useServiceDirectory();
  const status = useRemote((signal) => environmentApi.status(signal), []);
  const templates = useRemote((signal) => environmentApi.templates(signal), []);
  const sync = useRemote((signal) => overviewApi.status(signal), []);
  const [file, setFile] = useState<File[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [replacement, setReplacement] = useState<Replacement | null>(null);

  const progress = replacement && sync.data ? replacementProgress(replacement, sync.data) : null;
  usePolling(sync.reload, POLL_MS, replacement !== null);
  useEffect(() => {
    if (progress !== 'done' || !replacement) return;
    notifications.success(replacement.done);
    setReplacement(null);
  }, [progress, replacement, notifications]);

  const canReplace = status.data?.canReplace ?? false;
  const busy = replacement !== null;

  const confirm = (c: Confirmation) => setConfirmation(c);
  const runConfirmed = async () => {
    if (!confirmation) return;
    const previousRestoreAt = (await overviewApi.status()).lastRestoreAt;
    await confirmation.run();
    setReplacement({ previousRestoreAt, done: confirmation.done });
    setFile([]);
    sync.reload();
  };

  const importFile = file[0];

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Guarde o ambiente num arquivo, compartilhe, comece de um modelo pronto ou volte ao zero.">
          Ambiente
        </Header>
      }
    >
      <SpaceBetween size="l">
        {status.error ? <LoadError error={status.error} onRetry={status.reload} /> : null}
        {status.data && !canReplace && (
          <Alert type="warning" header="Importar, carregar modelos e reiniciar estão indisponíveis">
            {status.data.reason}
          </Alert>
        )}
        {replacement && (
          <Alert type="info" header="Trocando o ambiente">
            <StatusIndicator type="in-progress">
              {progress === 'restoring' ? 'Recriando os recursos no emulador' : 'Reiniciando o emulador'}
            </StatusIndicator>
          </Alert>
        )}

        <Container
          header={
            <Header
              variant="h2"
              description="Arquivo .json.gz com tudo o que o console guarda: recursos, código das funções, objetos do S3 e itens do DynamoDB."
              actions={
                <Button iconName="download" href={EXPORT_URL} download>
                  Exportar ambiente
                </Button>
              }
            >
              Exportar
            </Header>
          }
        >
          <Box variant="p">
            O arquivo inclui valores de segredos, parâmetros e senhas guardados pelo console. Compartilhe só com quem pode vê-los.
          </Box>
        </Container>

        <Container header={<Header variant="h2" description="Substitui o ambiente atual pelo de um arquivo exportado por este console.">Importar</Header>}>
          <SpaceBetween size="m">
            <FormField label="Arquivo de ambiente" constraintText="Arquivo .json.gz ou .json, até 200 MB.">
              <FileUpload
                value={file}
                onChange={({ detail }) => setFile(detail.value)}
                accept=".gz,.json,application/gzip,application/json"
                showFileSize
                i18nStrings={{
                  uploadButtonText: () => 'Escolher arquivo',
                  dropzoneText: () => 'Solte o arquivo aqui',
                  removeFileAriaLabel: () => 'Remover arquivo',
                  errorIconAriaLabel: 'Erro',
                  warningIconAriaLabel: 'Aviso',
                }}
              />
            </FormField>
            <Button
              disabled={!importFile || !canReplace || busy}
              onClick={() =>
                importFile &&
                confirm({
                  title: 'Importar ambiente',
                  description: (
                    <>
                      Importar <b>{importFile.name}</b>? {REPLACE_WARNING}
                    </>
                  ),
                  confirmationText: 'importar',
                  actionLabel: 'Importar',
                  done: `Ambiente importado de ${importFile.name}.`,
                  run: () => environmentApi.import(importFile),
                })
              }
            >
              Importar
            </Button>
          </SpaceBetween>
        </Container>

        <Cards<LabTemplate>
          header={
            <Header variant="h2" counter={templates.data ? `(${templates.data.templates.length})` : undefined} description="Cenários prontos para praticar. Carregar um modelo substitui o ambiente atual.">
              Modelos de laboratório
            </Header>
          }
          loading={templates.loading}
          loadingText="Carregando modelos"
          items={templates.data?.templates ?? []}
          trackBy="id"
          cardDefinition={{
            header: (t) => t.title,
            sections: [
              { id: 'description', content: (t) => t.description },
              { id: 'resources', header: 'Recursos', content: (t) => resourcesText(t.resources, serviceName) },
              {
                id: 'load',
                content: (t) => (
                  <Button
                    disabled={!canReplace || busy}
                    ariaLabel={`Carregar o modelo ${t.title}`}
                    onClick={() =>
                      confirm({
                        title: 'Carregar modelo',
                        description: (
                          <>
                            Carregar o modelo <b>{t.title}</b>? {REPLACE_WARNING}
                          </>
                        ),
                        confirmationText: 'carregar',
                        actionLabel: 'Carregar modelo',
                        done: `Modelo ${t.title} carregado.`,
                        run: () => environmentApi.loadTemplate(t.id),
                      })
                    }
                  >
                    Carregar
                  </Button>
                ),
              },
            ],
          }}
          cardsPerRow={[{ cards: 1 }, { minWidth: 700, cards: 3 }]}
          empty={templates.error ? <LoadError error={templates.error} onRetry={templates.reload} /> : 'Nenhum modelo disponível.'}
        />

        <Container header={<Header variant="h2" description="Apaga todos os recursos do emulador e tudo o que o console guardou deles.">Reiniciar o ambiente</Header>}>
          <SpaceBetween size="m">
            <Box variant="p">Exporte o ambiente antes se quiser voltar a ele depois.</Box>
            <Button
              disabled={!canReplace || busy}
              onClick={() =>
                confirm({
                  title: 'Reiniciar o ambiente',
                  description: <>Começar do zero? {REPLACE_WARNING}</>,
                  confirmationText: 'reiniciar',
                  actionLabel: 'Reiniciar ambiente',
                  done: 'Ambiente reiniciado. O emulador está vazio.',
                  run: () => environmentApi.reset(),
                })
              }
            >
              Reiniciar ambiente
            </Button>
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      <DeleteModal
        visible={confirmation !== null}
        title={confirmation?.title ?? ''}
        description={confirmation?.description}
        confirmationText={confirmation?.confirmationText ?? ''}
        actionLabel={confirmation?.actionLabel}
        onConfirm={runConfirmed}
        onDismiss={() => setConfirmation(null)}
      />
    </ContentLayout>
  );
}
