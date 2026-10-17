import { Card } from '@heroui/react';
import { useState } from 'react';
import { FIELD_INPUT, Field, FormDialog } from '../../../components/FormDialog.tsx';
import { ErrorState, LoadingCards } from '../../../components/States.tsx';
import { Toggle } from '../../../components/Toggle.tsx';
import { zoneLabel } from '../../../lib/timezone.ts';
import { EditButton } from './RowActions.tsx';
import { Section } from './Section.tsx';
import { useAdminRows } from './use-admin-rows.ts';

type Edition = {
  topic_id: string;
  id: string;
  name_vi: string;
  timezone: string;
  local_time: string;
  weekdays: number[];
  size_min: number;
  size_max: number;
  run_modules: boolean;
  enabled: boolean;
};

type Patch = Pick<Edition, 'local_time' | 'weekdays' | 'size_min' | 'size_max' | 'run_modules'>;

const WEEKDAYS = [
  { day: 1, short: 'T2', name: 'Thứ Hai' },
  { day: 2, short: 'T3', name: 'Thứ Ba' },
  { day: 3, short: 'T4', name: 'Thứ Tư' },
  { day: 4, short: 'T5', name: 'Thứ Năm' },
  { day: 5, short: 'T6', name: 'Thứ Sáu' },
  { day: 6, short: 'T7', name: 'Thứ Bảy' },
  { day: 7, short: 'CN', name: 'Chủ Nhật' },
] as const;

export function weekdaysLabel(days: readonly number[]): string {
  if (days.length === 7) return 'Hằng ngày';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Thứ Hai – Thứ Sáu';
  return WEEKDAYS.filter((w) => days.includes(w.day)).map((w) => w.short).join(', ');
}

export function EditionsSection({ topicId }: { topicId: string }) {
  const { rows, error, update } = useAdminRows<Edition>('editions', topicId, 'local_time');
  const [editing, setEditing] = useState<Edition | null>(null);
  const save = (e: Edition, patch: Partial<Edition>) => update.mutate({ match: { topic_id: e.topic_id, id: e.id }, patch });

  return (
    <Section id="editions" title="Bản tin" description="Các bản tin cố định trong ngày. Giờ chạy tính theo múi giờ của từng bản tin." error={error}>
      {rows.isPending && <LoadingCards count={1} />}
      {rows.isError && <ErrorState title="Không tải được bản tin" error={rows.error} />}
      {rows.isSuccess && (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.data.map((e) => (
            <Card key={e.id} className={`gap-4 p-5 ${e.enabled ? '' : 'opacity-70'}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Card.Title className="truncate text-base font-semibold" title={e.name_vi}>{e.name_vi}</Card.Title>
                  <p className="text-xs text-muted" title={e.timezone}>{zoneLabel(e.timezone)}</p>
                </div>
                <Toggle label={`Bật ${e.name_vi}`} isSelected={e.enabled} onChange={(enabled) => save(e, { enabled })} />
                <EditButton name={e.name_vi} onPress={() => setEditing(e)} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Giờ chạy</dt><dd className="text-right tabular-nums">{e.local_time.slice(0, 5)}</dd>
                <dt className="text-muted">Ngày chạy</dt><dd className="truncate text-right">{weekdaysLabel(e.weekdays)}</dd>
                <dt className="text-muted">Số tin</dt><dd className="text-right tabular-nums">{e.size_min} – {e.size_max}</dd>
                <dt className="text-muted">Cập nhật số liệu</dt><dd className="text-right">{e.run_modules ? 'Có' : 'Không'}</dd>
              </dl>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <EditionDialog
          edition={editing}
          onSave={(patch) => {
            save(editing, patch);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

function EditionDialog({ edition: e, onSave, onClose }: { edition: Edition; onSave: (patch: Patch) => void; onClose: () => void }) {
  const [time, setTime] = useState(e.local_time.slice(0, 5));
  const [days, setDays] = useState(e.weekdays);
  const [sizeMin, setSizeMin] = useState(String(e.size_min));
  const [sizeMax, setSizeMax] = useState(String(e.size_max));
  const [runModules, setRunModules] = useState(e.run_modules);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: number) =>
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort((a, b) => a - b)));

  const handleSubmit = () => {
    const min = Number(sizeMin);
    const max = Number(sizeMax);
    if (!/^\d{2}:\d{2}$/.test(time)) return setError('Chọn giờ chạy');
    if (days.length === 0) return setError('Chọn ít nhất 1 ngày chạy');
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1) return setError('Số tin phải là số nguyên ≥ 1');
    if (max < min) return setError('Số tin tối đa phải ≥ tối thiểu');
    onSave({ local_time: time, weekdays: days, size_min: min, size_max: max, run_modules: runModules });
  };

  return (
    <FormDialog title={`Sửa ${e.name_vi}`} onSubmit={handleSubmit} onClose={onClose} error={error}>
      <p className="text-xs text-muted">Múi giờ: {zoneLabel(e.timezone)}</p>
      <Field label="Giờ chạy">
        <input type="time" autoFocus value={time} onChange={(ev) => setTime(ev.target.value)} className={`${FIELD_INPUT} tabular-nums`} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-muted">Ngày chạy</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w) => {
            const isOn = days.includes(w.day);
            return (
              <button
                key={w.day} type="button" aria-pressed={isOn} aria-label={w.name} title={w.name} onClick={() => toggleDay(w.day)}
                className={`size-9 rounded-full text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-focus ${isOn ? 'bg-foreground text-background' : 'border border-border text-muted hover:text-foreground'}`}
              >
                {w.short}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Số tin tối thiểu">
          <input type="number" min={1} value={sizeMin} onChange={(ev) => setSizeMin(ev.target.value)} className={FIELD_INPUT} />
        </Field>
        <Field label="Số tin tối đa">
          <input type="number" min={1} value={sizeMax} onChange={(ev) => setSizeMax(ev.target.value)} className={FIELD_INPUT} />
        </Field>
      </div>
      <Toggle label="Cập nhật số liệu thị trường khi chạy" showLabel isSelected={runModules} onChange={setRunModules} />
    </FormDialog>
  );
}
