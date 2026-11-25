import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import type { ActionResult } from '../../api/catalog';
import { CodeArea } from '../../components/CodeArea';

const MAX_RENDERED_TEXT = 200_000;

interface TableRow {
  index: number;
  cells: (string | number | null)[];
}

/** Exibe o resultado de uma ação ou ferramenta no formato que ela declarou. */
export function ActionResultView({ result }: { result: ActionResult }) {
  switch (result.kind) {
    case 'message':
      return <Alert type="success">{result.text}</Alert>;
    case 'text':
      return (
        <SpaceBetween size="xs">
          <Box float="right">
            <CopyToClipboard variant="icon" textToCopy={result.text} copySuccessText="Copiado" copyErrorText="Falha ao copiar" />
          </Box>
          <CodeArea value={result.text.slice(0, MAX_RENDERED_TEXT)} readOnly rows={Math.min(16, result.text.split('\n').length + 1)} ariaLabel="Resultado" />
        </SpaceBetween>
      );
    case 'json': {
      const text = JSON.stringify(result.value, null, 2) ?? 'null';
      return <CodeArea value={text.slice(0, MAX_RENDERED_TEXT)} readOnly rows={Math.min(20, text.split('\n').length + 1)} ariaLabel="Resultado (JSON)" />;
    }
    case 'table':
      return (
        <Table<TableRow>
          variant="embedded"
          items={result.rows.map((cells, index) => ({ index, cells }))}
          trackBy="index"
          columnDefinitions={result.columns.map((column, i) => ({ id: String(i), header: column, cell: (row) => row.cells[i] ?? '-' }))}
          empty={<Box textAlign="center">Nenhuma linha</Box>}
          wrapLines
        />
      );
    case 'audio':
      return (
        <audio controls src={`data:${result.contentType};base64,${result.base64}`}>
          <track kind="captions" />
        </audio>
      );
    case 'secret':
      return (
        <Alert type="warning" header={result.label}>
          {result.warning}
          <Box padding={{ top: 's' }}>
            <CopyToClipboard variant="inline" textToCopy={result.value} copySuccessText="Copiado" copyErrorText="Falha ao copiar" />
          </Box>
        </Alert>
      );
  }
}
