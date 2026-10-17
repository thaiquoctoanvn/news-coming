import { Button } from '@heroui/react';
import { PencilIcon } from '../../../components/icons.tsx';

/** The pencil button that opens a row's edit popup. */
export function EditButton({ name, onPress }: { readonly name: string; readonly onPress: () => void }) {
  return (
    <Button isIconOnly size="sm" variant="ghost" aria-label={`Sửa ${name}`} onPress={onPress}>
      <PencilIcon />
    </Button>
  );
}
