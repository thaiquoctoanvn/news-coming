import { NavLink, Outlet, useParams } from 'react-router';
import { useTopics } from '../lib/queries.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

const SECTIONS = [
  { path: '', label: 'Bản tin' },
  { path: 'lich', label: 'Lịch sự kiện' },
  { path: 'bieu-do', label: 'Biểu đồ' },
] as const;

function navClass({ isActive }: { isActive: boolean }): string {
  const base = 'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus';
  return isActive ? `${base} bg-foreground text-background` : `${base} text-muted hover:bg-surface hover:text-foreground`;
}

export function AppShell() {
  const { topicId = '' } = useParams();
  const topics = useTopics();
  const otherTopics = (topics.data ?? []).filter((t) => t.id !== topicId);
  const current = topics.data?.find((t) => t.id === topicId);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <NavLink to={`/t/${topicId}`} className="mr-auto">
            <span className="block font-serif text-2xl font-bold tracking-tight">News Coming</span>
            <span className="block text-xs uppercase tracking-[0.2em] text-muted">{current?.name ?? 'Bản tin'}</span>
          </NavLink>
          <nav aria-label="Mục chính" className="flex items-center gap-1">
            {SECTIONS.map((s) => (
              <NavLink key={s.path} to={`/t/${topicId}${s.path ? `/${s.path}` : ''}`} end={s.path === ''} className={navClass}>
                {s.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
        </div>
        {otherTopics.length > 0 && (
          <nav aria-label="Chủ đề" className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 pb-3 text-sm">
            {otherTopics.map((t) => (
              <NavLink key={t.id} to={`/t/${t.id}`} className="whitespace-nowrap text-muted hover:text-foreground">
                {t.name}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl space-y-1 px-4 py-6 text-xs text-muted">
          <p>Tóm tắt tự động bằng AI, chỉ dựa trên nội dung bài gốc. Luôn đọc bài gốc trước khi ra quyết định đầu tư.</p>
          <p>Số liệu: U.S. Treasury, Bộ Tài chính Nhật, Yahoo Finance, EIA; lịch: Federal Reserve, Bank of Japan, FRED (Federal Reserve Bank of St. Louis).</p>
        </div>
      </footer>
    </div>
  );
}
