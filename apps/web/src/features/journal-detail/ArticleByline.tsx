import type { ArticleDTO } from '@tennis/contracts';

// ArticleByline — the hairline-bordered byline row from files/article.html's
// ArticlePage: a circular initials avatar, the author name, the published date, and
// an (inert) Share button, sitting between the subtitle and the article body.
//
// PRESENTATIONAL & data-driven (Phase 1 §4):
//   • Receives the article via props — no repository, no @tennis/mock-data.
//   • `author` is OPTIONAL on the contract. When it is absent the avatar + name
//     degrade away; the row still renders the published date and Share button so the
//     layout holds (matching how subtitle/heroImageUrl already degrade).
//   • The avatar initials are DERIVED here from the author name (exactly as the
//     prototype does: `author.split(' ').map(w => w[0]).join('')`) — there is no
//     `authorInitials` field on the DTO.
//
// The Share button is an INERT placeholder: no Web Share API, no clipboard, no
// analytics. It is recorded in docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md. Rendered as a
// disabled <button> so it carries no behavior and no fake navigation.

/** Derive up-to-two-letter initials from a display name, or `null` if empty. */
function deriveInitials(name: string): string | null {
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join('')
    .toUpperCase();
  return initials || null;
}

/** Format an ISO-8601 date to a readable label, or `null` if it can't be parsed. */
function formatPublishedDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function ShareGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export interface ArticleBylineProps {
  article: ArticleDTO;
  className?: string;
}

export function ArticleByline({ article, className }: ArticleBylineProps) {
  const initials = article.author ? deriveInitials(article.author) : null;
  const published = formatPublishedDate(article.publishedAt);

  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-hairline pb-7',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Circular initials avatar — only when an author (and derivable initials) exist. */}
      {initials ? (
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ink text-bone"
          aria-hidden
        >
          <span className="serif text-sm">{initials}</span>
        </div>
      ) : null}

      <div className="min-w-0">
        {article.author ? (
          <div className="body-m font-medium text-ink">{article.author}</div>
        ) : null}
        {published ? (
          <time dateTime={article.publishedAt} className="body-s text-stone">
            {published}
          </time>
        ) : null}
      </div>

      <div className="flex-1" />

      {/* Inert Share placeholder — see PHASE_1_PLACEHOLDER_CTA_AUDIT.md. No Web Share
          API, no clipboard, no analytics. Disabled so it carries no behavior. */}
      <button
        type="button"
        disabled
        aria-label="Share (coming soon)"
        className="flex h-9 items-center gap-1.5 border border-hairline px-3.5 text-xs text-stone disabled:cursor-not-allowed"
      >
        <ShareGlyph />
        Share
      </button>
    </div>
  );
}
