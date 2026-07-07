import type { ArticleDTO } from '@tennis/contracts';

// ArticleMeta — the category · read-time · published-date meta line for a single
// article, ported from the meta row in files/journal.html's article cards
// (clay-accent category · stone "{n} min read"). Here it carries the article's
// publishedAt as well, since the detail page has room for it where a card does not.
//
// PRESENTATIONAL & data-driven (Phase 1 §4):
//   • Receives the article via the `article` prop — no repository, no
//     @tennis/mock-data.
//   • Renders only from fields on the DTO. `publishedAt` is formatted only if it
//     parses to a real date; an unparseable value is omitted, never shown raw.
//
// Mirrors the (file-private) ArticleMeta used by the Journal list card so the two
// surfaces read identically; this one is exported because the detail page composes
// it directly.

/** Format an ISO-8601 date to a readable label, or `null` if it can't be parsed. */
function formatPublishedDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export interface ArticleMetaProps {
  article: ArticleDTO;
  className?: string;
}

export function ArticleMeta({ article, className }: ArticleMetaProps) {
  const published = formatPublishedDate(article.publishedAt);

  return (
    <p className={['flex flex-wrap items-center gap-2', className ?? ''].filter(Boolean).join(' ')}>
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
