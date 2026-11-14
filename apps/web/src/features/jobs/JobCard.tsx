import { Card, Chip, Link } from '@heroui/react';
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

/** One posting. Everything is rendered as text; the link only opens http(s) addresses. */
export function JobCard({ job, sourceName }: Props) {
  const href = safeUrl(job.url);
  const isUnverified = job.tier === 'unverified';
  const facts = [job.salary, job.deadline ? `Hạn ${formatDeadline(job.deadline)}` : null, job.postedText].filter(Boolean);

  return (
    <Card render={(props) => <article {...props} />} className={`gap-3 p-5 ${job.tier === 'top' ? 'border-l-4 border-l-success' : ''}`}>
      <Card.Header className="flex min-w-0 flex-wrap items-center gap-2 p-0">
        {job.score !== null && <Chip size="sm" variant="soft" color={scoreColor(job.score)}>{job.score}/10</Chip>}
        {isUnverified && <Chip size="sm" variant="soft" color="warning">Chưa xác minh</Chip>}
        {job.isUpdate && <Chip size="sm" variant="secondary">Cập nhật</Chip>}
        <span className="text-xs text-muted">{sourceName}</span>
      </Card.Header>
      <Card.Title className="font-serif text-lg font-semibold leading-snug">{job.title}</Card.Title>
      <p className="text-sm text-muted">{[job.company ?? '—', job.location].filter(Boolean).join(' · ')}</p>
      {facts.length > 0 && <p className="text-sm">{facts.join(' · ')}</p>}
      <Card.Content className="flex flex-col gap-2 p-0 text-[15px] leading-relaxed">
        {job.reason && <p>{job.reason}</p>}
        {job.tier === 'top' && job.tip && <p className="text-sm"><strong>Nên nhấn mạnh trong CV:</strong> {job.tip}</p>}
        {isUnverified && (
          <p className="text-sm text-muted">
            {job.verificationNote ?? 'Không đọc được trang này'}. Bấm “Xem tin” để tự kiểm tra tin còn hạn hay không.
          </p>
        )}
      </Card.Content>
      {href && (
        <Card.Footer className="p-0">
          <Link href={href} target="_blank" rel="noopener noreferrer" className="text-sm">
            Xem tin
            <Link.Icon />
          </Link>
        </Card.Footer>
      )}
    </Card>
  );
}
