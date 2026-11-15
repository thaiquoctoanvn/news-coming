import { Button, Card } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FIELD_INPUT, Field, FormDialog } from '../../components/FormDialog.tsx';
import { Toggle } from '../../components/Toggle.tsx';
import {
  type JobProfile, MAX_PROFILE_CHARS, MAX_PROFILE_KEYWORDS, MAX_PROFILE_TITLE_CHARS, MAX_SCAN_KEYWORDS, deleteJobProfile,
  fetchJobProfiles, saveJobProfile, scanKeywords, setJobProfileEnabled,
} from '../../lib/jobs-api.ts';
import { useSupabase } from '../../lib/supabase.ts';

type Editing = { readonly mode: 'edit'; readonly profile: JobProfile } | { readonly mode: 'add' } | { readonly mode: 'delete'; readonly profile: JobProfile };

/** Job profiles: each one has its own search keywords, is scored separately at every scan and has its own report on the job page. */
export function ProfilesSection() {
  const db = useSupabase();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [error, setError] = useState<string | null>(null);
  const profiles = useQuery({ queryKey: ['job-profiles'], queryFn: () => fetchJobProfiles(db) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['job-profiles'] });

  const toggle = useMutation({
    mutationFn: (profile: JobProfile) => setJobProfileEnabled(db, profile.id, !profile.enabled),
    onSettled: refresh,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (editing?.mode === 'delete') return deleteJobProfile(db, editing.profile.id);
      if (!title.trim()) throw new Error('Cần nhập tiêu đề hồ sơ');
      if (!text.trim()) throw new Error('Cần nhập nội dung hồ sơ');
      return saveJobProfile(db, { ...(editing?.mode === 'edit' ? { id: editing.profile.id } : {}), title, text, keywords });
    },
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const open = (next: Editing) => {
    setError(null);
    setTitle(next.mode === 'edit' ? next.profile.title : '');
    setText(next.mode === 'edit' ? next.profile.text : '');
    setKeywords(next.mode === 'edit' ? next.profile.keywords.join(', ') : '');
    setEditing(next);
  };

  const scan = scanKeywords(profiles.data ?? []);

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Card.Title className="text-base font-semibold">Hồ sơ tìm việc</Card.Title>
        <Button size="sm" variant="secondary" onPress={() => open({ mode: 'add' })}>Thêm hồ sơ</Button>
      </div>
      <p className="text-sm text-muted">
        Mỗi hồ sơ đang bật có từ khoá tìm kiếm riêng, được chấm điểm riêng ở mỗi lần quét và có báo cáo riêng trên trang Bản tin.
        Từ khoá quyết định tin nào được tìm: tiêu đề tin phải chứa một từ khoá của hồ sơ. Nội dung hồ sơ chỉ dùng để chấm điểm, không dùng để loại tin.
        Nội dung được gửi cho AI: chỉ ghi kỹ năng và kinh nghiệm, không ghi họ tên, số điện thoại, email, địa chỉ. Mỗi hồ sơ thêm vào làm tăng số lượt AI mỗi lần quét.
      </p>
      {profiles.isError && <p className="text-sm text-danger">Không tải được: {profiles.error.message}</p>}
      {profiles.isSuccess && profiles.data.length === 0 && <p className="text-sm text-muted">Chưa có hồ sơ nào: lần quét không có từ khoá để tìm nên không thu thập tin nào.</p>}
      {scan.skipped.length > 0 && (
        <p className="text-sm text-warning">
          Mỗi lần quét chỉ tìm {MAX_SCAN_KEYWORDS} từ khoá đầu tiên của các hồ sơ đang bật. Chưa được tìm: {scan.skipped.join(', ')}.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border">
        {(profiles.data ?? []).map((profile) => (
          <li key={profile.id} className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{profile.title}</p>
              <p className="text-sm">Từ khoá: {profile.keywords.join(', ')}</p>
              <p className="line-clamp-2 text-sm text-muted">{profile.text}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Toggle label={`Bật hồ sơ ${profile.title}`} isSelected={profile.enabled} isDisabled={toggle.isPending} onChange={() => toggle.mutate(profile)} />
              <Button size="sm" variant="ghost" onPress={() => open({ mode: 'edit', profile })}>Sửa</Button>
              <Button size="sm" variant="ghost" onPress={() => open({ mode: 'delete', profile })}>Xóa</Button>
            </div>
          </li>
        ))}
      </ul>

      {editing && editing.mode !== 'delete' && (
        <FormDialog title={editing.mode === 'add' ? 'Thêm hồ sơ' : 'Sửa hồ sơ'} onSubmit={() => save.mutate()} onClose={() => setEditing(null)} error={error}>
          <Field label="Tiêu đề (bắt buộc)" hint="Tên hiển thị để chọn hồ sơ trên trang Bản tin, ví dụ “Android Senior”.">
            <input value={title} maxLength={MAX_PROFILE_TITLE_CHARS} required onChange={(event) => setTitle(event.target.value)} className={FIELD_INPUT} />
          </Field>
          <Field label="Từ khoá tìm kiếm (bắt buộc)" hint={`Cách nhau bằng dấu phẩy, tối đa ${MAX_PROFILE_KEYWORDS} từ khoá, ví dụ “android, mobile”. Chỉ lấy tin có tiêu đề chứa một trong các từ khoá.`}>
            <input value={keywords} onChange={(event) => setKeywords(event.target.value)} className={FIELD_INPUT} />
          </Field>
          <Field label="Kỹ năng, số năm kinh nghiệm, cấp bậc, loại việc mong muốn" hint={`${text.length}/${MAX_PROFILE_CHARS} ký tự. Không ghi thông tin cá nhân.`}>
            <textarea
              value={text}
              maxLength={MAX_PROFILE_CHARS}
              rows={10}
              onChange={(event) => setText(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-focus"
            />
          </Field>
        </FormDialog>
      )}
      {editing?.mode === 'delete' && (
        <FormDialog title={`Xóa hồ sơ “${editing.profile.title}”?`} onSubmit={() => save.mutate()} onClose={() => setEditing(null)} error={error}>
          <p>Điểm và các báo cáo của hồ sơ này bị xóa theo và không khôi phục được. Tin tuyển dụng vẫn được giữ cho các hồ sơ khác.</p>
        </FormDialog>
      )}
    </Card>
  );
}
