import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';

/** Lista simples da etapa de revisão dos assistentes de criação. */
export function ReviewList({ items, empty = 'Nenhuma permissão. Você pode adicionar depois.' }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <Box color="text-body-secondary">{empty}</Box>;
  return (
    <SpaceBetween size="xxs">
      {items.map((item) => (
        <div key={item}>{item}</div>
      ))}
    </SpaceBetween>
  );
}
