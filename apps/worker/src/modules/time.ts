// Time zone helpers built on Intl (no dependency): official calendars publish local times.

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant when the clock in `timeZone` shows `date` (YYYY-MM-DD) at `time` (HH:MM). */
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wallClock = Date.UTC(y, m - 1, d, hh, mm);
  const first = wallClock - offsetMs(wallClock, timeZone);
  // Re-check once so dates just after a DST switch get the right offset.
  return new Date(wallClock - offsetMs(first, timeZone));
}

/** YYYY-MM-DD of an instant in `timeZone`. */
export function dateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Month number from "January", "Sept.", "Oct" …; undefined if unknown. */
export function monthNumber(name: string): number | undefined {
  return MONTHS[name.trim().toLowerCase().slice(0, 3)];
}
