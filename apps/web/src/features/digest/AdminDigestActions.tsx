import { Button } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../lib/auth.tsx';
import { requestMoreNews } from '../../lib/functions.ts';
import { useSupabase } from '../../lib/supabase.ts';

/** "Xem thêm" for the signed-in admin: adds a few more items to this digest (about 1–2 minutes). */
export function AdminDigestActions({ digestId }: { digestId: string }) {
  const auth = useAuth();
  const db = useSupabase();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const more = useMutation({
    mutationFn: () => requestMoreNews(db, digestId),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['digest', digestId] });
      if (r.added === 0) setMessage('Không còn tin phù hợp và đọc được trong khung giờ của bản tin này.');
      else if (r.aiStopped) setMessage(`Đã thêm ${r.added} tin; AI tạm hết lượt nên ${r.added - r.translated} tin sẽ hiện sau lần chạy kế tiếp.`);
      else setMessage(`Đã thêm ${r.translated} tin${r.rejected ? `, loại ${r.rejected} tin không đạt kiểm tra trung thực` : ''}.`);
    },
    onError: (e: Error) => setMessage(e.message),
  });
  if (!auth.isAdmin) return null;

  return (
    <div className="flex flex-col items-center gap-2 border-t border-border pt-6">
      <Button variant="secondary" isDisabled={more.isPending} onPress={() => more.mutate()}>
        {more.isPending ? 'Đang lấy thêm tin (1–2 phút)…' : 'Xem thêm tin'}
      </Button>
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
    </div>
  );
}
