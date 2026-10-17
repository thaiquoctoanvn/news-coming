import { Tabs } from '@heroui/react';
import type { Key } from 'react';

export type SegmentedTab = { readonly id: string; readonly label: string };

type Props = {
  readonly ariaLabel: string;
  readonly items: readonly SegmentedTab[];
  readonly selectedKey: string | undefined;
  readonly onChange: (id: string) => void;
  readonly disabledKeys?: readonly string[];
  readonly className?: string;
};

/** Pill tabs used as a filter; labels wrap to two lines and then end with an ellipsis. */
export function SegmentedTabs({ ariaLabel, items, selectedKey, onChange, disabledKeys, className }: Props) {
  return (
    <Tabs
      className={className}
      selectedKey={selectedKey}
      onSelectionChange={(key: Key) => onChange(String(key))}
      disabledKeys={disabledKeys}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={ariaLabel}>
          {items.map((item) => (
            <Tabs.Tab key={item.id} id={item.id}>
              <span className="line-clamp-2 break-words" title={item.label}>{item.label}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
