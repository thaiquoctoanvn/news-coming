import { useState } from 'react';
import { FIELD_INPUT, Field, FormDialog } from '../../../components/FormDialog.tsx';
import { InfoTip } from '../../../components/InfoTip.tsx';
import { OptionSelect } from '../../../components/OptionSelect.tsx';
import type { Category } from './CategoriesSection.tsx';
import { KIND_LABEL, SCORE_HELP, type Slot } from './slot-meta.ts';
import { slotId } from './slot-order.ts';

const KINDS = ['category', 'per_category', 'fill'] as const;
const KIND_HELP: Readonly<Record<(typeof KINDS)[number], string>> = {
  category: 'Lấy các tin điểm cao nhất thuộc các danh mục đã chọn.',
  per_category: 'Mỗi danh mục đã chọn lấy 1 tin tốt nhất; danh mục không có tin đạt sàn thì bỏ trống.',
  fill: 'Lấp chỗ trống bằng tin điểm cao nhất của mọi danh mục còn lại. Thường đặt cuối danh sách.',
};

type Props = {
  topicId: string;
  slot: Slot | null;
  categories: readonly Category[];
  onSave: (slot: Slot) => void;
  onClose: () => void;
};

/** Add or edit one priority group. */
export function SlotDialog({ topicId, slot, categories, onSave, onClose }: Props) {
  const [name, setName] = useState(slot?.label_vi ?? '');
  const [kind, setKind] = useState<Slot['kind']>(slot?.kind === 'per_entity' ? 'category' : slot?.kind ?? 'category');
  const [categoryIds, setCategoryIds] = useState<string[]>(slot?.category_ids ?? []);
  const [maxItems, setMaxItems] = useState(String(slot?.max_items ?? 1));
  const [minScore, setMinScore] = useState(String(slot?.min_score ?? 40));
  const [extraScore, setExtraScore] = useState(slot?.extra_item_min_score === null || !slot ? '' : String(slot.extra_item_min_score));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const max = Number(maxItems);
    const min = Number(minScore);
    const extra = extraScore.trim() === '' ? null : Number(extraScore);
    if (!name.trim()) return setError('Cần nhập tên nhóm');
    if (kind !== 'fill' && categoryIds.length === 0) return setError('Chọn ít nhất 1 danh mục');
    if (!Number.isInteger(max) || max < 1) return setError('Số tin tối đa phải là số nguyên ≥ 1');
    if (!Number.isInteger(min) || (extra !== null && !Number.isInteger(extra))) return setError('Điểm phải là số nguyên');
    onSave({
      topic_id: topicId,
      id: slot?.id ?? slotId(name),
      position: slot?.position ?? 0,
      label_vi: name.trim(),
      kind,
      category_ids: kind === 'fill' ? [] : categoryIds,
      max_items: max,
      min_score: min,
      extra_item_min_score: extra,
      enabled: slot?.enabled ?? true,
    });
  };

  return (
    <FormDialog title={slot ? 'Sửa nhóm ưu tiên' : 'Thêm nhóm ưu tiên'} onSubmit={handleSubmit} onClose={onClose} error={error}>
      <Field label="Tên nhóm">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={FIELD_INPUT} />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-muted">Cách lấy tin</legend>
        {KINDS.map((k) => (
          <label key={k} className="flex items-start gap-2">
            <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="mt-1" />
            <span><span className="font-medium">{KIND_LABEL[k]}</span><span className="block text-xs text-muted">{KIND_HELP[k]}</span></span>
          </label>
        ))}
      </fieldset>

      {kind !== 'fill' && (
        <div className="flex flex-col gap-1">
          <span className="text-muted">Danh mục</span>
          <OptionSelect
            multiple
            label="Danh mục"
            placeholder="Chọn danh mục…"
            options={categories.map((c) => ({ id: c.id, label: c.name_vi }))}
            value={categoryIds}
            onChange={setCategoryIds}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label={<>Tối đa <InfoTip label="Tối đa">{SCORE_HELP.max}</InfoTip></>}>
          <input type="number" min={1} value={maxItems} onChange={(e) => setMaxItems(e.target.value)} className={FIELD_INPUT} />
        </Field>
        <Field label={<>Điểm sàn <InfoTip label="Điểm sàn">{SCORE_HELP.min}</InfoTip></>}>
          <input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} className={FIELD_INPUT} />
        </Field>
        <Field label={<>Sàn tin 2+ <InfoTip label="Sàn tin thứ 2+">{SCORE_HELP.extra}</InfoTip></>}>
          <input type="number" value={extraScore} placeholder="—" onChange={(e) => setExtraScore(e.target.value)} className={FIELD_INPUT} />
        </Field>
      </div>
    </FormDialog>
  );
}
