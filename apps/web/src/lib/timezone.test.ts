import { describe, expect, test } from 'vitest';
import { utcOffset, zoneLabel } from './timezone.ts';

describe('time zone labels', () => {
  test('show the UTC offset with a friendly name', () => {
    expect(zoneLabel('Asia/Ho_Chi_Minh')).toBe('UTC+7 · Giờ Việt Nam');
    expect(zoneLabel('Europe/Paris')).toBe(`${utcOffset('Europe/Paris')} · Giờ Paris`);
  });

  test('follow daylight saving time', () => {
    expect(utcOffset('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe('UTC-4');
    expect(utcOffset('America/New_York', new Date('2026-12-01T12:00:00Z'))).toBe('UTC-5');
  });
});
