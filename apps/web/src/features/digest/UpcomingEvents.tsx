import { NavLink } from 'react-router';
import { formatShortDate, formatTime, relativeDay } from '../../lib/format.ts';
import { useEvents } from '../../lib/queries.ts';

const SHOWN = 4;

export function UpcomingEvents({ topicId }: { topicId: string }) {
  const events = useEvents(topicId);
  const now = Date.now();
  const upcoming = (events.data ?? []).filter((e) => Date.parse(e.startsAt) >= now && e.importance >= 3).slice(0, SHOWN);
  if (upcoming.length === 0) return null;

  return (
    <section aria-labelledby="upcoming-heading" className="rounded-2xl bg-surface px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="upcoming-heading" className="text-sm font-semibold">Sự kiện quan trọng sắp tới</h2>
        <NavLink to={`/t/${topicId}/lich`} className="text-xs text-muted hover:text-foreground">Xem lịch →</NavLink>
      </div>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {upcoming.map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <span className="w-24 shrink-0 tabular-nums text-muted">{formatShortDate(e.startsAt)} {formatTime(e.startsAt)}</span>
            <span>{e.title} <span className="text-xs text-muted">({relativeDay(e.startsAt)})</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
