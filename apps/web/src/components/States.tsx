import { Alert, Button, Card, Skeleton } from '@heroui/react';
import type { ReactNode } from 'react';

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="mb-3 h-4 w-28 rounded-full" />
          <Skeleton className="mb-2 h-6 w-4/5 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
        </Card>
      ))}
    </div>
  );
}

type ErrorStateProps = {
  title: string;
  error: unknown;
  onRetry?: () => void;
};

export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  const detail = error instanceof Error ? error.message : 'Lỗi không xác định';
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{detail}</Alert.Description>
      </Alert.Content>
      {onRetry && (
        <Button size="sm" variant="danger-soft" onPress={onRetry}>
          Thử lại
        </Button>
      )}
    </Alert>
  );
}

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
};

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-serif text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
