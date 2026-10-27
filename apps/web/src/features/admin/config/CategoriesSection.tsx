import { Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ChipList, ChipListEditor } from '../../../components/ChipListEditor.tsx';
import { FIELD_INPUT, Field, FormDialog } from '../../../components/FormDialog.tsx';
import { InfoTip } from '../../../components/InfoTip.tsx';
import { PlusIcon, TrashIcon } from '../../../components/icons.tsx';
import { ErrorState, LoadingCards } from '../../../components/States.tsx';
import { Toggle } from '../../../components/Toggle.tsx';
import { categoryIdFor } from './category-id.ts';
import { CategoryAssist } from './CategoryAssist.tsx';
import { EditButton } from './RowActions.tsx';
import { Section } from './Section.tsx';
import type { Slot } from './slot-meta.ts';
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

type Values = Pick<Category, 'name_vi' | 'keywords' | 'exclude_keywords' | 'description_en'>;
type Editing = { mode: 'add' } | { mode: 'edit'; category: Category } | null;

/** Priority slots (by name) that still list the category; it cannot be deleted while any do. */
export function slotsUsing(categoryId: string, slots: readonly Slot[]): string[] {
  return slots.filter((s) => s.category_ids.includes(categoryId)).map((s) => s.label_vi);
}

export function CategoriesSection({ topicId }: { topicId: string }) {
  const { rows, error, update, insert, remove } = useAdminRows<Category>('categories', topicId, 'position');
  const slots = useAdminRows<Slot>('digest_slots', topicId, 'position');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const categories = rows.data ?? [];
  const match = (c: Category) => ({ topic_id: c.topic_id, id: c.id });
  const save = (c: Category, patch: Partial<Category>) => update.mutate({ match: match(c), patch });

  const handleSave = (values: Values) => {
    if (editing?.mode === 'edit') {
      const { name_vi: _name, ...patch } = values;
      save(editing.category, patch);
    } else {
      insert.mutate({
        ...values,
        topic_id: topicId,
        id: categoryIdFor(values.name_vi, categories.map((c) => c.id)),
        position: categories.reduce((m, c) => Math.max(m, c.position), 0) + 1,
        enabled: true,
      });
    }
    setEditing(null);
  };

  const handleDelete = (c: Category) => {
    setDeleting(null);
    // Sources pointing at the category lose their default category, so their list is stale too.
    remove.mutate(match(c), { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-table', 'sources'] }) });
  };

  return (
    <Section
      id="categories"
      title="Danh mục"
      description="Từ khóa lọc tin trước khi gọi AI (tiếng Anh, khớp nguyên từ; * ở cuối = khớp phần đầu từ)."
      error={error}
      action={rows.isSuccess && <Button size="sm" variant="secondary" onPress={() => setEditing({ mode: 'add' })}><PlusIcon className="size-3.5" />Thêm danh mục</Button>}
    >
      {rows.isPending && <LoadingCards count={1} />}
      {rows.isError && <ErrorState title="Không tải được danh mục" error={rows.error} />}
      {rows.isSuccess && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[56rem] table-fixed text-sm">
            <colgroup>
              <col className="w-16" /><col className="w-40" /><col /><col className="w-56" /><col className="w-64" /><col className="w-24" />
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
              {categories.map((c) => (
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
                  <td className="px-2 py-2 align-top">
                    <div className="flex">
                      <EditButton name={c.name_vi} onPress={() => setEditing({ mode: 'edit', category: c })} />
                      <Button isIconOnly size="sm" variant="ghost" aria-label={`Xóa ${c.name_vi}`} onPress={() => setDeleting(c)}>
                        <TrashIcon className="size-4 text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CategoryDialog
          topicId={topicId}
          category={editing.mode === 'edit' ? editing.category : null}
          existingNames={categories.map((c) => c.name_vi)}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteDialog
          category={deleting}
          usedIn={slotsUsing(deleting.id, slots.rows.data ?? [])}
          onConfirm={() => handleDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </Section>
  );
}

type DialogProps = {
  topicId: string;
  /** null = adding a new category. */
  category: Category | null;
  existingNames: readonly string[];
  onSave: (values: Values) => void;
  onClose: () => void;
};

function CategoryDialog({ topicId, category, existingNames, onSave, onClose }: DialogProps) {
  const [name, setName] = useState(category?.name_vi ?? '');
  const [keywords, setKeywords] = useState(category?.keywords ?? []);
  const [exclude, setExclude] = useState(category?.exclude_keywords ?? []);
  const [description, setDescription] = useState(category?.description_en ?? '');
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim().replace(/\s+/g, ' ');

  const handleSubmit = () => {
    if (!category) {
      if (!trimmedName) return setError('Cần nhập tên danh mục');
      if (existingNames.some((n) => n.toLowerCase() === trimmedName.toLowerCase())) return setError('Đã có danh mục cùng tên');
    }
    if (keywords.length === 0) return setError('Cần ít nhất 1 từ khóa nhận diện');
    onSave({ name_vi: category?.name_vi ?? trimmedName, keywords, exclude_keywords: exclude, description_en: description.trim() || null });
  };

  return (
    <FormDialog title={category ? `Sửa danh mục ${category.name_vi}` : 'Thêm danh mục'} onSubmit={handleSubmit} onClose={onClose} error={error}>
      {category ? (
        <p className="text-xs text-muted">Tên và mã danh mục cố định: <span className="font-medium text-foreground">{category.name_vi}</span> · <span className="font-mono">{category.id}</span></p>
      ) : (
        <Field label="Tên danh mục" hint="Mã danh mục được tạo tự động từ tên; sau khi lưu không đổi được tên và mã.">
          <input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={FIELD_INPUT} />
        </Field>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-muted">Từ khóa nhận diện <InfoTip label="Từ khóa nhận diện">{HELP.keywords}</InfoTip></span>
        <ChipListEditor label="Từ khóa nhận diện" values={keywords} onChange={setKeywords} />
        <span className="text-xs text-muted">Enter hoặc dấu phẩy để thêm; bấm vào chip để sửa.</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted">Từ khóa ngoại lệ <InfoTip label="Từ khóa ngoại lệ">{HELP.exclude}</InfoTip></span>
        <ChipListEditor label="Từ khóa ngoại lệ" tone="danger" values={exclude} onChange={setExclude} />
      </div>
      {(category || trimmedName) && (
        <CategoryAssist
          topicId={topicId}
          category={category ? { id: category.id } : { name: trimmedName }}
          keywords={keywords}
          excludeKeywords={exclude}
          onAddKeywords={(items) => setKeywords((k) => [...new Set([...k, ...items])])}
          onAddExcludes={(items) => setExclude((k) => [...new Set([...k, ...items])])}
          onUseDescription={setDescription}
        />
      )}
      <Field label={<>Mô tả cho AI <InfoTip label="Mô tả cho AI">{HELP.description}</InfoTip></>}>
        <textarea
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-focus"
        />
      </Field>
      {!category && (
        <p className="text-xs text-muted">Sau khi thêm, vào <strong>Thứ tự ưu tiên</strong> để đưa danh mục vào một nhóm; nếu không, tin của danh mục chỉ được chọn ở nhóm lấp phần còn lại.</p>
      )}
    </FormDialog>
  );
}

type DeleteProps = { category: Category; usedIn: readonly string[]; onConfirm: () => void; onClose: () => void };

function DeleteDialog({ category, usedIn, onConfirm, onClose }: DeleteProps) {
  if (usedIn.length > 0) {
    return (
      <FormDialog title={`Chưa xóa được ${category.name_vi}`} onSubmit={onClose} onClose={onClose}>
        <p>Danh mục đang dùng trong nhóm ưu tiên: <strong>{usedIn.join(', ')}</strong>.</p>
        <p className="text-muted">Vào <strong>Thứ tự ưu tiên</strong>, gỡ danh mục khỏi các nhóm này (hoặc xóa nhóm) rồi mới xóa được. Muốn tạm ngừng thì tắt công tắc của danh mục.</p>
      </FormDialog>
    );
  }
  return (
    <FormDialog title={`Xóa danh mục ${category.name_vi}?`} onSubmit={onConfirm} onClose={onClose}>
      <p>Xóa hẳn danh mục <strong>{category.name_vi}</strong> (<span className="font-mono">{category.id}</span>). Không khôi phục được.</p>
      <p className="text-muted">Tin cũ vẫn nằm trong bản tin nhưng mất nhãn danh mục; nguồn tin đang gán danh mục này sẽ không còn danh mục mặc định.</p>
    </FormDialog>
  );
}
