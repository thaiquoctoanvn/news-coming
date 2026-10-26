import { Button, Card } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormDialog } from '../../components/FormDialog.tsx';
import { fetchPurgeStatus, purgeNow } from '../../lib/admin-api.ts';
import { formatShortDate, formatTime } from '../../lib/format.ts';
import { useSupabase } from '../../lib/supabase.ts';

/** Free Supabase database limit; past this the project goes read-only. */
const FREE_DB_MB = 500;

const COUNT_LABELS: Readonly<Record<string, string>> = {
  digests: 'bản tin',
  articles: 'tin',
  snippets: 'nội dung bài gốc',
  crawl_runs: 'lần chạy',
  ai_usage: 'dòng thống kê AI',
  action_quota: 'dòng lượt bấm',
  schedule_dispatches: 'lần gọi lịch',
  login_attempts: 'lần đăng nhập',
  events: 'sự kiện',
};

/** "12 bản tin · 340 tin" — tables with nothing removed are left out. */
export function purgeSummary(counts: Readonly<Record<string, number>>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${COUNT_LABELS[key] ?? key}`);
  return parts.length ? parts.join(' · ') : 'không có gì cần xóa';
}

export function Maintenance() {
  const db = useSupabase();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['admin-purge'], queryFn: () => fetchPurgeStatus(db) });
  const purge = useMutation({
    mutationFn: () => purgeNow(db),
    onSuccess: (counts) => setMessage(`Đã dọn: ${purgeSummary(counts)}.`),
    onError: (e: Error) => setMessage(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin-purge'] }),
  });
  const last = status.data?.lastPurge;
  const sizeMb = status.data?.sizeMb;

  return (
    <Card className="gap-3 p-5">
      <Card.Title className="text-base font-semibold">Dọn dữ liệu cũ</Card.Title>
      <p className="text-sm text-muted">
        Tự chạy lúc 03:00 mỗi ngày theo số ngày giữ trong Cấu hình → Cài đặt chung. Dữ liệu bị xóa không khôi phục được.
      </p>
      {status.isError && <p className="text-sm text-danger">Không tải được trạng thái: {status.error.message}</p>}
      {sizeMb !== undefined && (
        <p className="text-sm">
          Dung lượng database: <strong className={`tabular-nums ${sizeMb >= FREE_DB_MB * 0.8 ? 'text-danger' : ''}`}>{sizeMb} MB</strong> / {FREE_DB_MB} MB miễn phí
        </p>
      )}
      {status.isSuccess && (
        <p className="text-sm">
          Lần dọn gần nhất:{' '}
          {last ? <>{formatShortDate(last.at)} {formatTime(last.at)} — {purgeSummary(last.counts)}</> : 'chưa chạy lần nào'}
        </p>
      )}
      <div>
        <Button variant="secondary" isDisabled={purge.isPending} onPress={() => setIsConfirming(true)}>
          {purge.isPending ? 'Đang dọn…' : 'Dọn ngay'}
        </Button>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      {isConfirming && (
        <FormDialog
          title="Dọn dữ liệu cũ ngay?"
          onSubmit={() => {
            setIsConfirming(false);
            setMessage(null);
            purge.mutate();
          }}
          onClose={() => setIsConfirming(false)}
        >
          <p>Xóa hẳn bản tin, tin và nhật ký cũ hơn số ngày giữ đã cấu hình. Không khôi phục được.</p>
        </FormDialog>
      )}
    </Card>
  );
}
