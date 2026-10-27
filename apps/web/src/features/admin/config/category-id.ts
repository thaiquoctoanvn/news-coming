const MAX_ID_LENGTH = 40;
const FALLBACK_ID = 'danh_muc';

/** Category id from its Vietnamese name: "Lãi suất Nhật" → "lai_suat_nhat"; a suffix keeps it unique. */
export function categoryIdFor(name: string, taken: Iterable<string>): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/_+$/, '') || FALLBACK_ID;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base}_${n}`;
    if (!used.has(id)) return id;
  }
}
