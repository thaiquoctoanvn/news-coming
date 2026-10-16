import { Chip, Link, Tabs } from '@heroui/react';
import type { Key } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { formatDigestDate, formatTime, relativeDay, safeUrl, vietnamDay } from '../../lib/format.ts';
import { useEvents } from '../../lib/queries.ts';
import type { CalendarEvent } from '../../lib/types.ts';

const IMPORTANCE: Readonly<Record<number, { label: string; color: 'danger' | 'warning' | 'default' }>> = {
  3: { label: 'Rất quan trọng', color: 'danger' },
  2: { label: 'Quan trọng', color: 'warning' },
  1: { label: 'Theo dõi', color: 'default' },
};

export function groupByDay(events: readonly CalendarEvent[]): [string, CalendarEvent[]][] {
  const days = new Map<string, CalendarEvent[]>();
  for (const e of events) days.set(vietnamDay(e.startsAt), [...(days.get(vietnamDay(e.startsAt)) ?? []), e]);
  return [...days.entries()];
}

export function CalendarPage() {
  const { topicId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const showAll = params.get('filter') === 'all';
  const events = useEvents(topicId);
  const visible = (events.data ?? []).filter((e) => showAll || e.importance >= 3);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">Lịch sự kiện vĩ mô</h1>
          <p className="text-sm text-muted">Giờ Việt Nam. Từ hôm qua tới 45 ngày tới.</p>
        </div>
        <Tabs selectedKey={showAll ? 'all' : 'major'} onSelectionChange={(key: Key) => setParams(key === 'all' ? { filter: 'all' } : {})}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Lọc sự kiện">
              <Tabs.Tab id="major">Rất quan trọng<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="all">Tất cả<Tabs.Indicator /></Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>

      {events.isPending && <LoadingCards count={2} />}
      {events.isError && <ErrorState title="Không tải được lịch" error={events.error} onRetry={() => void events.refetch()} />}
      {events.isSuccess && visible.length === 0 && <EmptyState title="Chưa có sự kiện trong khoảng này" />}

      {groupByDay(visible).map(([day, items]) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2 id={`day-${day}`} className="mb-2 flex items-baseline gap-2 border-b border-border pb-1">
            <span className="font-serif text-lg font-semibold">{formatDigestDate(day)}</span>
            <span className="text-xs text-muted">{relativeDay(items[0]?.startsAt ?? `${day}T00:00:00+07:00`)}</span>
          </h2>
          <ul className="divide-y divide-border">
            {items.map((e) => {
              const importance = IMPORTANCE[e.importance] ?? IMPORTANCE[1]!;
              const href = safeUrl(e.sourceUrl);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="w-12 tabular-nums font-semibold">{formatTime(e.startsAt)}</span>
                  <span className="min-w-0 flex-1">{e.title}</span>
                  <Chip size="sm" variant="soft" color={importance.color}>{importance.label}</Chip>
                  {href && <Link href={href} target="_blank" rel="noopener noreferrer" className="text-xs">Nguồn<Link.Icon /></Link>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-xs text-muted">
        Nguồn: Federal Reserve (FOMC), Bank of Japan, U.S. Treasury (đấu giá trái phiếu), FRED — Federal Reserve Bank of St. Louis (CPI, NFP, PCE, PPI, GDP, JOLTS).
        Giờ BOJ công bố là ước tính (khoảng trưa giờ Tokyo).
      </p>
    </div>
  );
}
