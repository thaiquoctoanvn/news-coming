import { Button, Card, Chip } from '@heroui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { fetchAiUsageToday, fetchDispatches, fetchQuotaToday, fetchRows, fetchRuns } from '../../lib/admin-api.ts';
import { formatShortDate, formatTime } from '../../lib/format.ts';
import { requestRefresh } from '../../lib/functions.ts';
import { useEditions } from '../../lib/queries.ts';
import { useSupabase } from '../../lib/supabase.ts';
import { AI_TABLE } from './config-tables.ts';
import { EditableTable } from './EditableTable.tsx';

const STATUS_COLOR: Readonly<Record<string, 'success' | 'warning' | 'danger' | 'default'>> = {
  success: 'success', partial: 'warning', failed: 'danger', running: 'default',
};

export function OperationsPage() {
  const { topicId } = useOutletContext<{ topicId: string }>();
  if (!topicId) return <EmptyState title="Chưa có chủ đề nào đang bật" />;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-serif text-2xl font-bold">Vận hành</h1>
      <RefreshButtons topicId={topicId} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AiUsage />
        <QuotaAndSchedule topicId={topicId} />
      </div>
      <EditableTable def={AI_TABLE} topicId={topicId} />
      <Runs topicId={topicId} />
      <SourceErrors topicId={topicId} />
    </div>
  );
}

function RefreshButtons({ topicId }: { topicId: string }) {
  const db = useSupabase();
  const editions = useEditions(topicId);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useMutation({
    mutationFn: (editionId: string) => requestRefresh(db, topicId, editionId),
    onSuccess: (text) => setMessage(text),
    onError: (e: Error) => setMessage(e.message),
  });

  return (
    <Card className="gap-3 p-5">
      <Card.Title className="text-base font-semibold">Cập nhật tin mới</Card.Title>
      <p className="text-sm text-muted">Lấy tin phát sinh sau lần chạy gần nhất và bổ sung vào bản tin hôm nay (chạy trên GitHub Actions, khoảng 5–15 phút).</p>
      <div className="flex flex-wrap gap-2">
        {(editions.data ?? []).map((e) => (
          <Button key={e.id} variant="secondary" isDisabled={refresh.isPending} onPress={() => refresh.mutate(e.id)}>
            {refresh.isPending && refresh.variables === e.id ? 'Đang gửi…' : `Cập nhật: ${e.name}`}
          </Button>
        ))}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </Card>
  );
}

function AiUsage() {
  const db = useSupabase();
  const usage = useQuery({ queryKey: ['admin-ai-usage'], queryFn: () => fetchAiUsageToday(db), refetchInterval: 60_000 });
  if (usage.isPending) return <LoadingCards count={1} />;
  if (usage.isError) return <ErrorState title="Không tải được lượng dùng AI" error={usage.error} />;

  return (
    <Card className="gap-3 p-5">
      <Card.Title className="text-base font-semibold">AI hôm nay (UTC)</Card.Title>
      <ul className="flex flex-col gap-2 text-sm">
        {usage.data.map((p) => {
          const ratio = p.requests / p.requestLimit;
          return (
            <li key={p.providerId} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span><span className="text-xs text-muted">{p.role}</span> {p.model}</span>
              <span className={`tabular-nums ${ratio >= 0.8 ? 'text-danger' : ratio >= 0.5 ? 'text-warning' : ''}`}>
                {p.requests}/{p.requestLimit} request{p.tokenLimit ? ` · ${Math.round(p.tokens / 1000)}K/${Math.round(p.tokenLimit / 1000)}K token` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Router tự chuyển model khi chạm 80% hạn mức ngày.</p>
    </Card>
  );
}

function QuotaAndSchedule({ topicId }: { topicId: string }) {
  const db = useSupabase();
  const quota = useQuery({ queryKey: ['admin-quota', topicId], queryFn: () => fetchQuotaToday(db, topicId) });
  const dispatches = useQuery({ queryKey: ['admin-dispatches', topicId], queryFn: () => fetchDispatches(db, topicId) });

  return (
    <Card className="gap-3 p-5">
      <Card.Title className="text-base font-semibold">Nút bấm & lịch tự động</Card.Title>
      <p className="text-sm">
        Hôm nay: Xem thêm <strong>{quota.data?.more ?? 0}</strong> lượt · Cập nhật tin mới <strong>{quota.data?.refresh ?? 0}</strong> lượt
      </p>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">pg_cron đã gọi GitHub</h3>
      {dispatches.data?.length ? (
        <ul className="text-sm">
          {dispatches.data.map((d) => (
            <li key={d.id} className="tabular-nums">{formatShortDate(d.dispatched_at)} {formatTime(d.dispatched_at)} — {d.edition_id}</li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Chưa có lần gọi nào.</p>}
    </Card>
  );
}

function Runs({ topicId }: { topicId: string }) {
  const db = useSupabase();
  const runs = useQuery({ queryKey: ['admin-runs', topicId], queryFn: () => fetchRuns(db, topicId), refetchInterval: 60_000 });
  if (runs.isPending) return <LoadingCards count={1} />;
  if (runs.isError) return <ErrorState title="Không tải được lịch sử chạy" error={runs.error} />;

  return (
    <section aria-labelledby="runs-heading" className="flex flex-col gap-3">
      <h2 id="runs-heading" className="font-serif text-lg font-semibold">Các lần chạy gần đây</h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-surface text-left text-xs text-muted">
            <tr>{['Bắt đầu', 'Bản tin', 'Kích hoạt', 'Kết quả', 'Chấm', 'Chọn', 'Dịch', 'Bỏ/Loại', 'Ghi chú'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.data.map((r) => {
              const s = r.stats as Record<string, number | string | null | undefined>;
              const note = r.error ?? (s.aiStopped ? `AI dừng: ${String(s.aiStopped)}` : '');
              return (
                <tr key={r.id}>
                  <td className="px-3 py-1.5 tabular-nums">{formatShortDate(r.started_at)} {formatTime(r.started_at)}</td>
                  <td className="px-3 py-1.5">{r.edition_id ?? '—'}</td>
                  <td className="px-3 py-1.5">{r.trigger}</td>
                  <td className="px-3 py-1.5"><Chip size="sm" variant="soft" color={STATUS_COLOR[r.status] ?? 'default'}>{r.status}</Chip></td>
                  <td className="px-3 py-1.5 tabular-nums">{s.scored ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">{s.selected ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">{s.translated ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">{s.dropped ?? 0}/{s.rejected ?? 0}</td>
                  <td className="max-w-sm truncate px-3 py-1.5 text-muted" title={note}>{note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourceErrors({ topicId }: { topicId: string }) {
  const db = useSupabase();
  const sources = useQuery({ queryKey: ['admin-sources', topicId], queryFn: () => fetchRows(db, { table: 'sources', topicId, order: 'name' }) });
  const failing = (sources.data ?? []).filter((s) => s.enabled === true && s.last_error);
  if (!sources.isSuccess) return null;

  return (
    <section aria-labelledby="sources-heading" className="flex flex-col gap-2">
      <h2 id="sources-heading" className="font-serif text-lg font-semibold">Nguồn đang lỗi</h2>
      {failing.length === 0 ? <p className="text-sm text-muted">Tất cả nguồn đang bật đều chạy bình thường ở lần lấy tin gần nhất.</p> : (
        <ul className="flex flex-col gap-1 text-sm">
          {failing.map((s) => <li key={String(s.id)}><strong>{String(s.name)}</strong>: <span className="text-danger">{String(s.last_error)}</span></li>)}
        </ul>
      )}
    </section>
  );
}
