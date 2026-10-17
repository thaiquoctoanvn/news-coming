// Friendly labels for IANA time zones: "UTC+7 · Giờ Việt Nam" instead of "Asia/Ho_Chi_Minh".

const NAMES: Readonly<Record<string, string>> = {
  'Asia/Ho_Chi_Minh': 'Giờ Việt Nam',
  'Asia/Bangkok': 'Giờ Bangkok',
  'Asia/Tokyo': 'Giờ Tokyo',
  'Asia/Shanghai': 'Giờ Trung Quốc',
  'Asia/Singapore': 'Giờ Singapore',
  'Europe/London': 'Giờ London',
  'Europe/Berlin': 'Giờ Frankfurt',
  'America/New_York': 'Giờ New York',
  'America/Chicago': 'Giờ Chicago',
  'UTC': 'Giờ quốc tế',
};

/** Offset of the zone at `at`, e.g. "UTC+7", "UTC-4", "UTC+5:30". Follows daylight saving time. */
export function utcOffset(timeZone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const offset = part.replace(/^GMT/, '');
    return `UTC${offset || '+0'}`;
  } catch {
    return timeZone;
  }
}

export function zoneName(timeZone: string): string {
  return NAMES[timeZone] ?? `Giờ ${timeZone.split('/').pop()?.replaceAll('_', ' ') ?? timeZone}`;
}

export function zoneLabel(timeZone: string, at = new Date()): string {
  return `${utcOffset(timeZone, at)} · ${zoneName(timeZone)}`;
}
