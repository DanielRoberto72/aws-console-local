import Textarea from '@cloudscape-design/components/textarea';

interface CodeAreaProps {
  value: string;
  onChange?: (value: string) => void;
  rows?: number;
  ariaLabel: string;
  readOnly?: boolean;
  placeholder?: string;
}

/** Área de texto com fonte monoespaçada, para código e JSON. */
export function CodeArea({ value, onChange, rows = 12, ariaLabel, readOnly, placeholder }: CodeAreaProps) {
  return (
    <div className="code-area">
      <Textarea
        value={value}
        onChange={({ detail }) => onChange?.(detail.value)}
        rows={rows}
        readOnly={readOnly}
        spellcheck={false}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Formata JSON para exibição; devolve o texto original se não for JSON. */
export function prettyJson(text: string | null | undefined): string {
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Mensagem de erro se o texto não for JSON válido; null se for válido ou vazio. */
export function jsonError(text: string, required = false): string | null {
  if (!text.trim()) return required ? 'Informe um JSON.' : null;
  try {
    JSON.parse(text);
    return null;
  } catch (err) {
    return `JSON inválido: ${(err as Error).message}`;
  }
}
