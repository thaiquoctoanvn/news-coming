import { NavLink, Outlet, useParams } from 'react-router';
import { useAuth } from '../lib/auth.tsx';
import { useTopics } from '../lib/queries.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

const SECTIONS = [
  { path: '', label: 'Bản tin' },
  { path: 'lich', label: 'Lịch sự kiện' },
  { path: 'bieu-do', label: 'Biểu đồ' },
] as const;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus';

function navClass({ isActive }: { isActive: boolean }): string {
  const base = `min-w-0 truncate rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${FOCUS}`;
  return isActive ? `${base} bg-foreground text-background` : `${base} text-muted hover:bg-surface hover:text-foreground`;
}

function topicClass({ isActive }: { isActive: boolean }): string {
  const base = `max-w-48 shrink-0 truncate rounded-full border px-3 py-1 text-xs transition-colors ${FOCUS}`;
  return isActive ? `${base} border-foreground text-foreground` : `${base} border-border text-muted hover:text-foreground`;
}

const ACTION = `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium transition-colors hover:bg-surface ${FOCUS}`;

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function AppShell() {
  const { topicId = '' } = useParams();
  const topics = useTopics();
  const auth = useAuth();
  const allTopics = topics.data ?? [];
  const current = allTopics.find((t) => t.id === topicId);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <NavLink to={`/t/${topicId}`} className={`min-w-0 flex-1 rounded-md md:flex-none ${FOCUS}`}>
            <span className="block font-serif text-2xl font-bold leading-tight tracking-tight">News Coming</span>
            <span className="block truncate text-xs uppercase tracking-[0.2em] text-muted">{current?.name ?? 'Bản tin'}</span>
          </NavLink>

          <nav aria-label="Mục chính" className="order-last flex w-full min-w-0 items-center gap-1 md:order-none md:w-auto md:flex-1 md:justify-center">
            {SECTIONS.map((s) => (
              <NavLink key={s.path} to={`/t/${topicId}${s.path ? `/${s.path}` : ''}`} end={s.path === ''} className={navClass}>
                {s.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {auth.isAdmin ? (
              <NavLink to={`/quan-tri?topic=${topicId}`} className={ACTION}>
                <GearIcon />
                <span className="sr-only sm:not-sr-only">Quản trị</span>
              </NavLink>
            ) : (
              <NavLink to="/dang-nhap" className={ACTION}>
                <LockIcon />
                <span className="sr-only sm:not-sr-only">Đăng nhập</span>
              </NavLink>
            )}
          </div>
        </div>

        {allTopics.length > 1 && (
          <nav aria-label="Chủ đề" className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
            {allTopics.map((t) => (
              <NavLink key={t.id} to={`/t/${t.id}`} className={topicClass} title={t.name}>
                {t.name}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs text-muted">
          <p>Tóm tắt tự động bằng AI, chỉ dựa trên nội dung bài gốc. Luôn đọc bài gốc trước khi ra quyết định đầu tư.</p>
          <p>Số liệu: U.S. Treasury, Bộ Tài chính Nhật, Yahoo Finance, EIA; lịch: Federal Reserve, Bank of Japan, FRED (Federal Reserve Bank of St. Louis).</p>
        </div>
      </footer>
    </div>
  );
}
