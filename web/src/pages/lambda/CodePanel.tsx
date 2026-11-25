import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useEffect, useState } from 'react';
import { lambdaApi, type FunctionDetail, type SourceFile } from '../../api/lambda';
import { CodeArea } from '../../components/CodeArea';
import { FormModal } from '../../components/FormModal';
import { useAction } from '../../hooks/useAction';
import { useNotifications } from '../../layout/notifications';

/** Lê um arquivo do navegador como base64 (sem o prefixo data:). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CodePanel({ fn, onDeployed }: { fn: FunctionDetail; onDeployed: () => void }) {
  const notifications = useNotifications();
  const deploy = useAction();
  const [files, setFiles] = useState<SourceFile[]>(fn.files);
  const [current, setCurrent] = useState(fn.files[0]?.name ?? '');
  const [modal, setModal] = useState<'add' | 'zip' | null>(null);
  const [newName, setNewName] = useState('');
  const [zip, setZip] = useState<File[]>([]);

  // Recarrega o editor quando um novo pacote é implantado.
  useEffect(() => {
    setFiles(fn.files);
    setCurrent((name) => (fn.files.some((f) => f.name === name) ? name : (fn.files[0]?.name ?? '')));
  }, [fn.codeSha256, fn.files]);

  const file = files.find((f) => f.name === current);
  const dirty = JSON.stringify(files) !== JSON.stringify(fn.files);
  const nameTaken = files.some((f) => f.name === newName.trim());

  const updateContent = (content: string) => setFiles((all) => all.map((f) => (f.name === current ? { ...f, content } : f)));

  const deployFiles = () =>
    deploy.run(
      async () => {
        await lambdaApi.updateCode(fn.summary.name, { files });
        onDeployed();
      },
      'Código implantado.',
      'Falha ao implantar o código',
    );

  return (
    <Container
      header={
        <Header
          variant="h2"
          description={dirty ? 'Há alterações não implantadas.' : 'Código atual da função.'}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setModal('zip')}>Carregar .zip</Button>
              <Button onClick={() => setModal('add')}>Novo arquivo</Button>
              <Button
                disabled={files.length <= 1 || !file}
                onClick={() => {
                  setFiles((all) => all.filter((f) => f.name !== current));
                  setCurrent(files.find((f) => f.name !== current)?.name ?? '');
                }}
              >
                Remover arquivo
              </Button>
              <Button variant="primary" disabled={!dirty || files.length === 0} loading={deploy.running} onClick={deployFiles}>
                Implantar
              </Button>
            </SpaceBetween>
          }
        >
          Origem do código
        </Header>
      }
    >
      <SpaceBetween size="m">
        {fn.skippedFiles.length > 0 && (
          <Alert type="warning" header="Arquivos não exibidos">
            O pacote tem arquivos binários ou grandes ({fn.skippedFiles.slice(0, 5).join(', ')}
            {fn.skippedFiles.length > 5 ? '…' : ''}). Implantar pelo editor gera um pacote só com os arquivos abaixo; para
            mantê-los, use "Carregar .zip".
          </Alert>
        )}
        <FormField label="Arquivo">
          <Select
            selectedOption={file ? { value: file.name, label: file.name } : null}
            onChange={({ detail }) => setCurrent(detail.selectedOption.value!)}
            options={files.map((f) => ({ value: f.name, label: f.name }))}
            empty="Nenhum arquivo"
          />
        </FormField>
        {file && <CodeArea value={file.content} onChange={updateContent} rows={22} ariaLabel={`Conteúdo de ${file.name}`} />}
      </SpaceBetween>

      <FormModal
        visible={modal === 'add'}
        title="Novo arquivo"
        submitLabel="Adicionar"
        canSubmit={!!newName.trim() && !nameTaken}
        onSubmit={async () => {
          const name = newName.trim();
          setFiles((all) => [...all, { name, content: '' }]);
          setCurrent(name);
          setNewName('');
        }}
        onDismiss={() => setModal(null)}
      >
        <FormField label="Nome do arquivo" description="Pode incluir pastas, como utils/helpers.py." errorText={nameTaken ? 'Já existe um arquivo com esse nome.' : null}>
          <Input value={newName} onChange={({ detail }) => setNewName(detail.value)} autoFocus />
        </FormField>
      </FormModal>

      <FormModal
        visible={modal === 'zip'}
        title="Carregar pacote .zip"
        submitLabel="Implantar"
        canSubmit={zip.length === 1}
        onSubmit={async () => {
          await lambdaApi.updateCode(fn.summary.name, { zipBase64: await readAsBase64(zip[0]!) });
          notifications.success('Pacote implantado.');
          setZip([]);
          onDeployed();
        }}
        onDismiss={() => setModal(null)}
      >
        <FormField label="Arquivo .zip" constraintText="Até 50 MB, como no upload direto do Lambda.">
          <FileUpload
            value={zip}
            onChange={({ detail }) => setZip(detail.value)}
            accept=".zip"
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
      </FormModal>
    </Container>
  );
}
