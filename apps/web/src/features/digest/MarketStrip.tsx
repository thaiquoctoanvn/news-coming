import { Skeleton } from '@heroui/react';
import { formatChange, formatNumber, formatShortDate } from '../../lib/format.ts';
import { latestValues } from '../../lib/market.ts';
import { useMarketData } from '../../lib/queries.ts';

const MARKET_DAYS = 10;

/** Rising oil and rising yields put pressure on markets, so an increase is shown in red. */
function changeClass(change: number | null): string {
  if (change === null || change === 0) return 'text-muted';
  return change > 0 ? 'text-danger' : 'text-success';
}

export function MarketStrip({ topicId }: { topicId: string }) {
  const market = useMarketData(topicId, MARKET_DAYS);

  if (market.isPending) return <Skeleton className="h-20 w-full rounded-2xl" />;
  const values = latestValues(market.data ?? []);
  if (values.length === 0) return null;

  return (
    <section aria-label="Số liệu thị trường" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
      {values.map((v) => (
        <div key={v.info.id} className="bg-background px-3 py-2.5">
          <p className="text-xs text-muted">{v.info.label}</p>
          <p className="font-semibold tabular-nums">
            {v.info.unit === 'USD' ? '$' : ''}{formatNumber(v.value, v.info.unit === '%' ? 3 : 2)}{v.info.unit === '%' ? '%' : ''}
          </p>
          <p className={`text-xs tabular-nums ${changeClass(v.change)}`}>
            {formatChange(v.change, v.info.unit === '%' ? 3 : 2)} <span className="text-muted">· {formatShortDate(`${v.date}T12:00:00Z`)}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
