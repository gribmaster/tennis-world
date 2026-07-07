import type { ElementType, ReactNode } from 'react';

// PageContainer — the centered, gutter-padded content column used inside pages.
// Wraps children in the shared `.container-page` (max-width 1280px, fluid side
// padding). Vertical rhythm is the caller's concern; this only owns horizontal
// centering + gutters. Polymorphic `as` lets a page render it as <section> etc.
export interface PageContainerProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

export function PageContainer({ children, as, className }: PageContainerProps) {
  const Tag = as ?? 'div';
  return (
    <Tag className={['container-page', className ?? ''].filter(Boolean).join(' ')}>{children}</Tag>
  );
}
