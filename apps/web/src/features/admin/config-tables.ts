// Generic editable tables (sources, data modules, AI models); other config sections have their own UI.
// A key with a dot ("settings.summary_words") edits one field inside a jsonb column.

export type ColumnType = 'switch' | 'text' | 'number' | 'list' | 'numberList' | 'time' | 'category' | 'select' | 'readonly';

export interface Column {
  readonly key: string;
  readonly label: string;
  readonly type: ColumnType;
  readonly hint?: string;
  /** Choices of a 'select' column. */
  readonly options?: readonly { readonly id: string; readonly label: string }[];
  readonly required?: boolean;
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
    id: 'sources', title: 'Nguồn tin', description: 'Lỗi gần nhất của nguồn hiện ở cột cuối.',
    table: 'sources', topicScoped: true, keys: ['id'], order: 'name',
    columns: [
      { key: 'enabled', label: 'Bật', type: 'switch' },
      { key: 'name', label: 'Tên', type: 'text', required: true },
      { key: 'kind', label: 'Loại', type: 'readonly' },
      { key: 'url', label: 'URL', type: 'text', hint: 'Địa chỉ RSS (với nguồn RSS)' },
      { key: 'query', label: 'Truy vấn', type: 'text', hint: 'Từ khóa tìm kiếm (với nguồn Google News)' },
      { key: 'default_category_id', label: 'Danh mục', type: 'category', hint: 'Dùng khi tin không khớp từ khóa danh mục nào' },
      { key: 'authority', label: 'Uy tín', type: 'number', hint: 'Điểm cộng thêm cho tin của nguồn; ≥ 10 = nguồn chính thức, luôn qua bước lọc' },
      { key: 'last_error', label: 'Lỗi gần nhất', type: 'readonly' },
    ],
    insert: {
      columns: [
        { key: 'name', label: 'Tên', type: 'text', required: true },
        { key: 'kind', label: 'Loại', type: 'select', required: true, options: [{ id: 'rss', label: 'RSS' }, { id: 'google_news', label: 'Google News' }] },
        { key: 'url', label: 'URL', type: 'text', hint: 'Địa chỉ RSS (với nguồn RSS)' },
        { key: 'query', label: 'Truy vấn', type: 'text', hint: 'Từ khóa tìm kiếm (với nguồn Google News)' },
        { key: 'default_category_id', label: 'Danh mục', type: 'category' },
        { key: 'authority', label: 'Uy tín', type: 'number' },
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
      { key: 'name_vi', label: 'Tên', type: 'text', required: true },
      { key: 'connector', label: 'Nguồn', type: 'readonly' },
    ],
  },
];

/** Shared AI models: shown on the operations page next to today's usage. */
export const AI_TABLE: TableDef = {
  id: 'ai', title: 'Model AI (dùng chung)', description: 'Thứ tự ưu tiên và hạn mức free; router dừng ở 80% hạn mức/ngày.',
  table: 'ai_providers', topicScoped: false, keys: ['id'], order: 'priority',
  columns: [
    { key: 'enabled', label: 'Bật', type: 'switch' },
    { key: 'role', label: 'Vai trò', type: 'readonly' },
    { key: 'priority', label: 'Ưu tiên', type: 'number' },
    { key: 'model', label: 'Model', type: 'text', required: true },
    { key: 'daily_request_limit', label: 'Request/ngày', type: 'number' },
    { key: 'daily_token_limit', label: 'Token/ngày', type: 'number' },
    { key: 'rpm_limit', label: 'Request/phút', type: 'number' },
    { key: 'tpm_limit', label: 'Token/phút', type: 'number' },
  ],
};

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
