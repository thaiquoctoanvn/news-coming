import { Card } from '@heroui/react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { formatChange, formatNumber } from '../../lib/format.ts';
import { MACRO_SERIES, MACRO_SERIES_IDS, macroLatest, macroRows } from '../../lib/market.ts';
import { useMarketSeries } from '../../lib/queries.ts';

// FED target range and U.S. economy in one chart: all values are percentages of similar size.
// Monthly data, so it keeps a fixed 3-year window instead of the page's 1/3/12-month tabs.

const MONTHS = 36;
const FED_COLOR = '#2563eb';

const percent = (value: number): string => `${formatNumber(value, 2)}%`;

/** "2026-09-01" → "T9/2026" (axis "T9/26"). */
export function monthLabel(date: string, short = false): string {
  const [year = '', month = ''] = date.split('-');
  return `T${Number(month)}/${short ? year.slice(2) : year}`;
}

function tooltipValue(value: unknown): string {
  if (Array.isArray(value)) return `${percent(Number(value[0]))}–${percent(Number(value[1]))}`;
  return percent(Number(value));
}

export function MacroChart({ topicId }: { topicId: string }) {
  const data = useMarketSeries(topicId, MACRO_SERIES_IDS, MONTHS);

  if (data.isPending) return <LoadingCards count={1} />;
  if (data.isError) return <ErrorState title="Không tải được số liệu kinh tế Mỹ" error={data.error} onRetry={() => void data.refetch()} />;
  if (data.data.length === 0) return <EmptyState title="Chưa có số liệu lãi suất và kinh tế Mỹ">Số liệu được cập nhật cùng bản tin sáng.</EmptyState>;

  const rows = macroRows(data.data);
  const latest = macroLatest(data.data, percent);

  return (
    <Card className="gap-3 p-5">
      <Card.Title className="font-serif text-lg font-semibold">Lãi suất FED & kinh tế Mỹ (%)</Card.Title>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {latest.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-muted">{item.label} · {monthLabel(item.date)}</dt>
            <dd className="font-semibold tabular-nums">
              {item.text}
              {item.change !== null && item.change !== 0 && (
                <span className="ml-1 text-xs font-normal text-muted">({formatChange(item.change, 2)} điểm %)</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="date" tickFormatter={(d: string) => monthLabel(d, true)} tick={{ fontSize: 12, fill: 'currentColor' }} minTickGap={24} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: 'currentColor' }} tickFormatter={(v: number) => formatNumber(v, 1)} width={40} />
            <Tooltip
              formatter={(value) => tooltipValue(value)}
              labelFormatter={(d) => `Tháng ${monthLabel(String(d)).slice(1)}`}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--foreground)' }}
            />
            <Legend />
            <Area dataKey="fed" name="Lãi suất mục tiêu FED" type="stepAfter" stroke={FED_COLOR} fill={FED_COLOR} fillOpacity={0.18} connectNulls />
            {MACRO_SERIES.map((s) => (
              <Line key={s.id} dataKey={s.id} name={s.label} type="monotone" stroke={s.color} strokeWidth={2} dot={false} connectNulls />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted">
        CPI, PCE, PPI: % thay đổi so với cùng kỳ năm trước; thất nghiệp: % lực lượng lao động; lãi suất FED: khoảng mục tiêu cuối mỗi tháng.
        Chỉ số tháng được công bố chậm 2–6 tuần. Nguồn: FRED, Federal Reserve Bank of St. Louis.
      </p>
    </Card>
  );
}
