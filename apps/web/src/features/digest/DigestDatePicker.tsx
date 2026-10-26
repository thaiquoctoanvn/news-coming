import { Calendar, DatePicker } from '@heroui/react';
import { type CalendarDate, parseDate, today } from '@internationalized/date';
import { Group, I18nProvider } from 'react-aria-components';
import { VIETNAM_TZ } from '../../lib/format.ts';

type Props = {
  /** Selected digest day (YYYY-MM-DD) or null when there is none. */
  date: string | null;
  /** Days that have a digest; every other day is shown but cannot be picked. */
  availableDates: readonly string[];
  /** Visible text of the trigger, e.g. "Thứ Hai, 26/10/2026". */
  label: string;
  onSelect: (date: string) => void;
};

/** The digest heading opens a month calendar; only days with a digest can be chosen. */
export function DigestDatePicker({ date, availableDates, label, onSelect }: Props) {
  const available = new Set(availableDates);
  const oldest = availableDates.at(-1);
  const handleChange = (value: CalendarDate | null) => {
    if (value && available.has(value.toString())) onSelect(value.toString());
  };

  return (
    <I18nProvider locale="vi-VN">
      <DatePicker
        aria-label="Chọn ngày bản tin"
        value={date ? parseDate(date) : null}
        onChange={handleChange}
        minValue={oldest ? parseDate(oldest) : undefined}
        maxValue={today(VIETNAM_TZ)}
        isDateUnavailable={(d) => !available.has(d.toString())}
        className="min-w-0"
      >
        <h1 className="min-w-0">
          {/* The calendar popover is positioned against this group; without it the popover never shows. */}
          <Group className="inline-flex min-w-0 max-w-full">
            <DatePicker.Trigger
              aria-label={`Chọn ngày bản tin, đang xem ${label}`}
              className="flex min-w-0 items-center gap-2 rounded-lg px-1 font-serif text-2xl font-bold hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="truncate">{label}</span>
              <DatePicker.TriggerIndicator className="shrink-0 text-base text-muted" />
            </DatePicker.Trigger>
          </Group>
        </h1>
        <DatePicker.Popover>
          <Calendar aria-label="Lịch bản tin">
            <Calendar.Header>
              <Calendar.NavButton slot="previous" />
              <Calendar.Heading />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
              <Calendar.GridBody>{(day) => <Calendar.Cell date={day} />}</Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}
