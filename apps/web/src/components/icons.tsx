// Small stroke icons (currentColor) shared by the admin pages.

type Props = { readonly className?: string };

function Svg({ className = 'size-4', children }: Props & { readonly children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const PencilIcon = (p: Props) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>;
export const TrashIcon = (p: Props) => <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></Svg>;
export const CloseIcon = (p: Props) => <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
export const PlusIcon = (p: Props) => <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
export const InfoIcon = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Svg>;
export const GripIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
  </Svg>
);
