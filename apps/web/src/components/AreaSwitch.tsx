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
 * Visitors only have one area, so they see nothing.
 */
export function AreaSwitch({ current, className = '' }: Props) {
  const auth = useAuth();
  if (!auth.isAdmin) return null;
  return (
    <nav aria-label="Khu vực" className={`flex items-center gap-2 ${className}`}>
      <Link to="/" aria-current={current === 'finance' ? 'page' : undefined} className={current === 'finance' ? ACTIVE : IDLE}>
        Tài chính
      </Link>
      <Link to="/viec-lam" aria-current={current === 'jobs' ? 'page' : undefined} className={current === 'jobs' ? ACTIVE : IDLE}>
        Việc làm
      </Link>
    </nav>
  );
}
