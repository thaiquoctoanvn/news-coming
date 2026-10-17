import type { ReactNode } from 'react';

/** Titled block on the config page, with an optional action (e.g. "Thêm") on the right. */
export function Section({ id, title, description, action, error, children }: {
  readonly id: string;
  readonly title: string;
  readonly description: ReactNode;
  readonly action?: ReactNode;
  readonly error?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`section-${id}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`section-${id}`} className="font-serif text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
        {action}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {children}
    </section>
  );
}
