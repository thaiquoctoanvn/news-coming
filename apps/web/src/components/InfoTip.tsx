import { Tooltip } from '@heroui/react';
import { InfoIcon } from './icons.tsx';

/** "ⓘ" next to a label; shows the explanation on hover or keyboard focus. */
export function InfoTip({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger aria-label={`Giải thích: ${label}`} className="inline-flex cursor-help align-middle text-muted hover:text-foreground">
        <InfoIcon className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-64 text-xs leading-relaxed">{children}</Tooltip.Content>
    </Tooltip>
  );
}
