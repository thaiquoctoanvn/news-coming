-- The site now follows one finance/geopolitics topic and picks items by category only:
-- drop the "Tổ chức" (per_entity) priority slot. Entities stay for keyword matching.
delete from public.digest_slots where topic_id = 'macro_finance' and kind = 'per_entity';
