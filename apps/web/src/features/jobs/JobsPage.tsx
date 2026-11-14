import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { formatDigestDate, formatShortDate, formatTime } from '../../lib/format.ts';
import { fetchJobDates, fetchJobRuns, fetchJobSources, fetchJobs, fetchSearchStatus } from '../../lib/jobs-api.ts';
import { useSupabase } from '../../lib/supabase.ts';
import { DigestDatePicker } from '../digest/DigestDatePicker.tsx';
import { JobCard } from './JobCard.tsx';
import { ScanJobsButton } from './ScanJobsButton.tsx';
import { TIER_LABEL, creditStatus, groupJobs, highScoreCount } from './job-view.ts';

const FIVE_MINUTES = 5 * 60_000;

/** Admin-only job report: one day at a time, grouped by fit. The day is kept in ?date=. */
export function JobsPage() {
  const db = useSupabase();
  const [params, setParams] = useSearchParams();
  const dates = useQuery({ queryKey: ['job-dates'], queryFn: () => fetchJobDates(db), staleTime: FIVE_MINUTES });
  const requested = params.get('date');
  const date = requested && dates.data?.includes(requested) ? requested : dates.data?.[0] ?? null;
  const jobs = useQuery({
    queryKey: ['jobs', date],
    queryFn: () => fetchJobs(db, date ?? ''),
    enabled: date !== null,
    staleTime: FIVE_MINUTES,
  });
  const sources = useQuery({ queryKey: ['job-sources'], queryFn: () => fetchJobSources(db), staleTime: FIVE_MINUTES });
  const lastRun = useQuery({ queryKey: ['job-runs', 1], queryFn: () => fetchJobRuns(db, 1), staleTime: FIVE_MINUTES });
  const search = useQuery({ queryKey: ['job-search-status'], queryFn: () => fetchSearchStatus(db), staleTime: FIVE_MINUTES });

  if (dates.isPending) return <LoadingCards />;
  if (dates.isError) return <ErrorState title="Không tải được tin việc làm" error={dates.error} onRetry={() => void dates.refetch()} />;
  if (!date) {
    return (
      <div className="flex flex-col items-center gap-4">
        <EmptyState title="Chưa có báo cáo việc làm nào">Lần quét tự động chạy lúc 07:45 mỗi sáng.</EmptyState>
        <ScanJobsButton />
      </div>
    );
  }

  const index = dates.data.indexOf(date);
  const older = dates.data[index + 1];
  const newer = index > 0 ? dates.data[index - 1] : undefined;
  const sourceNames = new Map((sources.data ?? []).map((source) => [source.id, source.name]));
  const run = lastRun.data?.[0];
  const credit = search.data ? creditStatus(search.data) : null;

  return (
    <div className="flex flex-col gap-6">
      {credit?.warning && <p role="alert" className="rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm">{credit.warning}</p>}

      <section aria-label="Chọn ngày" className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button isIconOnly size="sm" variant="ghost" aria-label="Ngày trước" isDisabled={!older} onPress={() => older && setParams({ date: older })}>‹</Button>
          <DigestDatePicker date={date} availableDates={dates.data} label={formatDigestDate(date)} onSelect={(next) => setParams({ date: next })} />
          <Button isIconOnly size="sm" variant="ghost" aria-label="Ngày sau" isDisabled={!newer} onPress={() => newer && setParams({ date: newer })}>›</Button>
        </div>
        <ScanJobsButton />
      </section>

      {jobs.isPending && <LoadingCards />}
      {jobs.isError && <ErrorState title="Không tải được danh sách tin" error={jobs.error} onRetry={() => void jobs.refetch()} />}
      {jobs.isSuccess && (
        <>
          <p className="text-sm text-muted">
            <strong className="text-foreground">{jobs.data.length}</strong> tin · <strong className="text-foreground">{highScoreCount(jobs.data)}</strong> tin từ 7 điểm
            {run && ` · Lần quét gần nhất ${formatTime(run.startedAt)} ${formatShortDate(run.startedAt)}: loại ${run.stats.closed ?? 0} tin hết hạn`}
            {search.data && search.data.monthlyStopUsd > 0 && ` · Tìm kiếm tháng này: ${search.data.monthCostUsd.toFixed(2)} / ${search.data.monthlyStopUsd.toFixed(2)} USD`}
          </p>
          {jobs.data.length === 0 && <EmptyState title="Không có tin mới trong ngày này" />}
          {groupJobs(jobs.data).map((group) => {
            const cards = (
              <div className="grid gap-4 md:grid-cols-2">
                {group.jobs.map((job) => <JobCard key={job.id} job={job} sourceName={sourceNames.get(job.sourceId) ?? job.sourceId} />)}
              </div>
            );
            const heading = `${TIER_LABEL[group.tier]} (${group.jobs.length})`;
            // Low scores are kept (the profile never removes a job) but folded away.
            return group.tier === 'low' ? (
              <details key={group.tier} className="flex flex-col gap-3">
                <summary className="cursor-pointer font-serif text-lg font-semibold">{heading}</summary>
                <div className="pt-3">{cards}</div>
              </details>
            ) : (
              <section key={group.tier} aria-label={TIER_LABEL[group.tier]} className="flex flex-col gap-3">
                <h2 className="font-serif text-lg font-semibold">{heading}</h2>
                {cards}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
