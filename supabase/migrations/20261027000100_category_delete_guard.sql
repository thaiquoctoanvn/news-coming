-- Categories can be added and deleted on the config page (docs/DESIGN.md §11.2).
-- digest_slots.category_ids is a plain array with no foreign key, so deleting a category that a slot
-- still lists would leave the slot pointing at nothing. Block it; the admin removes it from the slots first.
-- Old articles of a deleted category keep their place in digests and only lose the label (on delete set null).

create function public.block_delete_used_category() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_slots text;
begin
  -- Deleting the whole topic cascades to both tables; nothing to protect then.
  if not exists (select 1 from public.topics where id = old.topic_id) then
    return old;
  end if;
  select string_agg(label_vi, ', ' order by position) into v_slots
  from public.digest_slots
  where topic_id = old.topic_id and old.id = any (category_ids);
  if v_slots is not null then
    raise exception 'Danh mục "%" đang dùng trong nhóm ưu tiên: %. Gỡ khỏi các nhóm này trước rồi mới xóa.', old.name_vi, v_slots
      using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger categories_block_delete_used
before delete on public.categories
for each row execute function public.block_delete_used_category();
