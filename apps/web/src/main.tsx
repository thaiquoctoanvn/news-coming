import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/noto-serif/600.css';
import '@fontsource/noto-serif/700.css';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './App.tsx';
import { applyTheme, initialTheme } from './components/ThemeToggle.tsx';
import { readEnv } from './lib/env.ts';
import { SupabaseContext, createSupabase } from './lib/supabase.ts';

applyTheme(initialTheme());

const root = createRoot(document.getElementById('root') as HTMLElement);
const env = readEnv();

if (!env) {
  root.render(
    <main className="mx-auto max-w-xl p-6">
      <h1 className="font-serif text-xl font-bold">Thiếu cấu hình</h1>
      <p className="mt-2 text-sm text-muted">Cần VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY khi build.</p>
    </main>,
  );
} else {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
  root.render(
    <StrictMode>
      <SupabaseContext.Provider value={createSupabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SupabaseContext.Provider>
    </StrictMode>,
  );
}
