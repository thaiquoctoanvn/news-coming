import { Button, Card, Chip } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FIELD_INPUT, Field, FormDialog } from '../../components/FormDialog.tsx';
import { Toggle } from '../../components/Toggle.tsx';
import { formatShortDate, formatTime, vietnamDay } from '../../lib/format.ts';
import {
  type JobSource, MIN_RETENTION_DAYS, fetchJobProfile, fetchJobRetentionDays, fetchJobRuns, fetchJobSources,
  fetchSearchStatus, saveJobProfile, saveJobRetentionDays, saveSearchCredit, setJobSourceEnabled,
} from '../../lib/jobs-api.ts';
import { useSupabase } from '../../lib/supabase.ts';
import { creditStatus } from '../jobs/job-view.ts';
import { ScanJobsButton } from '../jobs/ScanJobsButton.tsx';

const STATUS_COLOR: Readonly<Record<string, 'success' | 'warning' | 'danger' | 'default'>> = {
  success: 'success', partial: 'warning', failed: 'danger', running: 'default',
};
const KIND_LABEL: Readonly<Record<JobSource['kind'], string>> = {
  direct: 'Đọc trực tiếp',
  listing_only: 'Chỉ đọc danh sách',
  search_only: 'Qua tìm kiếm',
  engine: 'Công cụ tìm kiếm',
};
const MAX_PROFILE_CHARS = 3_000;

type Dialog = 'profile' | 'credit' | 'retention' | null;

const DIALOG_QUERY: Readonly<Record<Exclude<Dialog, null>, string>> = {
  profile: 'job-profile', credit: 'job-search-status', retention: 'job-retention',
};

/** Job board block of the operations page: last runs, sources, search spend, scoring profile. */
export function JobsOperations() {
  const db = useSupabase();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileText, setProfileText] = useState('');
  const [creditUsd, setCreditUsd] = useState('5');
  const [creditDate, setCreditDate] = useState(vietnamDay(new Date()));
  const [retentionDays, setRetentionDays] = useState('30');

  const runs = useQuery({ queryKey: ['job-runs', 5], queryFn: () => fetchJobRuns(db, 5), refetchInterval: 60_000 });
  const sources = useQuery({ queryKey: ['job-sources'], queryFn: () => fetchJobSources(db) });
  const search = useQuery({ queryKey: ['job-search-status'], queryFn: () => fetchSearchStatus(db) });
  const profile = useQuery({ queryKey: ['job-profile'], queryFn: () => fetchJobProfile(db) });
  const retention = useQuery({ queryKey: ['job-retention'], queryFn: () => fetchJobRetentionDays(db) });

  const toggle = useMutation({
    mutationFn: (source: JobSource) => setJobSourceEnabled(db, source.id, !source.enabled),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['job-sources'] }),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (dialog === 'profile') return saveJobProfile(db, profileText);
      if (dialog === 'retention') {
        const days = Number(retentionDays);
        if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > 365) throw new Error(`Số ngày phải từ ${MIN_RETENTION_DAYS} đến 365`);
        return saveJobRetentionDays(db, days);
      }
      const amount = Number(creditUsd);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(creditDate)) throw new Error('Ngày nạp không hợp lệ');
      return saveSearchCredit(db, amount, creditDate);
    },
    onSuccess: () => {
      if (dialog) void queryClient.invalidateQueries({ queryKey: [DIALOG_QUERY[dialog]] });
      setDialog(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const open = (next: Exclude<Dialog, null>) => {
    setError(null);
    if (next === 'profile') setProfileText(profile.data ?? '');
    if (next === 'credit' && search.data?.creditUsd) {
      setCreditUsd(String(search.data.creditUsd));
      setCreditDate(search.data.creditDate ?? vietnamDay(new Date()));
    }
    if (next === 'retention') setRetentionDays(String(retention.data ?? 30));
    setDialog(next);
  };

  const credit = search.data ? creditStatus(search.data) : null;
  const latestErrors = Object.entries(runs.data?.[0]?.stats.sources ?? {}).filter(([, stats]) => stats.error);
  const sourceName = (id: string) => sources.data?.find((source) => source.id === id)?.name ?? id;

  return (
    <section aria-labelledby="jobs-ops-heading" className="flex flex-col gap-4">
      <h2 id="jobs-ops-heading" className="font-serif text-lg font-semibold">Việc làm</h2>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">
          Quét lúc 07:45 mỗi sáng. Tin không còn thấy trên nguồn quá <strong className="text-foreground">{retention.data ?? 30} ngày</strong> tự bị xóa lúc 03:10;
          nội dung trang tin xóa sau 7 ngày, tin đã đóng sau 30 ngày.{' '}
          <button type="button" className="underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => open('retention')}>Đổi số ngày giữ tin</button>
        </p>
        <ScanJobsButton />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <Card.Title className="text-base font-semibold">Tìm kiếm trả phí (Gemini)</Card.Title>
          {search.isError && <p className="text-sm text-danger">Không tải được: {search.error.message}</p>}
          {search.data && (
            <p className="text-sm">
              Tháng này: <strong className="tabular-nums">{search.data.monthCostUsd.toFixed(3)} USD</strong> / dừng ở {search.data.monthlyStopUsd.toFixed(2)} USD
              {' · '}<span className="tabular-nums">{search.data.monthSearches}</span> lượt tìm
            </p>
          )}
          {credit ? (
            <p className="text-sm">
              Credit còn khoảng <strong className="tabular-nums">{credit.balanceUsd.toFixed(2)} USD</strong>, hết hạn sau {Math.max(0, credit.daysToExpiry)} ngày.
            </p>
          ) : <p className="text-sm text-muted">Chưa nhập số tiền đã nạp.</p>}
          {credit?.warning && <p role="alert" className="text-sm text-danger">{credit.warning}</p>}
          <p className="text-xs text-muted">Số dư là ước tính từ sổ chi tiêu của worker; số chính xác xem ở Google AI Studio.</p>
          <div><Button size="sm" variant="secondary" onPress={() => open('credit')}>Nhập lần nạp credit</Button></div>
        </Card>

        <Card className="gap-3 p-5">
          <Card.Title className="text-base font-semibold">Hồ sơ để chấm điểm</Card.Title>
          <p className="text-sm text-muted">
            Chỉ dùng để chấm điểm mức phù hợp, không dùng để loại tin. Nội dung được gửi cho AI khi chấm điểm: chỉ ghi kỹ năng và kinh nghiệm, không ghi họ tên, số điện thoại, email, địa chỉ.
          </p>
          <p className="line-clamp-3 text-sm">{profile.data || 'Chưa có hồ sơ: đang chấm theo hồ sơ chung "Android developer, mid–senior".'}</p>
          <div><Button size="sm" variant="secondary" onPress={() => open('profile')}>Sửa hồ sơ</Button></div>
        </Card>
      </div>

      <Card className="gap-3 p-5">
        <Card.Title className="text-base font-semibold">Nguồn</Card.Title>
        {sources.isError && <p className="text-sm text-danger">Không tải được: {sources.error.message}</p>}
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {(sources.data ?? []).map((source) => (
            <li key={source.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{source.name} <span className="text-xs text-muted">· {KIND_LABEL[source.kind]}</span></span>
              <Toggle label={`Bật nguồn ${source.name}`} isSelected={source.enabled} isDisabled={toggle.isPending} onChange={() => toggle.mutate(source)} />
            </li>
          ))}
        </ul>
        {latestErrors.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {latestErrors.map(([id, stats]) => <li key={id}><strong>{sourceName(id)}</strong>: <span className="text-danger">{stats.error}</span></li>)}
          </ul>
        )}
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-surface text-left text-xs text-muted">
            <tr>{['Bắt đầu', 'Kết quả', 'Tin mới', 'Hết hạn', 'Chưa xác minh', 'Đã chấm', 'Ghi chú'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(runs.data ?? []).map((run) => (
              <tr key={run.id}>
                <td className="px-3 py-1.5 tabular-nums">{formatShortDate(run.startedAt)} {formatTime(run.startedAt)}</td>
                <td className="px-3 py-1.5"><Chip size="sm" variant="soft" color={STATUS_COLOR[run.status] ?? 'default'}>{run.status}</Chip></td>
                <td className="px-3 py-1.5 tabular-nums">{run.stats.inserted ?? '—'}</td>
                <td className="px-3 py-1.5 tabular-nums">{run.stats.closed ?? '—'}</td>
                <td className="px-3 py-1.5 tabular-nums">{run.stats.unverified ?? '—'}</td>
                <td className="px-3 py-1.5 tabular-nums">{run.stats.scored ?? '—'}</td>
                <td className="max-w-sm truncate px-3 py-1.5 text-muted" title={run.error ?? ''}>{run.error ?? ''}</td>
              </tr>
            ))}
            {runs.isSuccess && runs.data.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-muted">Chưa có lần quét nào.</td></tr>}
          </tbody>
        </table>
      </div>

      {dialog === 'profile' && (
        <FormDialog title="Hồ sơ để chấm điểm" onSubmit={() => save.mutate()} onClose={() => setDialog(null)} error={error}>
          <Field label="Kỹ năng, số năm kinh nghiệm, cấp bậc, loại việc mong muốn" hint={`${profileText.length}/${MAX_PROFILE_CHARS} ký tự. Không ghi thông tin cá nhân.`}>
            <textarea
              value={profileText}
              maxLength={MAX_PROFILE_CHARS}
              rows={10}
              onChange={(event) => setProfileText(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-focus"
            />
          </Field>
        </FormDialog>
      )}
      {dialog === 'retention' && (
        <FormDialog title="Số ngày giữ tin việc làm" onSubmit={() => save.mutate()} onClose={() => setDialog(null)} error={error}>
          <Field label="Số ngày" hint={`Tính từ lần cuối tin còn thấy trên nguồn. Tối thiểu ${MIN_RETENTION_DAYS} ngày. Tin còn được làm mới thì không bị xóa.`}>
            <input type="number" min={MIN_RETENTION_DAYS} max={365} step="1" inputMode="numeric" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className={FIELD_INPUT} />
          </Field>
        </FormDialog>
      )}
      {dialog === 'credit' && (
        <FormDialog title="Lần nạp credit tìm kiếm" onSubmit={() => save.mutate()} onClose={() => setDialog(null)} error={error}>
          <Field label="Số tiền đã nạp (USD)">
            <input type="number" min="0" step="0.01" inputMode="decimal" value={creditUsd} onChange={(event) => setCreditUsd(event.target.value)} className={FIELD_INPUT} />
          </Field>
          <Field label="Ngày nạp" hint="Credit hết hạn sau 12 tháng kể từ ngày này.">
            <input type="date" value={creditDate} onChange={(event) => setCreditDate(event.target.value)} className={FIELD_INPUT} />
          </Field>
        </FormDialog>
      )}
    </section>
  );
}
