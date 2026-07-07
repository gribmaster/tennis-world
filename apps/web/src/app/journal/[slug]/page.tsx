import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell, PageContainer } from '@/components/layout';
import {
  ArticleHero,
  ArticleByline,
  ArticleBody,
  ArticleRelated,
} from '@/features/journal-detail';
import { repositories } from '@/lib/repositories';

// Journal Detail page (`/journal/[slug]`) — a Phase-1 screen (Feature 18). Resolves
// the per-article links already emitted by the /journal cards and HomeJournalTeaser
// (both point at /journal/{slug}).
//
// This is a SERVER component and the ONLY repository boundary on the screen: it
// resolves the article by slug, 404s if it doesn't exist, fetches the related
// articles, and passes the DTOs down as props. The feature-local components (hero +
// byline + body + related) stay presentational and never fetch.
//
// Repository methods used (already exist — no repository/contract-method changes):
//   • repositories.journal.getBySlug(slug) → ArticleDTO | null
//   • repositories.journal.list()          → ArticleDTO[]  (for "More from the
//     Journal": the page filters out the current slug and takes 3, avoiding a
//     getRelated() interface addition — Feature 31).
//
// Phase-1 scope: mock-first, presentational only. No auth, no payments, no API.
//
// NOT `overHero` — the article hero is a contained ivory band (matching the /journal
// list hero), not a full-bleed transparent-header hero, so the header uses its
// standard solid bar + 72px offset.

export async function generateMetadata({
  params,
}: {
  // Next 15: `params` is async and must be awaited.
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await repositories.journal.getBySlug(slug);
  if (!article) return { title: 'Journal — Tennis World' };
  return {
    title: `${article.title} — Tennis World`,
    description: article.subtitle ?? article.title,
  };
}

export default async function JournalDetailPage({
  params,
}: {
  // Next 15: `params` is async and must be awaited.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const article = await repositories.journal.getBySlug(slug);
  if (!article) {
    // Renders the default framework 404 — no custom not-found page needed.
    notFound();
  }

  // "More from the Journal" — fetch the full list, exclude the current article by
  // slug, and take 3. Page-level (not a repository getRelated()) to avoid an interface
  // change; handles fewer than 3 siblings gracefully (slice never over-reads, and
  // <ArticleRelated> renders nothing for an empty list).
  const related = (await repositories.journal.list())
    .filter((a) => a.slug !== article.slug)
    .slice(0, 3);

  return (
    <AppShell unlocked={false}>
      <ArticleHero article={article} />

      {/* Readable, mobile-first article column: a narrow max-width text measure that
          stays centered on desktop. */}
      <PageContainer as="article" className="py-section-lg md:py-section-xl">
        <div className="mx-auto max-w-[680px]">
          {/* Byline row: author avatar/name + published date + inert Share. */}
          <ArticleByline article={article} className="mb-9" />
          <ArticleBody article={article} dropCap />
        </div>
      </PageContainer>

      {/* "More from the Journal" related grid (ivory band before the footer). */}
      <ArticleRelated articles={related} />
    </AppShell>
  );
}
