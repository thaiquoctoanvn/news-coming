import { Button } from '@heroui/react';
import { useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'news-coming:theme';

/** Theme from the visitor's saved choice, else the system preference. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const handleToggle = () => {
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  };

  return (
    <Button isIconOnly variant="ghost" size="sm" aria-label={next === 'dark' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'} onPress={handleToggle}>
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </Button>
  );
}
