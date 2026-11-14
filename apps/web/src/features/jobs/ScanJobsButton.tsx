import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormDialog } from '../../components/FormDialog.tsx';
import { requestJobScan } from '../../lib/functions.ts';
import { fetchScanQuota, fetchSearchStatus } from '../../lib/jobs-api.ts';
import { useSupabase } from '../../lib/supabase.ts';

/** "Quét ngay": shows what a scan costs and only starts it after OK. The daily limit is enforced on the server. */
export function ScanJobsButton() {
  const db = useSupabase();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const quota = useQuery({ queryKey: ['job-scan-quota'], queryFn: () => fetchScanQuota(db) });
  const search = useQuery({ queryKey: ['job-search-status'], queryFn: () => fetchSearchStatus(db) });
  const scan = useMutation({
    mutationFn: () => requestJobScan(db),
    onSuccess: setMessage,
    onError: (e: Error) => setMessage(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['job-scan-quota'] }),
  });
  const left = quota.data ? Math.max(0, quota.data.dailyCap - quota.data.usedToday) : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="sm" variant="secondary" isDisabled={scan.isPending || left === 0} onPress={() => setIsConfirming(true)}>
        {scan.isPending ? 'Đang gửi…' : 'Quét ngay'}
      </Button>
      {left === 0 && <p className="text-xs text-muted">Đã dùng hết {quota.data?.dailyCap} lượt quét hôm nay.</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {isConfirming && (
        <FormDialog
          title="Quét tin việc làm ngay?"
          onSubmit={() => {
            setIsConfirming(false);
            setMessage(null);
            scan.mutate();
          }}
          onClose={() => setIsConfirming(false)}
        >
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Lần quét mất khoảng 5–15 phút. Tải lại trang để xem kết quả.</li>
            <li>Lần quét dùng chung hạn mức AI miễn phí với bảng tin tài chính. Quét sát giờ ra bảng tin có thể làm bảng tin ra chậm.</li>
            <li>
              Mỗi lần quét tốn khoảng 0,004 USD tìm kiếm.
              {search.data && search.data.monthlyStopUsd > 0 && (
                <> Tháng này đã tiêu <strong>{search.data.monthCostUsd.toFixed(3)} USD</strong>, hệ thống tự dừng tìm kiếm trả phí ở {search.data.monthlyStopUsd.toFixed(2)} USD.</>
              )}
            </li>
            <li>
              {left !== null && quota.data
                ? <>Hôm nay còn <strong>{left}</strong> / {quota.data.dailyCap} lượt quét tay.</>
                : 'Số lượt quét tay mỗi ngày có giới hạn.'}
            </li>
            <li>Nếu đang có một lần quét chạy, lần này sẽ xếp hàng và chạy ngay sau đó.</li>
          </ul>
        </FormDialog>
      )}
    </div>
  );
}
