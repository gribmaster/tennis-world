import Image from 'next/image';
import type { ArticleDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { PendingLink, PendingCardLink } from '@/components/navigation';

// HomeJournalTeaser — the v2 journal list (Feature 74), rebuilt from the prototype's
// HomeScreen (design_v2_stripped.html:602–623).
//
// Prototype geometry, from the file:
//   • section `padding:'28px 20px 40px'` (line 603); `.sec-hdr` with the serif 20px title
//     and the 13px stone "View all" (lines 604–607).
//   • the list is a vertical stack at `gap:12` — NOT a scrolling strip (line 608).
//   • card: `background:'var(--ivory)'`, `borderRadius:14` (line 610); image band
//     `height:160` (line 611); a gold tag chip at `top:10 left:12`, 9px/600, 0.12em,
//     uppercase, pill (line 617); text block `padding:'14px 14px 16px'` holding the serif
//     20px title and a 13px stone blurb at `marginTop:5`, `lineHeight:1.45` (lines
//     619–621).
//   • ONE template for every article (the prototype's own note, line 602) — no alternate
//     "guide" card.
//
// The prototype's tag is a made-up NEW/TRAVEL/PLACES vocabulary; the real chip is
// `article.category`, which is the field that actually exists on `ArticleDTO`.
//
// `/journal` STAYS REACHABLE (brief §8): Feature 84 drops Journal from the bottom tab bar,
// so this section's "View all" link is about to become the app's primary route into that
// surface. It points at `/journal` (the section index), not only at individual articles,
// and must not be reduced to article links alone.
//
// PRESENTATIONAL & data-driven: articles arrive as a prop from `app/page.tsx`, the single
// repository boundary. No fetching, no @tennis/mock-data.
//
// PENDING STATES (CLAUDE.md §4 rule 1): whole card navigates ⇒ `PendingCardLink`; the
// "View all" link ⇒ `PendingLink`. Nothing here mutates.

export interface HomeJournalTeaserProps {
  articles: ArticleDTO[];
  title?: string;
  cta?: { label: string; href: string };
}

const DEFAULT_TITLE = 'Journal';
const DEFAULT_CTA = { label: 'View all', href: '/journal' } as const;

export function HomeJournalTeaser({
  articles,
  title = DEFAULT_TITLE,
  cta = DEFAULT_CTA,
}: HomeJournalTeaserProps) {
  if (articles.length === 0) return null;

  return (
    <section className="pb-12 pt-7 md:pt-12 home-blog" id="home-blog">
      <PageContainer>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="serif text-[20px] md:text-[36px] font-normal leading-tight text-ink">{title}</h2>
          <PendingLink
            href={cta.href}
            className="body-s shrink-0 text-stone transition-colors hover:text-ink"
          >
            {cta.label}
          </PendingLink>
        </div>

        {/* One template for every article, stacked (prototype line 608). On wide screens
            the same cards flow into a grid rather than stretching to 1280px each. */}
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <li key={article.id}>
              <PendingCardLink
                href={`/journal/${article.slug}`}
                ariaLabel={article.title}
                className="block h-full overflow-hidden rounded-[14px] bg-ivory"
              >
                <span className="relative block h-40 overflow-hidden">
                  <Image
                    src={article.heroImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                  <span className="absolute left-3 top-2.5 inline-flex rounded-pill bg-gold px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.12em] text-paper">
                    {article.category}
                  </span>
                </span>
                <span className="block px-3.5 pb-4 pt-3.5">
                  <span className="serif block text-[20px] font-normal leading-tight text-ink">
                    {article.title}
                  </span>
                  {article.subtitle ? (
                    <span className="mt-[5px] block text-[13px] leading-[1.45] text-stone">
                      {article.subtitle}
                    </span>
                  ) : null}
                </span>
              </PendingCardLink>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
