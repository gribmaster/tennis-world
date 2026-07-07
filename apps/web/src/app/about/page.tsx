import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { AboutPage } from '@/features/static-pages';

// About page (`/about`) — a static marketing screen (Feature 29). Resolves the
// footer "Company → About" link.
//
// SERVER component, presentational only. There is NO repository boundary here: the
// page copy is feature-local page chrome (see features/static-pages), NOT domain
// data, so this page imports no repository and no `@tennis/mock-data`.
//
// NOT `overHero` — matching the prototype, content (including the hero photo) starts
// below the fixed 72px header rather than under a transparent header.

export const metadata: Metadata = {
  title: 'About — Tennis World',
  description:
    'Tennis World is a curated atlas of the world’s most beautiful tennis courts — a guide to atmosphere, light, and place.',
};

export default function AboutRoute() {
  return (
    <AppShell unlocked={false}>
      <AboutPage />
    </AppShell>
  );
}
