import Box from '@cloudscape-design/components/box';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Spinner from '@cloudscape-design/components/spinner';
import Table from '@cloudscape-design/components/table';
import { emulatorApi, type ScoreChange } from '../../api/emulator';
import { useRemote } from '../../hooks/useRemote';
import { useServiceDirectory } from '../../layout/serviceDirectory';
import { changeText, formatPercent } from './fidelityFormat';

/** Notas que mudam ao atualizar o emulador, para decidir se vale atualizar agora. */
export function FidelityChanges() {
  const remote = useRemote((signal) => emulatorApi.fidelityChange(signal), []);
  const { serviceName } = useServiceDirectory();
  const data = remote.data;
  if (remote.loading && !data) return <Spinner />;
  if (!data) return null;
  if (data.status !== 'ok') return <Box variant="small">Mudanças nas notas indisponíveis: {data.reason}</Box>;

  const improved = data.changes.filter((c) => (c.after ?? 0) > (c.before ?? 0)).length;
  const worse = data.changes.length - improved;
  const header = data.changes.length
    ? `Notas que mudam na ${data.to}: ${improved} melhoram, ${worse} pioram`
    : `Nenhuma nota muda na ${data.to}`;

  return (
    <ExpandableSection headerText={header} variant="footer">
      <Table<ScoreChange>
        variant="embedded"
        items={data.changes}
        trackBy="service"
        columnDefinitions={[
          { id: 'service', header: 'Serviço', cell: (c) => serviceName(c.service) },
          { id: 'before', header: data.from, cell: (c) => formatPercent(c.before) },
          { id: 'after', header: data.to, cell: (c) => formatPercent(c.after) },
          { id: 'change', header: 'Diferença', cell: (c) => changeText(c.before, c.after) },
        ]}
        empty="As notas dos serviços do console são as mesmas nas duas versões."
      />
    </ExpandableSection>
  );
}
