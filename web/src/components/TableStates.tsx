import Box from '@cloudscape-design/components/box';
import type { ReactNode } from 'react';

export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Box textAlign="center" color="inherit">
      <Box variant="strong" textAlign="center" color="inherit">
        {title}
      </Box>
      {subtitle && (
        <Box variant="p" padding={{ bottom: 's' }} color="inherit">
          {subtitle}
        </Box>
      )}
      {action}
    </Box>
  );
}
