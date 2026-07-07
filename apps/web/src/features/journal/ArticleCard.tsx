import Link from 'next/link';
import Image from 'next/image';
import type { ArticleDTO } from '@tennis/contracts';

// ArticleCard — one entry in the Journal, ported from the article cards in
// files/journal.html: a cover image, a category (clay accent) · read-time meta line,
// a serif title, and the subtitle. Matches the treatment already used by
// HomeJournalTeaser.
//
// Two layouts via `variant`:
//   • `featured` → the prototype's lead article: a bordered 2-column card (4:3 image
//     beside the text), stacking to 1 column on mobile, with a larger display title.
//   • `default`  → the 16:9 grid card used for the rest of the list.
//
// PRESENTATIONAL & data-driven (Phase 1 §4):
//   • Receives the article via the `article` prop — it does NOT call a repository and
//     does NOT import @tennis/mock-data. The page (a server component) fetches and
//     passes the DTO in.
//   • Renders only from fields on the DTO. `subtitle` is optional, so it renders only
//     when present (graceful fallback). `publishedAt` is formatted only if it parses.
//   • The whole card links to `/journal/{slug}` — that detail route is NOT built in
//     this feature, but the link is wired now per the prompt.

/** Format an ISO-8601 date to a readable label, or `null` if it can't be parsed. */
function formatPublishedDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** The category · read-time · date meta line shared by both variants. */
function ArticleMeta({ article }: { article: ArticleDTO }) {
  const published = formatPublishedDate(article.publishedAt);
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="eyebrow text-clay">{article.category}</span>
      <span className="eyebrow text-mist">·</span>
      <span className="eyebrow text-stone">{article.readTimeMinutes} min read</span>
      {published ? (
        <>
          <span className="eyebrow text-mist">·</span>
          <time dateTime={article.publishedAt} className="eyebrow text-stone">
            {published}
          </time>
        </>
      ) : null}
    </p>
  );
}

export interface ArticleCardProps {
  article: ArticleDTO;
  /** `featured` renders the bordered 2-column lead card; `default` the grid card. */
  variant?: 'default' | 'featured';
  /** Prioritize image loading (above-the-fold cards only). */
  priority?: boolean;
  className?: string;
}

export function ArticleCard({
  article,
  variant = 'default',
  priority = false,
  className,
}: ArticleCardProps) {
  const href = `/journal/${article.slug}`;

  if (variant === 'featured') {
    return (
      <Link
        href={href}
        aria-label={article.title}
        className={['court-card group block border border-hairline', className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image
              src={article.heroImageUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              priority={priority}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          </div>
          <div className="flex flex-col justify-center bg-ivory p-[clamp(28px,4vw,56px)]">
            <ArticleMeta article={article} />
            <h2 className="display-m mt-4 text-ink">{article.title}</h2>
            {article.subtitle ? (
              <p className="body-l mt-4 text-graphite">{article.subtitle}</p>
            ) : null}
            <span className="eyebrow mt-7 inline-flex items-center gap-2 text-ink">
              Read
              <ArrowGlyph />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label={article.title}
      className={['court-card group block', className ?? ''].filter(Boolean).join(' ')}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <Image
          src={article.heroImageUrl}
          alt=""
          fill
          sizes="(max-width: 480px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={priority}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </div>
      <div className="pt-[18px]">
        <ArticleMeta article={article} />
        <h3 className="serif mt-2.5 text-[clamp(18px,1.5vw,22px)] font-medium leading-tight text-ink">
          {article.title}
        </h3>
        {article.subtitle ? <p className="body-m mt-2 text-stone">{article.subtitle}</p> : null}
      </div>
    </Link>
  );
}

function ArrowGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
