import { type KeyboardEvent, useState } from 'react';
import { CloseIcon } from './icons.tsx';

type Props = {
  readonly label: string;
  readonly values: readonly string[];
  readonly onChange: (values: string[]) => void;
  readonly placeholder?: string;
  readonly tone?: 'default' | 'danger';
};

/** Removable chips: click a chip to edit it, Enter or comma adds a new one. Long lists scroll. */
export function ChipListEditor({ label, values, onChange, placeholder = 'Thêm…', tone = 'default' }: Props) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);

  const clean = (text: string) => text.trim().replace(/\s+/g, ' ');
  const add = () => {
    const parts = draft.split(',').map(clean).filter((p) => p && !values.includes(p));
    setDraft('');
    if (parts.length > 0) onChange([...values, ...new Set(parts)]);
  };
  const commitEdit = () => {
    if (!editing) return;
    const text = clean(editing.text);
    setEditing(null);
    if (text === values[editing.index]) return;
    const next = text ? values.map((v, i) => (i === editing.index ? text : v)) : values.filter((_, i) => i !== editing.index);
    onChange([...new Set(next)]);
  };
  const handleDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const chipTone = tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-default text-foreground';
  return (
    <div role="group" aria-label={label} className="flex max-h-28 min-w-0 flex-wrap content-start gap-1.5 overflow-y-auto rounded-xl border border-border p-1.5">
      {values.map((value, index) =>
        editing?.index === index ? (
          <input
            key={`edit-${index}`}
            autoFocus
            aria-label={`Sửa "${value}"`}
            value={editing.text}
            onChange={(e) => setEditing({ index, text: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              // Enter/Escape stay inside the chip: they must not submit or close a surrounding popup.
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(null);
              }
            }}
            className="h-6 w-32 rounded-full border border-focus bg-background px-2 text-xs outline-none"
          />
        ) : (
          <span key={value} className={`inline-flex h-6 max-w-full items-center rounded-full text-xs ${chipTone}`}>
            <button type="button" title="Bấm để sửa" onClick={() => setEditing({ index, text: value })} className="min-w-0 truncate rounded-full pl-2.5 pr-1 hover:underline focus-visible:outline-2 focus-visible:outline-focus">
              {value}
            </button>
            <button type="button" aria-label={`Xóa "${value}"`} onClick={() => onChange(values.filter((_, i) => i !== index))} className="mr-1 rounded-full p-0.5 opacity-60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-focus">
              <CloseIcon className="size-3" />
            </button>
          </span>
        ),
      )}
      <input
        aria-label={`Thêm vào ${label}`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleDraftKey}
        onBlur={add}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted"
      />
    </div>
  );
}

/** Read-only chips; long lists scroll. */
export function ChipList({ values, tone = 'default', empty = '—' }: { readonly values: readonly string[]; readonly tone?: 'default' | 'danger'; readonly empty?: string }) {
  if (values.length === 0) return <span className="text-xs text-muted">{empty}</span>;
  const chipTone = tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-default text-foreground';
  return (
    <ul className="flex max-h-24 min-w-0 flex-wrap content-start gap-1.5 overflow-y-auto">
      {values.map((v) => <li key={v} className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-xs ${chipTone}`} title={v}>{v}</li>)}
    </ul>
  );
}
