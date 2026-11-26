import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { emulatorApi } from '../../api/emulator';
import { useRemote } from '../../hooks/useRemote';
import { useFidelity } from '../../layout/fidelity';
import { FidelityChanges } from './FidelityChanges';

const UPDATE_COMMAND = 'scripts/update-emulator.sh';
const ROLLBACK_COMMAND = 'scripts/update-emulator.sh --rollback';

/** Versão do emulador em uso, a mais recente publicada e o estado das notas de fidelidade. */
export function EmulatorVersion() {
  const status = useRemote((signal) => emulatorApi.status(signal), []);
  const { overview } = useFidelity();
  const data = status.data;
  if (!data) return status.error ? <StatusIndicator type="warning">Versão do emulador indisponível</StatusIndicator> : null;

  return (
    <SpaceBetween size="s">
      <KeyValuePairs
        columns={2}
        items={[
          { label: 'Versão do emulador', value: data.installed ? data.installed.version : 'Desconhecida' },
          {
            label: 'Mais recente',
            value: data.latest ? (
              <Link external href={`${data.releasesUrl}/tag/v${data.latest.version}`}>
                {data.latest.version}
              </Link>
            ) : (
              <StatusIndicator type="warning">Não consultada</StatusIndicator>
            ),
          },
        ]}
      />
      {data.latestError && <Box variant="small">{data.latestError}</Box>}
      {overview?.status === 'unavailable' && <Box variant="small">Notas de fidelidade indisponíveis: {overview.reason}</Box>}
      {data.updateAvailable && data.installed && data.latest && (
        <Alert type="info" header={`Versão ${data.latest.version} disponível`}>
          <SpaceBetween size="xs">
            <span>
              Em uso: {data.installed.version}. Para atualizar, rode na pasta do projeto (o estado salvo é recriado no emulador novo):
            </span>
            <pre className="log-output">{UPDATE_COMMAND}</pre>
            <span>
              O script guarda a imagem atual. Se a versão nova der problema, volte com <code>{ROLLBACK_COMMAND}</code>.
            </span>
            <FidelityChanges />
          </SpaceBetween>
        </Alert>
      )}
    </SpaceBetween>
  );
}
