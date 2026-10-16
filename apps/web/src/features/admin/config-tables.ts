// Definitions of the editable config tables (DESIGN.md §11, "Trang Cấu hình").
// A key with a dot ("settings.summary_words") edits one field inside a jsonb column.

export type ColumnType = 'switch' | 'text' | 'number' | 'list' | 'numberList' | 'time' | 'readonly';

export interface Column {
  readonly key: string;
  readonly label: string;
  readonly type: ColumnType;
  readonly hint?: string;
}

export interface TableDef {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly table: string;
  readonly topicScoped: boolean;
  /** Columns that identify a row (used in update/delete). */
  readonly keys: readonly string[];
  readonly order: string;
  readonly columns: readonly Column[];
  /** Fields of the "add" form; omitted when rows cannot be added here. */
  readonly insert?: { readonly columns: readonly Column[]; readonly defaults: Readonly<Record<string, unknown>> };
  readonly allowDelete?: boolean;
}

export const CONFIG_TABLES: readonly TableDef[] = [
  {
    id: 'topic', title: 'Chủ đề', description: 'Tắt chủ đề là dừng toàn bộ: không lấy tin, không gọi AI, ẩn khỏi web.',
    table: 'topics', topicScoped: false, keys: ['id'], order: 'position',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'name_vi', label: 'Tên', type: 'text' },
      { key: 'ai_daily_request_cap', label: 'Request AI/ngày', type: 'number' },
      { key: 'settings.summary_words', label: 'Độ dài tóm tắt (từ)', type: 'number' },
      { key: 'settings.more_batch_size', label: 'Tin mỗi lần Xem thêm', type: 'number' },
      { key: 'settings.refresh_size', label: 'Tin mỗi lần Cập nhật', type: 'number' },
      { key: 'settings.daily_cap_more', label: 'Lượt Xem thêm/ngày', type: 'number' },
      { key: 'settings.daily_cap_refresh', label: 'Lượt Cập nhật/ngày', type: 'number' },
      { key: 'settings.exclude_keywords', label: 'Từ khóa loại trừ', type: 'list', hint: 'phân cách bằng dấu phẩy; * ở cuối = tiền tố' },
    ],
  },
  {
    id: 'editions', title: 'Bản tin', description: 'Giờ chạy theo múi giờ của bản tin; thứ: 1 = Thứ Hai … 7 = Chủ Nhật.',
    table: 'editions', topicScoped: true, keys: ['topic_id', 'id'], order: 'local_time',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'name_vi', label: 'Tên', type: 'text' },
      { key: 'timezone', label: 'Múi giờ', type: 'readonly' },
      { key: 'local_time', label: 'Giờ chạy', type: 'time' },
      { key: 'weekdays', label: 'Thứ', type: 'numberList' },
      { key: 'size_min', label: 'Tối thiểu', type: 'number' },
      { key: 'size_max', label: 'Tối đa', type: 'number' },
      { key: 'run_modules', label: 'Cập nhật số liệu', type: 'switch' },
    ],
  },
  {
    id: 'slots', title: 'Thứ tự ưu tiên (slot)', description: 'Bản tin lấp slot theo thứ tự; điểm sàn loại tin yếu.',
    table: 'digest_slots', topicScoped: true, keys: ['topic_id', 'id'], order: 'position',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'position', label: 'Thứ tự', type: 'number' },
      { key: 'label_vi', label: 'Tên', type: 'text' },
      { key: 'kind', label: 'Kiểu', type: 'readonly' },
      { key: 'category_ids', label: 'Danh mục', type: 'list' },
      { key: 'entity_ids', label: 'Tổ chức', type: 'list' },
      { key: 'max_items', label: 'Tối đa', type: 'number' },
      { key: 'min_score', label: 'Điểm sàn', type: 'number' },
      { key: 'extra_item_min_score', label: 'Sàn tin thứ 2+', type: 'number' },
    ],
  },
  {
    id: 'categories', title: 'Danh mục', description: 'Từ khóa lọc trước khi gọi AI; mô tả tiếng Anh giúp AI xếp đúng danh mục.',
    table: 'categories', topicScoped: true, keys: ['topic_id', 'id'], order: 'position',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'id', label: 'Mã', type: 'readonly' },
      { key: 'name_vi', label: 'Tên', type: 'text' },
      { key: 'keywords', label: 'Từ khóa', type: 'list' },
      { key: 'exclude_keywords', label: 'Loại trừ', type: 'list' },
      { key: 'description_en', label: 'Mô tả cho AI', type: 'text' },
    ],
  },
  {
    id: 'entities', title: 'Tổ chức theo dõi', description: 'Tên gọi khác dùng để nhận ra tổ chức trong tin.',
    table: 'entities', topicScoped: true, keys: ['topic_id', 'id'], order: 'position',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'id', label: 'Mã', type: 'readonly' },
      { key: 'name', label: 'Tên', type: 'text' },
      { key: 'aliases', label: 'Tên gọi khác', type: 'list' },
      { key: 'sec_cik', label: 'SEC CIK', type: 'text' },
    ],
  },
  {
    id: 'sources', title: 'Nguồn tin', description: 'Lỗi gần nhất của nguồn hiện ở cột cuối.',
    table: 'sources', topicScoped: true, keys: ['id'], order: 'name',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'name', label: 'Tên', type: 'text' },
      { key: 'kind', label: 'Loại', type: 'readonly' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'query', label: 'Truy vấn', type: 'text' },
      { key: 'default_category_id', label: 'Danh mục', type: 'text' },
      { key: 'authority', label: 'Uy tín', type: 'number' },
      { key: 'last_error', label: 'Lỗi gần nhất', type: 'readonly' },
    ],
    insert: {
      columns: [
        { key: 'name', label: 'Tên', type: 'text' },
        { key: 'kind', label: 'Loại (rss | google_news)', type: 'text' },
        { key: 'url', label: 'URL (RSS)', type: 'text' },
        { key: 'query', label: 'Truy vấn (Google News)', type: 'text' },
        { key: 'default_category_id', label: 'Danh mục', type: 'text' },
      ],
      defaults: { kind: 'rss', authority: 0, enabled: true },
    },
    allowDelete: true,
  },
  {
    id: 'modules', title: 'Số liệu & lịch', description: 'Module tắt thì không cập nhật, dữ liệu cũ vẫn giữ.',
    table: 'data_modules', topicScoped: true, keys: ['topic_id', 'id'], order: 'id',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'name_vi', label: 'Tên', type: 'text' },
      { key: 'connector', label: 'Nguồn', type: 'readonly' },
    ],
  },
  {
    id: 'ai', title: 'Model AI (dùng chung)', description: 'Thứ tự ưu tiên và hạn mức free; router dừng ở 80% hạn mức/ngày.',
    table: 'ai_providers', topicScoped: false, keys: ['id'], order: 'priority',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'role', label: 'Vai trò', type: 'readonly' },
      { key: 'priority', label: 'Ưu tiên', type: 'number' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'daily_request_limit', label: 'Request/ngày', type: 'number' },
      { key: 'daily_token_limit', label: 'Token/ngày', type: 'number' },
      { key: 'rpm_limit', label: 'Request/phút', type: 'number' },
      { key: 'tpm_limit', label: 'Token/phút', type: 'number' },
    ],
  },
];

// ---------- Value conversion between table cells and columns ----------

export function readValue(row: Readonly<Record<string, unknown>>, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined), row);
}

/** Text shown in an input for a stored value. */
export function toInputText(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return '';
  if (type === 'list' || type === 'numberList') return Array.isArray(value) ? value.join(', ') : String(value);
  if (type === 'time') return String(value).slice(0, 5);
  return String(value);
}

/** Stored value for input text; throws a Vietnamese message when invalid. */
export function fromInputText(text: string, type: ColumnType): unknown {
  const trimmed = text.trim();
  switch (type) {
    case 'number': {
      if (trimmed === '') return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) throw new Error('Cần nhập số');
      return n;
    }
    case 'list':
      return trimmed === '' ? [] : trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    case 'numberList': {
      const values = trimmed === '' ? [] : trimmed.split(',').map((s) => Number(s.trim()));
      if (values.some((n) => !Number.isInteger(n))) throw new Error('Cần danh sách số, ví dụ 1, 2, 3');
      return values;
    }
    case 'time':
      if (!/^\d{2}:\d{2}$/.test(trimmed)) throw new Error('Giờ dạng HH:MM');
      return trimmed;
    default:
      return trimmed === '' ? null : trimmed;
  }
}

/** Update patch for one cell; jsonb fields are merged into the current object. */
export function patchFor(row: Readonly<Record<string, unknown>>, key: string, value: unknown): Record<string, unknown> {
  const [column, field] = key.split('.');
  if (!column) return {};
  if (!field) return { [column]: value };
  const current = (row[column] && typeof row[column] === 'object' ? row[column] : {}) as Record<string, unknown>;
  return { [column]: { ...current, [field]: value } };
}
