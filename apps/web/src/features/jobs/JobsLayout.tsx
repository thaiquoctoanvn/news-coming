import { Button } from '@heroui/react';
import { NavLink, Navigate, Outlet } from 'react-router';
import { AreaSwitch } from '../../components/AreaSwitch.tsx';
import { LoadingCards } from '../../components/States.tsx';
import { ThemeToggle } from '../../components/ThemeToggle.tsx';
import { useAuth } from '../../lib/auth.tsx';

function navClass({ isActive }: { isActive: boolean }): string {
  const base = 'min-w-0 truncate rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus';
  return isActive ? `${base} bg-foreground text-background` : `${base} text-muted hover:bg-surface hover:text-foreground`;
}

/** Job board shell: admin only. RLS is the real guard; this only avoids showing an empty page. */
export function JobsLayout() {
  const auth = useAuth();
  if (auth.isLoading) return <div className="mx-auto max-w-6xl p-4"><LoadingCards /></div>;
  if (!auth.isAdmin) return <Navigate to="/dang-nhap?next=/viec-lam" replace />;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 md:flex-none">
            <span className="block font-serif text-2xl font-bold leading-tight tracking-tight">News Coming</span>
            <span className="block truncate text-xs uppercase tracking-[0.2em] text-muted">Việc làm</span>
          </div>
          <AreaSwitch current="jobs" className="order-last w-full md:order-none md:w-auto" />
          <nav aria-label="Mục chính" className="order-last flex w-full min-w-0 items-center gap-1 md:order-none md:w-auto md:flex-1 md:justify-center">
            <NavLink to="/viec-lam" end className={navClass}>Bản tin</NavLink>
            <NavLink to="/viec-lam/quan-tri" className={navClass}>Quản trị</NavLink>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button size="sm" variant="ghost" onPress={() => void auth.signOut()}>Đăng xuất</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted">
          Tin lấy tự động từ các trang tuyển dụng; điểm và nhận xét do AI chấm theo hồ sơ đã lưu. Luôn mở tin gốc để kiểm tra trước khi ứng tuyển.
        </p>
      </footer>
    </div>
  );
}
