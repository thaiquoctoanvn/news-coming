import { Button } from '@heroui/react';
import { useState } from 'react';
import { ChipListEditor } from '../../components/ChipListEditor.tsx';
import { FIELD_INPUT, Field, FormDialog } from '../../components/FormDialog.tsx';
import { PlusIcon, TrashIcon } from '../../components/icons.tsx';
import { type Option, OptionSelect } from '../../components/OptionSelect.tsx';
import { ErrorState, LoadingCards } from '../../components/States.tsx';
import { Toggle } from '../../components/Toggle.tsx';
import type { Row } from '../../lib/admin-api.ts';
import type { Category } from './config/CategoriesSection.tsx';
import { EditButton } from './config/RowActions.tsx';
import { Section } from './config/Section.tsx';
import { useAdminRows } from './config/use-admin-rows.ts';
import { type Column, type TableDef, fromInputText, patchFor, readValue, toInputText } from './config-tables.ts';

// A config table shown read-only: switches toggle in place, everything else is edited in a popup.

type Props = {
  def: TableDef;
  topicId: string;
};

type Editing = { mode: 'add' } | { mode: 'edit'; row: Row } | null;

const isEditable = (c: Column) => c.type !== 'switch' && c.type !== 'readonly';
// Dropdown key for "no category" (an empty string is not a usable collection key).
const NONE = '__none__';

export function EditableTable({ def, topicId }: Props) {
  const table = useAdminRows<Row>(def.table, def.topicScoped ? topicId : null, def.order);
  const categories = useAdminRows<Category>('categories', topicId, 'position');
  const [editing, setEditing] = useState<Editing>(null);
  const categoryOptions: Option[] = (categories.rows.data ?? []).map((c) => ({ id: c.id, label: c.name_vi }));
  const categoryName = new Map(categoryOptions.map((o) => [o.id, o.label]));
  const match = (row: Row): Row => Object.fromEntries(def.keys.map((k) => [k, row[k]]));
  const hasActions = def.columns.some(isEditable) || def.allowDelete;

  const display = (c: Column, row: Row): string => {
    const value = readValue(row, c.key);
    if (c.type === 'category') return typeof value === 'string' ? categoryName.get(value) ?? value : '';
    return toInputText(value, c.type === 'list' ? 'list' : 'text');
  };

  const handleSave = (values: Row) => {
    if (editing?.mode === 'edit') {
      const patch = Object.entries(values).reduce<Row>((acc, [key, value]) => ({ ...acc, ...patchFor({ ...editing.row, ...acc }, key, value) }), {});
      table.update.mutate({ match: match(editing.row), patch });
    } else if (def.insert) {
      const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
      table.insert.mutate({ ...def.insert.defaults, ...fields, ...(def.topicScoped ? { topic_id: topicId } : {}) });
    }
    setEditing(null);
  };

  return (
    <Section
      id={def.id}
      title={def.title}
      description={def.description}
      error={table.error}
      action={def.insert && <Button size="sm" variant="secondary" onPress={() => setEditing({ mode: 'add' })}><PlusIcon className="size-3.5" />Thêm</Button>}
    >
      {table.rows.isPending && <LoadingCards count={1} />}
      {table.rows.isError && <ErrorState title={`Không tải được ${def.title.toLowerCase()}`} error={table.rows.error} />}
      {table.rows.isSuccess && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                {def.columns.map((c) => <th key={c.key} scope="col" className="px-3 py-2 font-medium">{c.label}</th>)}
                {hasActions && <th scope="col" className="px-3 py-2"><span className="sr-only">Thao tác</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.data.map((row) => {
                const name = String(row.name ?? row.name_vi ?? row.model ?? row.id);
                return (
                  <tr key={def.keys.map((k) => String(row[k])).join('|')} className={row.enabled === false ? 'text-muted' : ''}>
                    {def.columns.map((c) => (
                      <td key={c.key} className="px-3 py-2 align-middle">
                        {c.type === 'switch' ? (
                          <Toggle label={`${c.label} ${name}`} isSelected={readValue(row, c.key) === true} onChange={(v) => table.update.mutate({ match: match(row), patch: patchFor(row, c.key, v) })} />
                        ) : (
                          <span className={`block max-w-xs truncate ${c.type === 'readonly' ? 'text-muted' : ''}`} title={display(c, row)}>{display(c, row) || '—'}</span>
                        )}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {def.columns.some(isEditable) && (
<EditButton name={name} onPress={() => setEditing({ mode: 'edit', row })} />
                        )}
                        {def.allowDelete && (
                          <Button isIconOnly size="sm" variant="ghost" aria-label={`Xóa ${name}`} onPress={() => window.confirm(`Xóa "${name}"?`) && table.remove.mutate(match(row))}>
                            <TrashIcon className="size-4 text-danger" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RowDialog
          title={editing.mode === 'edit' ? `Sửa ${def.title.toLowerCase()}` : `Thêm ${def.title.toLowerCase()}`}
          columns={editing.mode === 'edit' ? def.columns.filter(isEditable) : def.insert?.columns ?? []}
          row={editing.mode === 'edit' ? editing.row : { ...def.insert?.defaults }}
          categoryOptions={categoryOptions}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

type DialogProps = {
  title: string;
  columns: readonly Column[];
  row: Row;
  categoryOptions: readonly Option[];
  onSave: (values: Row) => void;
  onClose: () => void;
};

/** Form for the editable columns of one row; values are converted and checked on OK. */
function RowDialog({ title, columns, row, categoryOptions, onSave, onClose }: DialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(columns.map((c) => {
      const value = readValue(row, c.key);
      return [c.key, c.type === 'list' || c.type === 'category' || c.type === 'select' ? value ?? null : toInputText(value, c.type)];
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = () => {
    try {
      const out = Object.fromEntries(columns.map((c) => {
        const raw = values[c.key];
        const value = c.type === 'list' ? raw ?? [] : c.type === 'category' || c.type === 'select' ? raw ?? null : fromInputText(String(raw ?? ''), c.type);
        if (c.required && (value === null || value === '')) throw new Error(`Cần nhập ${c.label.toLowerCase()}`);
        return [c.key, value];
      }));
      onSave(out);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Giá trị không hợp lệ');
    }
  };

  return (
    <FormDialog title={title} onSubmit={handleSubmit} onClose={onClose} error={error}>
      {columns.map((c, i) => {
        const value = values[c.key];
        if (c.type === 'category' || c.type === 'select') {
          const options = c.type === 'category' ? [{ id: NONE, label: '— Không —' }, ...categoryOptions] : c.options ?? [];
          return (
            <div key={c.key} className="flex flex-col gap-1">
              <span className="text-muted">{c.label}</span>
              <OptionSelect label={c.label} options={options} value={typeof value === 'string' ? value : c.type === 'category' ? NONE : null} onChange={(v) => set(c.key, v === NONE ? null : v)} />
              {c.hint && <span className="text-xs text-muted">{c.hint}</span>}
            </div>
          );
        }
        if (c.type === 'list') {
          return (
            <div key={c.key} className="flex flex-col gap-1">
              <span className="text-muted">{c.label}</span>
              <ChipListEditor label={c.label} values={Array.isArray(value) ? (value as string[]) : []} onChange={(v) => set(c.key, v)} />
            </div>
          );
        }
        return (
          <Field key={c.key} label={c.label} hint={c.hint}>
            <input
              autoFocus={i === 0}
              type={c.type === 'number' ? 'number' : c.type === 'time' ? 'time' : 'text'}
              value={String(value ?? '')}
              onChange={(e) => set(c.key, e.target.value)}
              className={FIELD_INPUT}
            />
          </Field>
        );
      })}
    </FormDialog>
  );
}
