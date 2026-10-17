import { ListBox, Select } from '@heroui/react';
import type { Key } from 'react';

export type Option = { readonly id: string; readonly label: string };

type Common = {
  readonly label: string;
  readonly options: readonly Option[];
  readonly placeholder?: string;
};
type Single = Common & { readonly multiple?: false; readonly value: string | null; readonly onChange: (value: string | null) => void };
type Multiple = Common & { readonly multiple: true; readonly value: readonly string[]; readonly onChange: (value: string[]) => void };

/** Dropdown over a fixed list (single or multiple choice). */
export function OptionSelect(props: Single | Multiple) {
  const { label, options, placeholder = 'Chọn…' } = props;
  const body = (
    <>
      <Select.Trigger className="min-w-0">
        <Select.Value className="min-w-0 truncate" />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox selectionMode={props.multiple ? 'multiple' : 'single'} className="max-h-64 overflow-y-auto">
          {options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              <span className="min-w-0 truncate">{o.label}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </>
  );

  if (props.multiple) {
    return (
      <Select
        aria-label={label}
        placeholder={placeholder}
        selectionMode="multiple"
        value={[...props.value]}
        onChange={(keys: Key[]) => props.onChange(keys.map(String))}
        fullWidth
      >
        {body}
      </Select>
    );
  }
  return (
    <Select
      aria-label={label}
      placeholder={placeholder}
      value={props.value}
      onChange={(key: Key | null) => props.onChange(key === null ? null : String(key))}
      fullWidth
    >
      {body}
    </Select>
  );
}
