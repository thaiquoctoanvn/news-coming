import { Button } from '@heroui/react';
import { useState } from 'react';
import { Button as AriaButton, GridList, GridListItem, useDragAndDrop } from 'react-aria-components';
import { InfoTip } from '../../../components/InfoTip.tsx';
import { GripIcon, PlusIcon, TrashIcon } from '../../../components/icons.tsx';
import { ErrorState, LoadingCards } from '../../../components/States.tsx';
import { Toggle } from '../../../components/Toggle.tsx';
import type { Category } from './CategoriesSection.tsx';
import { EditButton } from './RowActions.tsx';
import { Section } from './Section.tsx';
import { SlotDialog } from './SlotDialog.tsx';
import { SCORE_HELP, type Slot } from './slot-meta.ts';
import { moveIds, positionChanges } from './slot-order.ts';
import { useAdminRows } from './use-admin-rows.ts';

type Editing = { mode: 'add' } | { mode: 'edit'; slot: Slot } | null;

export function SlotsSection({ topicId }: { topicId: string }) {
  const slots = useAdminRows<Slot>('digest_slots', topicId, 'position');
  const categories = useAdminRows<Category>('categories', topicId, 'position');
  const [editing, setEditing] = useState<Editing>(null);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);

  const rows = slots.rows.data ?? [];
  const byId = new Map(rows.map((s) => [s.id, s]));
  const ordered = (pendingOrder ?? rows.map((s) => s.id)).map((id) => byId.get(id)).filter((s): s is Slot => Boolean(s));
  const categoryName = new Map((categories.rows.data ?? []).map((c) => [c.id, c.name_vi]));
  const match = (s: Slot) => ({ topic_id: s.topic_id, id: s.id });

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (e) => {
      if (e.target.dropPosition === 'on') return;
      const order = moveIds(ordered.map((s) => s.id), [...e.keys].map(String), String(e.target.key), e.target.dropPosition);
      const changes = positionChanges(order, new Map(rows.map((s) => [s.id, s.position])));
      if (changes.length === 0) return;
      setPendingOrder(order);
      slots.updateMany.mutate(
        changes.map((c) => ({ match: { topic_id: topicId, id: c.id }, patch: { position: c.position } })),
        { onSettled: () => setPendingOrder(null) },
      );
    },
  });

  const handleSave = (slot: Slot) => {
    const { topic_id: _t, id: _i, ...patch } = slot;
    if (editing?.mode === 'edit') slots.update.mutate({ match: match(slot), patch });
    else slots.insert.mutate({ ...slot, position: rows.reduce((m, s) => Math.max(m, s.position), 0) + 1 });
    setEditing(null);
  };

  return (
    <Section
      id="slots"
      title="Thứ tự ưu tiên"
      description="Bản tin chọn tin theo từng nhóm từ trên xuống. Kéo biểu tượng ⠿ để đổi thứ tự."
      error={slots.error}
      action={<Button size="sm" variant="secondary" onPress={() => setEditing({ mode: 'add' })}><PlusIcon className="size-3.5" />Thêm nhóm</Button>}
    >
      {slots.rows.isPending && <LoadingCards count={1} />}
      {slots.rows.isError && <ErrorState title="Không tải được thứ tự ưu tiên" error={slots.rows.error} />}
      {slots.rows.isSuccess && (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>Tối đa <InfoTip label="Tối đa">{SCORE_HELP.max}</InfoTip></span>
            <span>Điểm sàn <InfoTip label="Điểm sàn">{SCORE_HELP.min}</InfoTip></span>
            <span>Sàn tin thứ 2+ <InfoTip label="Sàn tin thứ 2+">{SCORE_HELP.extra}</InfoTip></span>
          </p>
          <GridList
            aria-label="Thứ tự ưu tiên"
            items={ordered}
            dragAndDropHooks={dragAndDropHooks}
            renderEmptyState={() => <p className="p-4 text-sm text-muted">Chưa có nhóm nào.</p>}
            className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border"
          >
            {(slot) => (
              <GridListItem
                id={slot.id}
                textValue={slot.label_vi}
                className={({ isDragging, isDropTarget }) =>
                  `flex items-center gap-3 bg-background px-3 py-2.5 outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'bg-surface' : ''} ${slot.enabled ? '' : 'text-muted'}`}
              >
                <AriaButton slot="drag" aria-label={`Kéo để đổi thứ tự ${slot.label_vi}`} className="cursor-grab rounded p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-focus">
                  <GripIcon />
                </AriaButton>
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted">{ordered.indexOf(slot) + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium" title={slot.label_vi}>{slot.label_vi}</span>
                  <span className="flex min-w-0 flex-wrap gap-1">
                    {slot.kind === 'fill'
                      ? <span className="text-xs text-muted">Mọi danh mục còn lại</span>
                      : slot.category_ids.map((id) => (
                        <span key={id} className="max-w-40 truncate rounded-full bg-default px-2 py-0.5 text-xs" title={categoryName.get(id) ?? id}>{categoryName.get(id) ?? id}</span>
                      ))}
                  </span>
                </div>
                <dl className="hidden shrink-0 grid-cols-3 gap-x-4 text-center text-xs sm:grid">
                  <div><dt className="text-muted">Tối đa</dt><dd className="tabular-nums">{slot.max_items}</dd></div>
                  <div><dt className="text-muted">Sàn</dt><dd className="tabular-nums">{slot.min_score}</dd></div>
                  <div><dt className="text-muted">Tin 2+</dt><dd className="tabular-nums">{slot.extra_item_min_score ?? '—'}</dd></div>
                </dl>
                <Toggle label={`Bật ${slot.label_vi}`} isSelected={slot.enabled} onChange={(enabled) => slots.update.mutate({ match: match(slot), patch: { enabled } })} />
                <EditButton name={slot.label_vi} onPress={() => setEditing({ mode: 'edit', slot })} />
                <Button
                  isIconOnly size="sm" variant="ghost" aria-label={`Xóa ${slot.label_vi}`}
                  onPress={() => window.confirm(`Xóa nhóm "${slot.label_vi}"?`) && slots.remove.mutate(match(slot))}
                >
                  <TrashIcon className="size-4 text-danger" />
                </Button>
              </GridListItem>
            )}
          </GridList>
        </div>
      )}
      {editing && (
        <SlotDialog
          topicId={topicId}
          slot={editing.mode === 'edit' ? editing.slot : null}
          categories={categories.rows.data ?? []}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}
