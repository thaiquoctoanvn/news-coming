import { type ReactNode, useSyncExternalStore } from 'react';

// Staggered grid that keeps reading order left-to-right: each item goes to the currently shortest
// column (by an estimated height), so the most important items stay in the first row.

const BREAKPOINTS = [
  { query: '(min-width: 1024px)', columns: 3 },
  { query: '(min-width: 640px)', columns: 2 },
] as const;

function columnsNow(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return 1;
  return BREAKPOINTS.find((b) => window.matchMedia(b.query).matches)?.columns ?? 1;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const lists = BREAKPOINTS.map((b) => window.matchMedia(b.query));
  lists.forEach((l) => l.addEventListener('change', onChange));
  return () => lists.forEach((l) => l.removeEventListener('change', onChange));
}

export function useColumnCount(): number {
  return useSyncExternalStore(subscribe, columnsNow, () => 1);
}

/** Splits items into columns, placing each one in the column with the smallest estimated height. */
export function distribute<T>(items: readonly T[], columns: number, estimate: (item: T) => number): T[][] {
  const count = Math.max(1, columns);
  const buckets: T[][] = Array.from({ length: count }, () => []);
  const heights: number[] = Array.from({ length: count }, () => 0);
  for (const item of items) {
    const target = heights.indexOf(Math.min(...heights));
    buckets[target]!.push(item);
    heights[target]! += estimate(item);
  }
  return buckets;
}

type Props<T> = {
  readonly items: readonly T[];
  readonly getKey: (item: T) => string;
  readonly estimate: (item: T) => number;
  readonly renderItem: (item: T) => ReactNode;
};

export function MasonryGrid<T>({ items, getKey, estimate, renderItem }: Props<T>) {
  const columns = useColumnCount();
  const buckets = distribute(items, Math.min(columns, items.length), estimate);
  return (
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
      {buckets.map((bucket, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-4">
          {bucket.map((item) => <div key={getKey(item)}>{renderItem(item)}</div>)}
        </div>
      ))}
    </div>
  );
}
