import { Card } from '@heroui/react';
import { useState } from 'react';
import { ChipList, ChipListEditor } from '../../../components/ChipListEditor.tsx';
import { FIELD_INPUT, Field, FormDialog } from '../../../components/FormDialog.tsx';
import { InfoTip } from '../../../components/InfoTip.tsx';
import { ErrorState, LoadingCards } from '../../../components/States.tsx';
import { EditButton } from './RowActions.tsx';
import { Section } from './Section.tsx';
import { useAdminRows } from './use-admin-rows.ts';

type Topic = {
  id: string;
  ai_daily_request_cap: number;
  settings: Record<string, unknown>;
};

type NumberSetting = { key: string; label: string; help: string; min: number };

const FIELDS: readonly NumberSetting[] = [
  { key: 'ai_daily_request_cap', label: 'Request AI mỗi ngày', help: 'Trần số lần gọi AI trong một ngày cho cả hệ thống, để không vượt hạn mức miễn phí.', min: 0 },
  { key: 'settings.summary_words', label: 'Độ dài tóm tắt (từ)', help: 'Số từ mục tiêu của mỗi bản tóm tắt tiếng Việt.', min: 50 },
  { key: 'settings.more_batch_size', label: 'Tin mỗi lần “Xem thêm”', help: 'Số tin thêm vào bản tin mỗi lần bấm Xem thêm (tối đa 4 để kịp giới hạn 150 giây).', min: 1 },
  { key: 'settings.daily_cap_more', label: 'Lượt “Xem thêm” mỗi ngày', help: 'Số lần được bấm Xem thêm trong một ngày.', min: 0 },
  { key: 'settings.refresh_size', label: 'Tin mỗi lần “Cập nhật”', help: 'Số tin bổ sung mỗi lần bấm Cập nhật tin mới.', min: 1 },
  { key: 'settings.daily_cap_refresh', label: 'Lượt “Cập nhật” mỗi ngày', help: 'Số lần được bấm Cập nhật tin mới trong một ngày.', min: 0 },
  { key: 'settings.daily_cap_assist', label: 'Lượt “AI gợi ý” mỗi ngày', help: 'Số lần được bấm Gợi ý trong popup sửa danh mục; mỗi lần dùng 1 request AI.', min: 0 },
];
const EXCLUDE_HELP = 'Tin có một trong các từ này bị bỏ ngay từ đầu, không xét danh mục nào (trừ nguồn chính thức). Dùng cho tin rác như trang giá, “price today”.';

const SETTINGS_PREFIX = 'settings.';

function read(topic: Topic, key: string): unknown {
  return key.startsWith(SETTINGS_PREFIX) ? topic.settings[key.slice(SETTINGS_PREFIX.length)] : topic[key as keyof Topic];
}

function excludeOf(topic: Topic): string[] {
  return Array.isArray(topic.settings.exclude_keywords) ? (topic.settings.exclude_keywords as string[]) : [];
}

/** Update for the topics row: plain columns as-is, settings.* merged into the jsonb. */
export function topicPatch(topic: Topic, values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const settings = { ...topic.settings };
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith(SETTINGS_PREFIX)) settings[key.slice(SETTINGS_PREFIX.length)] = value;
    else columns[key] = value;
  }
  return { ...columns, settings };
}

export function GeneralSettings({ topicId }: { topicId: string }) {
  const { rows, error, update } = useAdminRows<Topic>('topics', null, 'position');
  const [isEditing, setIsEditing] = useState(false);
  const topic = rows.data?.find((t) => t.id === topicId);

  return (
    <Section
      id="general"
      title="Cài đặt chung"
      description="Hạn mức AI, độ dài tóm tắt, giới hạn nút bấm và tin rác cần bỏ."
      error={error}
      action={topic && <EditButton name="cài đặt chung" onPress={() => setIsEditing(true)} />}
    >
      {rows.isPending && <LoadingCards count={1} />}
      {rows.isError && <ErrorState title="Không tải được cài đặt" error={rows.error} />}
      {topic && (
        <Card className="gap-5 p-5">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <dt className="min-w-0 text-muted">{f.label} <InfoTip label={f.label}>{f.help}</InfoTip></dt>
                <dd className="shrink-0 font-medium tabular-nums">{String(read(topic, f.key) ?? '—')}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Từ khóa bỏ hẳn tin <InfoTip label="Từ khóa bỏ hẳn tin">{EXCLUDE_HELP}</InfoTip></span>
            <ChipList values={excludeOf(topic)} tone="danger" empty="Chưa có" />
          </div>
        </Card>
      )}
      {topic && isEditing && (
        <SettingsDialog
          topic={topic}
          onSave={(values) => {
            update.mutate({ match: { id: topic.id }, patch: topicPatch(topic, values) });
            setIsEditing(false);
          }}
          onClose={() => setIsEditing(false)}
        />
      )}
    </Section>
  );
}

function SettingsDialog({ topic, onSave, onClose }: { topic: Topic; onSave: (values: Record<string, unknown>) => void; onClose: () => void }) {
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(read(topic, f.key) ?? '')])),
  );
  const [exclude, setExclude] = useState(excludeOf(topic));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const values: Record<string, unknown> = { 'settings.exclude_keywords': exclude };
    for (const f of FIELDS) {
      const value = Number(numbers[f.key]);
      if (numbers[f.key] === '' || !Number.isInteger(value) || value < f.min) return setError(`${f.label}: cần số nguyên ≥ ${f.min}`);
      values[f.key] = value;
    }
    onSave(values);
  };

  return (
    <FormDialog title="Sửa cài đặt chung" onSubmit={handleSubmit} onClose={onClose} error={error}>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f, i) => (
          <Field key={f.key} label={<>{f.label} <InfoTip label={f.label}>{f.help}</InfoTip></>}>
            <input
              autoFocus={i === 0}
              type="number"
              min={f.min}
              value={numbers[f.key] ?? ''}
              onChange={(e) => setNumbers((n) => ({ ...n, [f.key]: e.target.value }))}
              className={`${FIELD_INPUT} tabular-nums`}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted">Từ khóa bỏ hẳn tin <InfoTip label="Từ khóa bỏ hẳn tin">{EXCLUDE_HELP}</InfoTip></span>
        <ChipListEditor label="Từ khóa bỏ hẳn tin" tone="danger" values={exclude} onChange={setExclude} />
      </div>
    </FormDialog>
  );
}
