import { Link } from 'react-router';
import { useAuth } from '../lib/auth.tsx';

type Props = {
  current: 'finance' | 'jobs';
  className?: string;
};

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus';
const BASE = `shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${FOCUS}`;
const ACTIVE = `${BASE} border-foreground text-foreground`;
const IDLE = `${BASE} border-border text-muted hover:text-foreground`;

/**
 * Switches between the public finance digest and the admin-only job board.
 * Visitors only have one area, so they see nothing; the job board opens in a new tab.
 */
export function AreaSwitch({ current, className = '' }: Props) {
  const auth = useAuth();
  if (!auth.isAdmin) return null;
  return (
    <nav aria-label="Khu vực" className={`flex items-center gap-2 ${className}`}>
      <Link to="/" aria-current={current === 'finance' ? 'page' : undefined} className={current === 'finance' ? ACTIVE : IDLE}>
        Tài chính
      </Link>
      {current === 'jobs' ? (
        <Link to="/viec-lam" aria-current="page" className={ACTIVE}>Việc làm</Link>
      ) : (
        <Link to="/viec-lam" target="_blank" rel="noopener noreferrer" className={IDLE}>
          Việc làm <span aria-hidden="true">↗</span>
          <span className="sr-only"> (mở tab mới)</span>
        </Link>
      )}
    </nav>
  );
}
