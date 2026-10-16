import { Navigate, createBrowserRouter, isRouteErrorResponse, useRouteError } from 'react-router';
import { AppShell } from './components/AppShell.tsx';
import { EmptyState, ErrorState, LoadingCards } from './components/States.tsx';
import { CalendarPage } from './features/calendar/CalendarPage.tsx';
import { DigestPage } from './features/digest/DigestPage.tsx';
import { useTopics } from './lib/queries.ts';

function HomeRedirect() {
  const topics = useTopics();
  if (topics.isPending) return <div className="mx-auto max-w-5xl p-4"><LoadingCards /></div>;
  if (topics.isError) return <div className="mx-auto max-w-5xl p-4"><ErrorState title="Không tải được chủ đề" error={topics.error} /></div>;
  const first = topics.data[0];
  if (!first) return <div className="mx-auto max-w-5xl p-4"><EmptyState title="Chưa có chủ đề nào đang bật" /></div>;
  return <Navigate to={`/t/${first.id}`} replace />;
}

function RouteError() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error) && error.status === 404 ? 'Không tìm thấy trang' : 'Đã có lỗi xảy ra';
  return (
    <div className="mx-auto max-w-5xl p-4">
      <ErrorState title={title} error={isRouteErrorResponse(error) ? new Error(error.statusText) : error} />
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect />, errorElement: <RouteError /> },
  {
    path: '/t/:topicId',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DigestPage /> },
      { path: 'lich', element: <CalendarPage /> },
      {
        path: 'bieu-do',
        lazy: async () => ({ Component: (await import('./features/charts/ChartsPage.tsx')).ChartsPage }),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
