import { Button, Card, Chip, Link, Modal } from '@heroui/react';
import { useState } from 'react';
import { safeUrl } from '../../lib/format.ts';
import type { Job } from '../../lib/jobs-api.ts';
import { formatDeadline } from './job-view.ts';

type Props = {
  job: Job;
  sourceName: string;
};

function scoreColor(score: number): 'success' | 'warning' | 'default' {
  if (score >= 7) return 'success';
  return score >= 5 ? 'warning' : 'default';
}

function Labels({ job, sourceName }: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {job.score !== null && <Chip size="sm" variant="soft" color={scoreColor(job.score)}>{job.score}/10</Chip>}
      {job.tier === 'unverified' && <Chip size="sm" variant="soft" color="warning">Chưa xác minh</Chip>}
      {job.isUpdate && <Chip size="sm" variant="secondary">Cập nhật</Chip>}
      <span className="text-xs text-muted">{sourceName}</span>
    </div>
  );
}

/**
 * One posting: a compact card; pressing it opens the full details in a popup, and "Xem tin" at the
 * bottom opens the posting itself.
 * Everything is rendered as text; the link only opens http(s) addresses.
 */
export function JobCard({ job, sourceName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const href = safeUrl(job.url);
  const isUnverified = job.tier === 'unverified';
  const place = [job.company ?? '—', job.location].filter(Boolean).join(' · ');
  const facts = [job.salary, job.deadline ? `Hạn ${formatDeadline(job.deadline)}` : null, job.postedText].filter(Boolean).join(' · ');

  return (
    <>
      <Card
        render={(props) => <article {...props} />}
        className={`flex h-full flex-col gap-0 p-0 transition-colors hover:bg-surface ${job.tier === 'top' ? 'border-l-4 border-l-success' : ''}`}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Xem chi tiết: ${job.title}`}
          onClick={() => setIsOpen(true)}
          className="flex w-full flex-1 flex-col gap-2 rounded-[inherit] p-5 text-left focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Labels job={job} sourceName={sourceName} />
          <h3 className="line-clamp-3 font-serif text-lg font-semibold leading-snug">{job.title}</h3>
          <p className="text-sm text-muted">{place}</p>
          {facts && <p className="text-sm">{facts}</p>}
          {job.reason && <p className="line-clamp-3 text-sm leading-relaxed">{job.reason}</p>}
        </button>
        {/* Outside the button: a link cannot sit inside one. */}
        {href && (
          <div className="border-t border-border px-5 py-3">
            <Link href={href} target="_blank" rel="noopener noreferrer" className="text-sm">
              Xem tin
              <Link.Icon />
            </Link>
          </div>
        )}
      </Card>

      <Modal.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog aria-label={job.title}>
            <Modal.CloseTrigger aria-label="Đóng" />
            <Modal.Header className="flex flex-col items-start gap-3">
              <Labels job={job} sourceName={sourceName} />
              <Modal.Heading className="pr-8 font-serif text-xl font-semibold leading-snug">{job.title}</Modal.Heading>
              <p className="text-sm text-muted">{place}</p>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3 text-[15px] leading-relaxed">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Lương</dt><dd>{job.salary ?? '—'}</dd>
                <dt className="text-muted">Hạn nộp</dt><dd>{job.deadline ? formatDeadline(job.deadline) : '—'}</dd>
                <dt className="text-muted">Ngày đăng</dt><dd>{job.postedText ?? 'không rõ ngày'}</dd>
              </dl>
              {job.reason && <p><strong>Nhận xét:</strong> {job.reason}</p>}
              {job.tip && <p><strong>Nên nhấn mạnh trong CV:</strong> {job.tip}</p>}
              {isUnverified && (
                <p className="rounded-xl border border-warning bg-warning/10 px-3 py-2 text-sm">
                  {job.verificationNote ?? 'Không đọc được trang này'}. Bấm “Xem tin” để tự kiểm tra tin còn hạn hay không.
                </p>
              )}
            </Modal.Body>
            <Modal.Footer className="justify-between">
              {href ? (
                <Link href={href} target="_blank" rel="noopener noreferrer" className="text-sm">
                  Xem tin
                  <Link.Icon />
                </Link>
              ) : <span />}
              <Button size="sm" variant="ghost" slot="close">Đóng</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
