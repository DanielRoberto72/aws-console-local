import Box from '@cloudscape-design/components/box';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import HelpPanel from '@cloudscape-design/components/help-panel';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { emulatorApi, type FailureGroup, type Tally } from '../../api/emulator';
import { LoadError } from '../../components/ErrorAlert';
import { formatDate } from '../../components/format';
import { useRemote } from '../../hooks/useRemote';
import { FidelityBadge } from './FidelityBadge';
import { behaviorLabel, FIDELITY_BANDS, formatPercent, tallyScore } from './fidelityFormat';

/** Quantos itens de cada lista aparecem; o restante é resumido numa contagem. */
const LIST_LIMIT = 15;

const testsText = ({ passed, failed }: Tally) => `${formatPercent(tallyScore({ passed, failed }))} de ${passed + failed} testes`;

function FailureList({ groups, label }: { groups: FailureGroup[]; label: (name: string) => React.ReactNode }) {
  if (!groups.length) return <StatusIndicator type="success">Nenhuma falha</StatusIndicator>;
  const hidden = groups.slice(LIST_LIMIT).reduce((sum, g) => sum + g.failed, 0);
  return (
    <SpaceBetween size="xxs">
      <ul className="fidelity-list">
        {groups.slice(0, LIST_LIMIT).map((g) => (
          <li key={g.name}>
            {label(g.name)}
            {g.failed > 1 && <Box variant="small" display="inline"> ({g.failed} testes)</Box>}
          </li>
        ))}
      </ul>
      {groups.length > LIST_LIMIT && (
        <Box variant="small">
          E mais {groups.length - LIST_LIMIT} itens ({hidden} testes).
        </Box>
      )}
    </SpaceBetween>
  );
}

function BehaviorName({ id }: { id: string }) {
  const { title, services } = behaviorLabel(id);
  return (
    <>
      <code className="wrap-anywhere">{title}</code>
      {services.length > 1 && <Box variant="small" display="block">{services.join(', ')}</Box>}
    </>
  );
}

/** Painel lateral "i" do console com a fidelidade do serviço aberto. */
export function FidelityPanel({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const remote = useRemote((signal) => emulatorApi.serviceFidelity(serviceId, signal), [serviceId]);
  const data = remote.data;

  const header = <h2>Fidelidade no emulador</h2>;
  if (remote.error) return <HelpPanel header={header}><LoadError error={remote.error} onRetry={remote.reload} /></HelpPanel>;
  if (!data) return <HelpPanel header={header}><Spinner /></HelpPanel>;
  if (data.status !== 'ok') {
    return (
      <HelpPanel header={header}>
        <StatusIndicator type="info">{data.reason}</StatusIndicator>
      </HelpPanel>
    );
  }

  const { service } = data;
  return (
    <HelpPanel
      header={header}
      footer={
        <SpaceBetween size="xxs">
          <Box variant="small">
            AWS Emulator {data.version}
            {data.scoredAt ? `, notas de ${formatDate(data.scoredAt)}` : ''}.
          </Box>
          <Link external href={data.releaseUrl}>
            Notas desta versão no GitHub
          </Link>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="m">
        <SpaceBetween size="xs" direction="horizontal" alignItems="center">
          <Box variant="h3" padding="n">
            {serviceName}
          </Box>
          <FidelityBadge summary={service} />
        </SpaceBetween>
        <p>
          Fração dos testes do AWS Emulator em que o serviço responde como a AWS. A nota mede o serviço inteiro no emulador,
          inclusive operações que este console não usa.
        </p>
        <KeyValuePairs
          columns={1}
          items={[
            { label: 'Formato das respostas', value: testsText(service.wire) },
            { label: 'Comportamento', value: testsText(service.behavioral) },
            ...(service.skipped ? [{ label: 'Testes ignorados', value: String(service.skipped) }] : []),
          ]}
        />
        <ExpandableSection headerText={`Operações com formato diferente (${service.wireFailures.length})`}>
          <FailureList groups={service.wireFailures} label={(name) => <code>{name}</code>} />
        </ExpandableSection>
        <ExpandableSection headerText={`Comportamentos diferentes (${service.behavioralFailures.length})`}>
          <FailureList groups={service.behavioralFailures} label={(name) => <BehaviorName id={name} />} />
        </ExpandableSection>
        <Box variant="small">
          Cores: verde a partir de {FIDELITY_BANDS.high * 100}%, azul a partir de {FIDELITY_BANDS.medium * 100}%, vermelho abaixo
          disso. As faixas são deste console, não da AWS.
        </Box>
      </SpaceBetween>
    </HelpPanel>
  );
}
