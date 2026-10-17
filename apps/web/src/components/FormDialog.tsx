import { Button, Modal } from '@heroui/react';
import type { FormEvent, ReactNode } from 'react';

type Props = {
  readonly title: string;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
  readonly error?: string | null;
  readonly children: ReactNode;
};

/** Popup behind every edit/add button: the fields, then Hủy / OK. Nothing is saved until OK. */
export function FormDialog({ title, onSubmit, onClose, error, children }: Props) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog aria-label={title}>
          <form onSubmit={handleSubmit} className="contents">
            <Modal.CloseTrigger aria-label="Đóng" />
            <Modal.Header>
              <Modal.Heading className="pr-8 font-serif text-lg font-semibold">{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 text-sm">
              {children}
              {error && <p role="alert" className="text-xs text-danger">{error}</p>}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2">
              <Button size="sm" variant="ghost" slot="close">Hủy</Button>
              <Button size="sm" variant="primary" type="submit">OK</Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export const FIELD_INPUT = 'h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-focus';

/** Label above a form control inside a FormDialog. */
export function Field({ label, hint, children }: { readonly label: ReactNode; readonly hint?: string; readonly children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
