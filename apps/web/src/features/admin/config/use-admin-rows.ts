import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type Row, deleteRow, fetchRows, insertRow, updateRow } from '../../../lib/admin-api.ts';
import { useSupabase } from '../../../lib/supabase.ts';

/** Rows of one config table (of the topic, or all rows when topicId is null), with writes that refresh the list. */
export function useAdminRows<T extends Row>(table: string, topicId: string | null, order: string) {
  const db = useSupabase();
  const queryClient = useQueryClient();
  const queryKey = ['admin-table', table, topicId ?? 'all'];
  const [error, setError] = useState<string | null>(null);
  const rows = useQuery({ queryKey, queryFn: async () => (await fetchRows(db, { table, order, ...(topicId ? { topicId } : {}) })) as T[] });

  const settle = {
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => setError(e.message),
  };
  const update = useMutation({ mutationFn: ({ match, patch }: { match: Row; patch: Row }) => updateRow(db, table, match, patch), ...settle });
  const insert = useMutation({ mutationFn: (row: Row) => insertRow(db, table, row), ...settle });
  const remove = useMutation({ mutationFn: (match: Row) => deleteRow(db, table, match), ...settle });
  /** Several updates in one go (e.g. new positions after a drag). */
  const updateMany = useMutation({
    mutationFn: (changes: readonly { match: Row; patch: Row }[]) => Promise.all(changes.map((c) => updateRow(db, table, c.match, c.patch))),
    ...settle,
  });

  return { rows, error, update, insert, remove, updateMany };
}
