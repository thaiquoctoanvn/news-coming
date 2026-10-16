import { Button, Input } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ErrorState, LoadingCards } from '../../components/States.tsx';
import { Toggle } from '../../components/Toggle.tsx';
import { type Row, deleteRow, fetchRows, insertRow, updateRow } from '../../lib/admin-api.ts';
import { useSupabase } from '../../lib/supabase.ts';
import { type Column, type TableDef, fromInputText, patchFor, readValue, toInputText } from './config-tables.ts';

// One config table: switches save immediately, text cells save when the field loses focus.

type Props = {
  def: TableDef;
  topicId: string;
};

export function EditableTable({ def, topicId }: Props) {
  const db = useSupabase();
  const queryClient = useQueryClient();
  const queryKey = ['admin-table', def.table, def.topicScoped ? topicId : 'all'];
  const rows = useQuery({
    queryKey,
    queryFn: () => fetchRows(db, { table: def.table, order: def.order, ...(def.topicScoped ? { topicId } : {}) }),
  });
  const [error, setError] = useState<string | null>(null);

  const match = (row: Row): Row => Object.fromEntries(def.keys.map((k) => [k, row[k]]));
  const save = useMutation({
    mutationFn: ({ row, key, value }: { row: Row; key: string; value: unknown }) => updateRow(db, def.table, match(row), patchFor(row, key, value)),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (row: Row) => deleteRow(db, def.table, match(row)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (e: Error) => setError(e.message),
  });

  if (rows.isPending) return <LoadingCards count={1} />;
  if (rows.isError) return <ErrorState title={`Không tải được ${def.title.toLowerCase()}`} error={rows.error} />;

  return (
    <section aria-labelledby={`table-${def.id}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`table-${def.id}`} className="font-serif text-lg font-semibold">{def.title}</h2>
        <p className="text-sm text-muted">{def.description}</p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-surface text-left text-xs text-muted">
            <tr>
              {def.columns.map((c) => <th key={c.key} scope="col" className="px-3 py-2 font-medium">{c.label}</th>)}
              {def.allowDelete && <th scope="col" className="px-3 py-2"><span className="sr-only">Xóa</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.data.map((row) => (
              <tr key={def.keys.map((k) => String(row[k])).join('|')}>
                {def.columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 align-middle">
                    <Cell column={c} row={row} onSave={(value) => save.mutate({ row, key: c.key, value })} />
                  </td>
                ))}
                {def.allowDelete && (
                  <td className="px-3 py-1.5">
                    <Button size="sm" variant="danger-soft" onPress={() => window.confirm(`Xóa "${String(row.name ?? row.id)}"?`) && remove.mutate(row)}>
                      Xóa
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {def.insert && <InsertForm def={def} topicId={topicId} onDone={() => void queryClient.invalidateQueries({ queryKey })} />}
    </section>
  );
}

function Cell({ column, row, onSave }: { column: Column; row: Row; onSave: (value: unknown) => void }) {
  const value = readValue(row, column.key);
  if (column.type === 'switch') return <Toggle label={column.label} isSelected={value === true} onChange={onSave} />;
  if (column.type === 'readonly') {
    return <span className="block max-w-xs truncate text-muted" title={toInputText(value, 'text')}>{toInputText(value, 'text') || '—'}</span>;
  }
  return <TextCell column={column} value={value} onSave={onSave} />;
}

function TextCell({ column, value, onSave }: { column: Column; value: unknown; onSave: (value: unknown) => void }) {
  const initial = toInputText(value, column.type);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const handleBlur = () => {
    if (text === initial) return;
    try {
      onSave(fromInputText(text, column.type));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Giá trị không hợp lệ');
    }
  };

  const width = column.type === 'number' || column.type === 'time' ? 'w-24' : 'w-56';
  return (
    <div>
      <Input
        aria-label={column.label}
        title={column.hint}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        className={width}
        aria-invalid={error !== null}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function InsertForm({ def, topicId, onDone }: { def: TableDef; topicId: string; onDone: () => void }) {
  const db = useSupabase();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (row: Row) => insertRow(db, def.table, row),
    onSuccess: () => {
      setValues({});
      setError(null);
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });
  if (!def.insert) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const fields = Object.fromEntries(def.insert!.columns.map((c) => [c.key, fromInputText(values[c.key] ?? '', c.type)]));
      const row: Row = { ...def.insert!.defaults, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)) };
      add.mutate(def.topicScoped ? { ...row, topic_id: topicId } : row);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Giá trị không hợp lệ');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-xl bg-surface p-3">
      {def.insert.columns.map((c) => (
        <label key={c.key} className="flex flex-col gap-1 text-xs text-muted">
          {c.label}
          <Input value={values[c.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))} className="w-48" />
        </label>
      ))}
      <Button type="submit" size="sm" variant="primary" isDisabled={add.isPending}>Thêm</Button>
      {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
