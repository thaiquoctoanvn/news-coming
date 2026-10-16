// Formatting for Vietnamese readers; all times are shown in Vietnam time.

export const VIETNAM_TZ = 'Asia/Ho_Chi_Minh';
const WORDS_PER_MINUTE = 220;

const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TZ, weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TZ, day: '2-digit', month: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: VIETNAM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "Thứ Sáu, 16/10/2026" for a YYYY-MM-DD digest date. */
export function formatDigestDate(date: string): string {
  const text = dateFormat.format(new Date(`${date}T12:00:00+07:00`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** YYYY-MM-DD of an instant in Vietnam time. */
export function vietnamDay(iso: string | Date): string {
  return dayKey.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** "+0,12" / "−1,05" with a real minus sign; empty when there is no previous value. */
export function formatChange(change: number | null, digits = 2): string {
  if (change === null) return '';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(change), digits)}`;
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE));
}

/** "còn 3 ngày", "hôm nay", "đã qua" relative to `now`, by Vietnam calendar day. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const days = Math.round((Date.parse(`${vietnamDay(iso)}T00:00:00Z`) - Date.parse(`${vietnamDay(now)}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'hôm nay';
  if (days === 1) return 'ngày mai';
  if (days < 0) return 'đã qua';
  return `còn ${days} ngày`;
}

/** Only http(s) links may be rendered (react security rules: no javascript:/data: URLs). */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
