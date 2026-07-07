import type { Metadata } from 'next';
import { AppShell } from '@/components/layout';
import { LegalPage, privacyContent } from '@/features/static-pages';
import { isSignedIn } from '@/lib/session.server';

// Privacy page (`/privacy`) — a static, sectioned legal screen (Feature 29).
// Resolves the footer "Company → Privacy" link.
//
// SERVER component, presentational only. There is NO repository boundary here: the
// legal copy is feature-local page chrome (see features/static-pages/legal-content),
// NOT domain data, so this page imports no repository and no `@tennis/mock-data`.
//
// ⚠️ The copy is PLACEHOLDER legal text — to be replaced with counsel-reviewed
// language before launch (the page's own intro paragraph says so).

export const metadata: Metadata = {
  title: 'Privacy Policy — Tennis World',
  description:
    'How Tennis World collects, uses, and protects your information. Placeholder copy — not final legal text.',
};

export default async function PrivacyRoute() {
  const signedIn = await isSignedIn();
  return (
    <AppShell unlocked={false} signedIn={signedIn}>
      <LegalPage content={privacyContent} />
    </AppShell>
  );
}
