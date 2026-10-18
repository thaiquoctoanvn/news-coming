import { useState } from 'react';
import { ChipList, ChipListEditor } from '../../../components/ChipListEditor.tsx';
import { Field, FormDialog } from '../../../components/FormDialog.tsx';
import { InfoTip } from '../../../components/InfoTip.tsx';
import { ErrorState, LoadingCards } from '../../../components/States.tsx';
import { Toggle } from '../../../components/Toggle.tsx';
import { CategoryAssist } from './CategoryAssist.tsx';
import { EditButton } from './RowActions.tsx';
import { Section } from './Section.tsx';
import { useAdminRows } from './use-admin-rows.ts';

export type Category = {
  topic_id: string;
  id: string;
  name_vi: string;
  keywords: string[];
  exclude_keywords: string[];
  description_en: string | null;
  position: number;
  enabled: boolean;
};

const HELP = {
  keywords: 'Tin có ít nhất một từ này trong tiêu đề hoặc mô tả được xếp vào danh mục.',
  exclude: 'Tin có từ này sẽ không xếp vào danh mục dù khớp từ khóa nhận diện. Ví dụ mục Dầu: “olive oil”.',
  description: 'Mô tả tiếng Anh giúp AI xếp tin vào đúng danh mục khi chấm điểm.',
} as const;
const HEAD = 'px-3 py-2 font-medium';

type Patch = Pick<Category, 'keywords' | 'exclude_keywords' | 'description_en'>;

export function CategoriesSection({ topicId }: { topicId: string }) {
  const { rows, error, update } = useAdminRows<Category>('categories', topicId, 'position');
  const [editing, setEditing] = useState<Category | null>(null);
  const save = (c: Category, patch: Partial<Category>) => update.mutate({ match: { topic_id: c.topic_id, id: c.id }, patch });

  return (
    <Section id="categories" title="Danh mục" description="Từ khóa lọc tin trước khi gọi AI (tiếng Anh, khớp nguyên từ; * ở cuối = khớp phần đầu từ)." error={error}>
      {rows.isPending && <LoadingCards count={1} />}
      {rows.isError && <ErrorState title="Không tải được danh mục" error={rows.error} />}
      {rows.isSuccess && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[56rem] table-fixed text-sm">
            <colgroup>
              <col className="w-16" /><col className="w-40" /><col /><col className="w-56" /><col className="w-64" /><col className="w-14" />
            </colgroup>
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th scope="col" className={HEAD}>Bật</th>
                <th scope="col" className={HEAD}>Danh mục</th>
                <th scope="col" className={HEAD}>Từ khóa nhận diện <InfoTip label="Từ khóa nhận diện">{HELP.keywords}</InfoTip></th>
                <th scope="col" className={HEAD}>Từ khóa ngoại lệ <InfoTip label="Từ khóa ngoại lệ">{HELP.exclude}</InfoTip></th>
                <th scope="col" className={HEAD}>Mô tả cho AI <InfoTip label="Mô tả cho AI">{HELP.description}</InfoTip></th>
                <th scope="col" className={HEAD}><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.data.map((c) => (
                <tr key={c.id} className={c.enabled ? '' : 'text-muted'}>
                  <td className="px-3 py-3 align-top"><Toggle label={`Bật ${c.name_vi}`} isSelected={c.enabled} onChange={(enabled) => save(c, { enabled })} /></td>
                  <td className="px-3 py-3 align-top">
                    <span className="block truncate font-medium" title={c.name_vi}>{c.name_vi}</span>
                    <span className="block truncate font-mono text-xs text-muted" title={c.id}>{c.id}</span>
                  </td>
                  <td className="px-3 py-3 align-top"><ChipList values={c.keywords} /></td>
                  <td className="px-3 py-3 align-top"><ChipList values={c.exclude_keywords} tone="danger" /></td>
                  <td className="px-3 py-3 align-top">
                    <p className="line-clamp-3 text-xs leading-relaxed" title={c.description_en ?? undefined}>{c.description_en || <span className="text-muted">Chưa có</span>}</p>
                  </td>
                  <td className="px-2 py-2 align-top"><EditButton name={c.name_vi} onPress={() => setEditing(c)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CategoryDialog
          category={editing}
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

function CategoryDialog({ category, onSave, onClose }: { category: Category; onSave: (patch: Patch) => void; onClose: () => void }) {
  const [keywords, setKeywords] = useState(category.keywords);
  const [exclude, setExclude] = useState(category.exclude_keywords);
  const [description, setDescription] = useState(category.description_en ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (keywords.length === 0) return setError('Cần ít nhất 1 từ khóa nhận diện');
    onSave({ keywords, exclude_keywords: exclude, description_en: description.trim() || null });
  };

  return (
    <FormDialog title={`Sửa danh mục ${category.name_vi}`} onSubmit={handleSubmit} onClose={onClose} error={error}>
      <p className="text-xs text-muted">Tên và mã danh mục cố định: <span className="font-medium text-foreground">{category.name_vi}</span> · <span className="font-mono">{category.id}</span></p>
      <div className="flex flex-col gap-1">
        <span className="text-muted">Từ khóa nhận diện <InfoTip label="Từ khóa nhận diện">{HELP.keywords}</InfoTip></span>
        <ChipListEditor label="Từ khóa nhận diện" values={keywords} onChange={setKeywords} />
        <span className="text-xs text-muted">Enter hoặc dấu phẩy để thêm; bấm vào chip để sửa.</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted">Từ khóa ngoại lệ <InfoTip label="Từ khóa ngoại lệ">{HELP.exclude}</InfoTip></span>
        <ChipListEditor label="Từ khóa ngoại lệ" tone="danger" values={exclude} onChange={setExclude} />
      </div>
      <CategoryAssist
        topicId={category.topic_id}
        categoryId={category.id}
        keywords={keywords}
        excludeKeywords={exclude}
        onAddKeywords={(items) => setKeywords((k) => [...new Set([...k, ...items])])}
        onAddExcludes={(items) => setExclude((k) => [...new Set([...k, ...items])])}
        onUseDescription={setDescription}
      />
      <Field label={<>Mô tả cho AI <InfoTip label="Mô tả cho AI">{HELP.description}</InfoTip></>}>
        <textarea
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-focus"
        />
      </Field>
    </FormDialog>
  );
}
