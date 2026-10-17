import { describe, expect, test } from 'vitest';
import { weekdaysLabel } from './EditionsSection.tsx';
import { topicPatch } from './GeneralSettings.tsx';

describe('config sections', () => {
  test('weekdays read naturally', () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Hằng ngày');
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('Thứ Hai – Thứ Sáu');
    expect(weekdaysLabel([6, 7])).toBe('T7, CN');
  });

  test('general settings keep other jsonb keys', () => {
    const topic = { id: 't', ai_daily_request_cap: 60, settings: { pin: { max: 3 }, summary_words: 350 } };

    expect(topicPatch(topic, { ai_daily_request_cap: 80, 'settings.summary_words': 300, 'settings.exclude_keywords': ['price today'] })).toEqual({
      ai_daily_request_cap: 80,
      settings: { pin: { max: 3 }, summary_words: 300, exclude_keywords: ['price today'] },
    });
  });
});
