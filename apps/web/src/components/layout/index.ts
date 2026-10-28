// Shared app-shell layout components (apps/web-local — no packages/ui, Decision #6).
export { AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';

export { AppHeader } from './AppHeader';
export type { AppHeaderProps } from './AppHeader';

export { Footer } from './Footer';

export { PageContainer } from './PageContainer';
export type { PageContainerProps } from './PageContainer';

// Shared navigation config — exported so future screens can reference the same
// destinations without re-declaring them.
export { PRIMARY_NAV, isActiveRoute } from './nav-items';
export type { NavItem } from './nav-items';
