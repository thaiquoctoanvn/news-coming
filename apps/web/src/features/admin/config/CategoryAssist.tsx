import { Button } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { PlusIcon } from '../../../components/icons.tsx';
import { requestCategoryAssist } from '../../../lib/functions.ts';
import { useSupabase } from '../../../lib/supabase.ts';

const BRIEF_MAX_CHARS = 600;

type Props = {
  readonly topicId: string;
  /** Existing category by id, or the name typed in the add popup. */
  readonly category: { readonly id: string } | { readonly name: string };
  readonly keywords: readonly string[];
  readonly excludeKeywords: readonly string[];
  readonly onAddKeywords: (items: string[]) => void;
  readonly onAddExcludes: (items: string[]) => void;
  readonly onUseDescription: (text: string) => void;
};

/** "AI gợi ý": the admin describes the category, AI suggests; nothing changes until the admin picks a suggestion. */
export function CategoryAssist({ topicId, category, keywords, excludeKeywords, onAddKeywords, onAddExcludes, onUseDescription }: Props) {
  const db = useSupabase();
  const [brief, setBrief] = useState('');
  const assist = useMutation({ mutationFn: () => requestCategoryAssist(db, topicId, category, brief.trim()) });
  const result = assist.data;
  const newKeywords = (result?.keywords ?? []).filter((k) => !keywords.includes(k));
  const newExcludes = (result?.excludeKeywords ?? []).filter((k) => !excludeKeywords.includes(k));

  return (
    <section aria-label="AI gợi ý" className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-3">
      <label className="flex flex-col gap-1">
        <span className="font-medium">AI gợi ý</span>
        <span className="text-xs text-muted">Mô tả danh mục này cần theo dõi tin gì (tiếng Việt được). AI chỉ gợi ý, đại ca chọn cái muốn dùng rồi bấm OK mới lưu.</span>
        <textarea
          rows={3}
          maxLength={BRIEF_MAX_CHARS}
          value={brief}
          placeholder="Ví dụ: giá vàng thế giới, ngân hàng trung ương mua vàng, quỹ ETF vàng; không lấy tin trang sức"
          onChange={(e) => setBrief(e.target.value)}
          className="w-full rounded-xl border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-focus"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{brief.length}/{BRIEF_MAX_CHARS}</span>
        <Button size="sm" variant="secondary" isDisabled={brief.trim().length < 3 || assist.isPending} onPress={() => assist.mutate()}>
          {assist.isPending ? 'Đang gợi ý…' : 'Gợi ý'}
        </Button>
      </div>
      {assist.isError && <p role="alert" className="text-xs text-danger">{assist.error.message}</p>}

      {result && (
        <div className="flex flex-col gap-3 text-xs">
          <Suggestions title="Từ khóa nhận diện" items={newKeywords} onAdd={onAddKeywords} />
          <Suggestions title="Từ khóa ngoại lệ" items={newExcludes} tone="danger" onAdd={onAddExcludes} />
          {result.description && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted">Mô tả cho AI</span>
              <p className="rounded-lg bg-surface p-2 leading-relaxed">{result.description}</p>
              <Button size="sm" variant="ghost" className="self-start" onPress={() => onUseDescription(result.description)}>Dùng mô tả này</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Suggestions({ title, items, tone = 'default', onAdd }: { title: string; items: readonly string[]; tone?: 'default' | 'danger'; onAdd: (items: string[]) => void }) {
  const chip = tone === 'danger' ? 'border-danger/40 text-danger' : 'border-border text-foreground';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">{title}</span>
        {items.length > 1 && <Button size="sm" variant="ghost" onPress={() => onAdd([...items])}>Thêm tất cả</Button>}
      </div>
      {items.length === 0 ? (
        <span className="text-muted">Không có gợi ý mới.</span>
      ) : (
        <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {items.map((k) => (
            <li key={k}>
              <button
                type="button" title={`Thêm "${k}"`} aria-label={`Thêm ${title.toLowerCase()} "${k}"`} onClick={() => onAdd([k])}
                className={`inline-flex max-w-56 items-center gap-1 rounded-full border border-dashed px-2 py-0.5 hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus ${chip}`}
              >
                <PlusIcon className="size-3 shrink-0" />
                <span className="truncate">{k}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
