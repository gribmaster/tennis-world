import Image from 'next/image';
import Link from 'next/link';
import type { ArticleDTO } from '@tennis/contracts';
import { ArticleMeta } from './ArticleMeta';

// ArticleHero — the editorial hero for a single journal article
// (/journal/[slug]). It echoes the hero treatment of the journal list page
// (files/journal.html: eyebrow category · serif display title · subtitle) but at
// detail scale: a back link to /journal, the category/read-time/date meta line, the
// serif display title, the optional subtitle/summary, and — when present — the hero
// image beneath.
//
// PRESENTATIONAL & data-driven (Phase 1 §4):
//   • Receives the article via the `article` prop — it does NOT call a repository and
//     does NOT import @tennis/mock-data. The page (a server component) fetches and
//     passes the DTO in.
//   • Renders only from fields on the DTO. `subtitle` and `heroImageUrl` are rendered
//     only when present (graceful fallback) — the layout holds without either.
//
// Mobile-first: a single readable column inside the page gutter; the hero image
// (if any) spans the gutter as a wide editorial banner.

function ChevronLeftGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export interface ArticleHeroProps {
  article: ArticleDTO;
}

export function ArticleHero({ article }: ArticleHeroProps) {
  return (
    <header className="border-b border-hairline bg-ivory">
      <div className="container-page py-[clamp(40px,6vw,80px)]">
        {/* Back to the journal index. */}
        <Link
          href="/journal"
          className="eyebrow inline-flex items-center gap-1.5 text-stone transition-colors hover:text-ink"
        >
          <ChevronLeftGlyph />
          Journal
        </Link>

        {/* Centered, readable editorial column. */}
        <div className="mx-auto mt-8 max-w-[760px] text-center">
          <ArticleMeta article={article} className="justify-center" />
          <h1 className="display-l mt-4 text-ink">{article.title}</h1>
          {article.subtitle ? (
            <p className="body-l mx-auto mt-5 max-w-[620px] text-graphite">{article.subtitle}</p>
          ) : null}
        </div>
      </div>

      {/* Hero image — only when the article carries one. Wide editorial banner. */}
      {article.heroImageUrl ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden md:aspect-[21/9]">
          <Image
            src={article.heroImageUrl}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        </div>
      ) : null}
    </header>
  );
}
