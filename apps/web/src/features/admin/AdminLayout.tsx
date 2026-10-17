import { Button } from '@heroui/react';
import { NavLink, Navigate, Outlet, useSearchParams } from 'react-router';
import { LoadingCards } from '../../components/States.tsx';
import { ThemeToggle } from '../../components/ThemeToggle.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useTopics } from '../../lib/queries.ts';

function navClass({ isActive }: { isActive: boolean }): string {
  const base = 'min-w-0 truncate rounded-full px-3 py-1.5 text-sm font-medium transition-colors';
  return isActive ? `${base} bg-foreground text-background` : `${base} text-muted hover:bg-surface hover:text-foreground`;
}

/** Admin pages: only for a fresh admin session; the topic is kept in ?topic=. */
export function AdminLayout() {
  const auth = useAuth();
  const topics = useTopics();
  const [params, setParams] = useSearchParams();
  if (auth.isLoading) return <div className="mx-auto max-w-6xl p-4"><LoadingCards /></div>;
  if (!auth.isAdmin) return <Navigate to="/dang-nhap" replace />;

  const topicId = params.get('topic') ?? topics.data?.[0]?.id ?? '';
  const query = topicId ? `?topic=${topicId}` : '';

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="mr-auto font-serif text-xl font-bold">Quản trị</span>
          <nav aria-label="Quản trị" className="flex min-w-0 gap-1">
            <NavLink to={`/quan-tri${query}`} end className={navClass}>Vận hành</NavLink>
            <NavLink to={`/quan-tri/cau-hinh${query}`} className={navClass}>Cấu hình</NavLink>
            <NavLink to={topicId ? `/t/${topicId}` : '/'} className={navClass({ isActive: false })}>Trang tin</NavLink>
          </nav>
          {(topics.data?.length ?? 0) > 1 && (
            <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
              Chủ đề
              <select
                value={topicId}
                onChange={(e) => setParams({ topic: e.target.value })}
                className="min-w-0 max-w-48 truncate rounded-lg border border-border bg-background px-2 py-1 text-foreground"
              >
                {(topics.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <ThemeToggle />
          <Button size="sm" variant="ghost" onPress={() => void auth.signOut()}>Đăng xuất</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet context={{ topicId }} />
      </main>
    </div>
  );
}
