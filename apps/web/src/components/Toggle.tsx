import { Switch } from '@heroui/react';

type Props = {
  label: string;
  isSelected: boolean;
  isDisabled?: boolean;
  showLabel?: boolean;
  onChange: (isSelected: boolean) => void;
};

/** HeroUI switch with an accessible name; the label can be visually hidden in table cells. */
export function Toggle({ label, isSelected, isDisabled = false, showLabel = false, onChange }: Props) {
  return (
    <Switch isSelected={isSelected} isDisabled={isDisabled} onChange={onChange} size="sm">
      {/* Switch.Content is the <label> wrapping the input, so its text names the switch. */}
      <Switch.Content className="flex items-center gap-2">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span className={showLabel ? 'text-sm' : 'sr-only'}>{label}</span>
      </Switch.Content>
    </Switch>
  );
}
