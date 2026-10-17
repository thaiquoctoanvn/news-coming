import { Card } from '@heroui/react';
import { useParams, useSearchParams } from 'react-router';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SegmentedTabs } from '../../components/SegmentedTabs.tsx';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { formatNumber, formatShortDate } from '../../lib/format.ts';
import { SERIES, chartRows } from '../../lib/market.ts';
import { useMarketData } from '../../lib/queries.ts';

// Loaded lazily (route-level import) so Recharts does not weigh on the digest page.

const RANGES = [
  { id: '30', label: '1 tháng', days: 30 },
  { id: '90', label: '3 tháng', days: 90 },
  { id: '365', label: '1 năm', days: 365 },
] as const;

// Mid-tone colors that stay readable on both light and dark backgrounds.
const LINE_COLORS = ['#2563eb', '#d97706', '#059669'];

const CHARTS = [
  { id: 'us', title: 'Lợi suất trái phiếu Kho bạc Mỹ (%)', source: 'U.S. Treasury' },
  { id: 'jp', title: 'Lợi suất trái phiếu chính phủ Nhật (%)', source: 'Bộ Tài chính Nhật' },
  { id: 'oil', title: 'Giá dầu (USD/thùng)', source: 'Yahoo Finance, EIA' },
] as const;

export function ChartsPage() {
  const { topicId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const range = RANGES.find((r) => r.id === params.get('range')) ?? RANGES[1];
  const market = useMarketData(topicId, range.days);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold">Biểu đồ</h1>
        <SegmentedTabs ariaLabel="Khoảng thời gian" items={RANGES} selectedKey={range.id} onChange={(id) => setParams({ range: id })} />
      </div>

      {market.isPending && <LoadingCards count={3} />}
      {market.isError && <ErrorState title="Không tải được số liệu" error={market.error} onRetry={() => void market.refetch()} />}
      {market.isSuccess && market.data.length === 0 && <EmptyState title="Chưa có số liệu" />}

      {market.isSuccess && market.data.length > 0 && CHARTS.map((chart) => {
        const series = SERIES.filter((s) => s.group === chart.id);
        const rows = chartRows(market.data, series.map((s) => s.id));
        return (
          <Card key={chart.id} className="gap-3 p-5">
            <Card.Title className="font-serif text-lg font-semibold">{chart.title}</Card.Title>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => formatShortDate(`${d}T12:00:00Z`)} tick={{ fontSize: 12, fill: 'currentColor' }} minTickGap={24} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: 'currentColor' }} tickFormatter={(v: number) => formatNumber(v, 1)} width={48} />
                  <Tooltip
                    formatter={(value) => formatNumber(Number(value), 3)}
                    labelFormatter={(d) => formatShortDate(`${String(d)}T12:00:00Z`)}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--foreground)' }}
                  />
                  <Legend />
                  {series.map((s, i) => (
                    <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">Nguồn: {chart.source}.</p>
          </Card>
        );
      })}
    </div>
  );
}
