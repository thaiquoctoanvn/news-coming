// Shared shape and help texts of a priority slot (digest_slots).

export type Slot = {
  topic_id: string;
  id: string;
  position: number;
  label_vi: string;
  kind: 'category' | 'per_category' | 'per_entity' | 'fill';
  category_ids: string[];
  max_items: number;
  min_score: number;
  extra_item_min_score: number | null;
  enabled: boolean;
};

export const SCORE_HELP = {
  max: 'Số tin nhiều nhất nhóm này được lấy vào một bản tin.',
  min: 'Tin phải đạt ít nhất số điểm này mới được chọn. Điểm ≈ mức tác động AI chấm (0–10) × 10, cộng thêm khi nguồn uy tín hoặc nhiều báo cùng đưa tin, trừ dần khi tin đã cũ.',
  extra: 'Điểm tối thiểu cho tin thứ 2 trở đi của nhóm. Đặt cao hơn điểm sàn để chỉ lấy thêm tin khi thật sự quan trọng; để trống = bằng điểm sàn.',
} as const;

export const KIND_LABEL: Readonly<Record<Slot['kind'], string>> = {
  category: 'Tin điểm cao nhất',
  per_category: 'Mỗi danh mục 1 tin',
  per_entity: 'Theo tổ chức',
  fill: 'Lấp phần còn lại',
};
